package com.darino.app.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * نگهبان دائمی اعلام صوتی واریز.
 *
 * چرا لازم است: در شیائومی (MIUI/HyperOS) و بعضی ROMهای اندروید، وقتی کاربر
 * اپ را از «برنامه‌های اخیر» کنار می‌زند، گیرنده‌ی manifest (SmsReceiver) دیگر
 * بیدار نمی‌شود و پیامک بانکی بی‌صدا می‌ماند. این سرویس پیش‌زمینه دو مسیر
 * موازی دارد تا هیچ واریزی از دست نرود:
 *
 *  ۱. گیرنده‌ی پویای `SMS_RECEIVED` با بالاترین اولویت
 *  ۲. `ContentObserver` روی `content://sms` که هر ردیف تازه‌ی صندوق ورودی را
 *     می‌بیند؛ حتی وقتی broadcast توسط ROM مسدود شده باشد.
 *
 * هر دو مسیر به [SmsPipeline] می‌رسند و با کلید ضدتکرار
 * «فرستنده|مبلغ|دقیقه» دقیقاً یک‌بار اعلام می‌کنند.
 *
 * زنده‌ماندن سرویس سه لایه دارد: اعلان پیش‌زمینه‌ی همیشگی، آلارم زنجیره‌ای و
 * جاب پایدار [VoiceGuardScheduler]. همین سه لایه باعث می‌شوند بستن کامل اپ
 * (کنار زدن از «برنامه‌های اخیر») اعلام را خاموش نکند.
 */
class VoiceAnnouncerService : Service() {

  private val registered = AtomicBoolean(false)
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "darino-voice-observer").apply { isDaemon = true }
  }

  /** ضربان هر ۵ دقیقه؛ تنظیمات با همین می‌فهمد سرویس واقعاً زنده است یا نه. */
  private val heartbeatHandler = Handler(Looper.getMainLooper())
  private val heartbeatTask = object : Runnable {
    override fun run() {
      VoiceGuardScheduler.markAlive(this@VoiceAnnouncerService)
      heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
    }
  }

  private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
    override fun onChange(selfChange: Boolean, uri: Uri?) {
      scheduleInboxCheck()
    }
  }

  private val smsReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      try {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return

        // پیامک فارسی چندبخشی است؛ بخش‌های هم‌فرستنده را به ترتیب می‌چسبانیم.
        val grouped = LinkedHashMap<String, MutableList<SmsMessage>>()
        for (message in messages) {
          val address = message.displayOriginatingAddress?.trim() ?: continue
          if (address.isEmpty()) continue
          grouped.getOrPut(SmsSender.normalize(address)) { mutableListOf() }.add(message)
        }

        for ((_, parts) in grouped) {
          val rawSender = parts.firstOrNull()?.displayOriginatingAddress?.trim() ?: continue
          val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }.trim()
          if (body.isEmpty()) continue
          val timestamp = parts
            .mapNotNull { part -> part.timestampMillis.takeIf { it > 0L } }
            .minOrNull()
            ?: System.currentTimeMillis()

          // پخش جمله چند ثانیه طول می‌کشد؛ روی رشته‌ی کارگر می‌رود تا گیرنده
          // (که روی رشته‌ی اصلی است) هرگز ANR ندهد.
          execute { SmsPipeline.handle(this@VoiceAnnouncerService, rawSender, body, timestamp) }
        }
      } catch (t: Throwable) {
        Log.w(TAG, "dynamic sms receiver failed: ${t.message}")
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val enabled = try {
      VoiceConfigStore.read(this).enabled
    } catch (t: Throwable) {
      false
    }

    if (!enabled) {
      stopGuard()
      return START_NOT_STICKY
    }

    if (!startForegroundSafely()) {
      // بدون اعلان پیش‌زمینه، اندروید سرویس را چند ثانیه بعد می‌کشد؛ بهتر است
      // همین‌جا رها کنیم و با آلارم دوباره تلاش شود.
      VoiceGuardScheduler.scheduleRelaunch(this, 60_000L)
      stopSelf()
      return START_NOT_STICKY
    }

    VoiceGuardScheduler.markAlive(this)
    VoiceGuardScheduler.ensure(this)
    heartbeatHandler.removeCallbacks(heartbeatTask)
    heartbeatHandler.post(heartbeatTask)

    registerSources()
    scheduleInboxCheck()
    return START_STICKY
  }

  /**
   * وقتی کاربر اپ را از «اخیر» کنار می‌زند، اندروید `stopWithTask=false` را
   * نگه می‌دارد ولی بعضی ROMها سرویس را می‌کشند. یک آلارم کوتاه، سرویس را
   * بی‌درنگ برمی‌گرداند.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    VoiceGuardScheduler.scheduleRelaunch(this, 1_500L)
  }

  override fun onDestroy() {
    unregisterSources()
    heartbeatHandler.removeCallbacks(heartbeatTask)
    try {
      worker.shutdownNow()
    } catch (t: Throwable) {
      // نادیده
    }
    // اگر کاربر خودش خاموش نکرده باشد، ROM سرویس را بسته است؛ دوباره بلند شو.
    VoiceGuardScheduler.scheduleRelaunch(this, 2_000L)
    super.onDestroy()
  }

  // -------------------------------------------------------------------------
  // اعلان سرویس
  // -------------------------------------------------------------------------

  /** `false` یعنی اعلان سرویس ساخته نشد (مجوز/رام) و سرویس دوام نمی‌آورد. */
  private fun startForegroundSafely(): Boolean {
    return try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (t: Throwable) {
      Log.w(TAG, "startForeground failed: ${t.message}")
      false
    }
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = if (launch != null) {
      PendingIntent.getActivity(
        this,
        0,
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    } else {
      null
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(
        applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
      )
      .setContentTitle("دارینو فعال است 🚗🔊")
      .setContentText("گوش به زنگ برای اعلام صوتی پیامک‌های واریز")
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setContentIntent(pending)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "سرویس دائمی دارینو",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "نگهبان اعلام صوتی واریز؛ اعلان بی‌صدا و همیشگی است"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_SECRET
    }
    manager.createNotificationChannel(channel)
  }

  // -------------------------------------------------------------------------
  // دو مسیر تشخیص پیامک
  // -------------------------------------------------------------------------

  private fun registerSources() {
    if (!registered.compareAndSet(false, true)) return

    try {
      val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
        priority = Int.MAX_VALUE
      }
      if (Build.VERSION.SDK_INT >= 33) {
        registerReceiver(smsReceiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        registerReceiver(smsReceiver, filter)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "sms receiver registration failed: ${t.message}")
    }

    try {
      contentResolver.registerContentObserver(Uri.parse("content://sms"), true, observer)
      contentResolver.registerContentObserver(Uri.parse("content://sms/inbox"), true, observer)
    } catch (t: Throwable) {
      Log.w(TAG, "sms observer registration failed: ${t.message}")
    }
  }

  private fun unregisterSources() {
    if (!registered.compareAndSet(true, false)) return
    try {
      unregisterReceiver(smsReceiver)
    } catch (t: Throwable) {
      // نادیده: ممکن است هرگز ثبت نشده باشد
    }
    try {
      contentResolver.unregisterContentObserver(observer)
    } catch (t: Throwable) {
      // نادیده
    }
  }

  private fun scheduleInboxCheck() {
    execute { SmsInboxChecker.request(this) }
  }

  private fun execute(block: () -> Unit) {
    try {
      worker.execute(block)
    } catch (t: Throwable) {
      // اجراکننده بسته شده است
    }
  }

  private fun stopGuard() {
    try {
      unregisterSources()
      stopForeground(true)
    } catch (t: Throwable) {
      // نادیده
    }
    stopSelf()
  }

  companion object {
    private const val TAG = "DarinoVoice"
    private const val CHANNEL_ID = "darino_voice_guard"
    private const val NOTIFICATION_ID = 4127
    private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L

    /**
     * سرویس را فقط اگر اعلام صوتی روشن است بالا می‌آورد.
     *
     * `true` یعنی سیستم درخواست را پذیرفت. روی اندروید ۱۲+ اگر اپ در پس‌زمینه
     * باشد و از معافیت باتری/آلارم دقیق استفاده نکند، این درخواست رد می‌شود؛
     * تصمیم «تلاش دوباره» با صداکننده است تا زنجیره‌ی آلارم بی‌نهایت نشود.
     */
    fun start(context: Context): Boolean {
      return try {
        if (!VoiceConfigStore.read(context).enabled) return false
        val intent = Intent(context, VoiceAnnouncerService::class.java)
        ContextCompat.startForegroundService(context, intent)
        true
      } catch (t: Throwable) {
        Log.w(TAG, "service start failed: ${t.message}")
        false
      }
    }

    fun stop(context: Context) {
      try {
        VoiceGuardScheduler.cancel(context)
      } catch (t: Throwable) {
        // نادیده
      }
      try {
        context.stopService(Intent(context, VoiceAnnouncerService::class.java))
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }
}
