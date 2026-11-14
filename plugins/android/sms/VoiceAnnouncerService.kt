package com.darino.app.sms

import android.app.AlarmManager
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
 * هر دو مسیر به یک خط لوله می‌رسند و با کلید ضدتکرار
 * «فرستنده|مبلغ|دقیقه» در [VoiceConfigStore.shouldAnnounce] دقیقاً یک‌بار
 * اعلام می‌کنند. اعلان سرویس کم‌اهمیت، بی‌صدا و همیشگی است تا اندروید آن را
 * نکشد و کاربر هم مزاحمت نبیند.
 */
class VoiceAnnouncerService : Service() {

  private val registered = AtomicBoolean(false)
  private val checkingSms = AtomicBoolean(false)
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "darino-voice-observer").apply { isDaemon = true }
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
          grouped.getOrPut(address) { mutableListOf() }.add(message)
        }

        for ((address, parts) in grouped) {
          val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }.trim()
          if (body.isEmpty()) continue
          val timestamp = parts
            .mapNotNull { part -> part.timestampMillis.takeIf { it > 0L } }
            .minOrNull()
            ?: System.currentTimeMillis()
          processIncoming(address, body, timestamp)
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

    startForegroundSafely()
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
    scheduleRestart(1_500L)
  }

  override fun onDestroy() {
    unregisterSources()
    try {
      worker.shutdownNow()
    } catch (t: Throwable) {
      // نادیده
    }
    // اگر کاربر خودش خاموش نکرده باشد، ROM سرویس را بسته است؛ دوباره بلند شو.
    scheduleRestart(2_000L)
    super.onDestroy()
  }

  // -------------------------------------------------------------------------
  // اعلان سرویس
  // -------------------------------------------------------------------------

  private fun startForegroundSafely() {
    try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "startForeground failed: ${t.message}")
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
    try {
      worker.execute { checkInbox() }
    } catch (t: Throwable) {
      // اجراکننده بسته شده است
    }
  }

  /**
   * ردیف‌های تازه‌ی صندوق ورودی را می‌خواند. فقط پیامک‌های بعد از آخرین زمان
   * پردازش‌شده و از نوع «ورودی» (type == 1) بررسی می‌شوند تا تاریخچه‌ی قدیمی
   * یک‌جا اعلام نشود.
   */
  private fun checkInbox() {
    if (!checkingSms.compareAndSet(false, true)) return
    try {
      val last = VoiceConfigStore.lastProcessedSmsDate(this)
      if (last <= 0L) {
        // اولین اجرا: تاریخچه‌ی موجود را نادیده بگیر و از همین لحظه شروع کن.
        VoiceConfigStore.setLastProcessedSmsDate(this, System.currentTimeMillis())
        return
      }

      var newest = last
      val cursor = contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("address", "body", "date"),
        "date > ?",
        arrayOf(last.toString()),
        "date ASC LIMIT 20"
      )

      cursor?.use { rows ->
        val addressIndex = rows.getColumnIndex("address")
        val bodyIndex = rows.getColumnIndex("body")
        val dateIndex = rows.getColumnIndex("date")

        while (rows.moveToNext()) {
          val date = rows.getLong(dateIndex)
          if (date <= last) continue
          val address = rows.getString(addressIndex)?.trim().orEmpty()
          val body = rows.getString(bodyIndex)?.trim().orEmpty()
          if (date > newest) newest = date
          if (address.isEmpty() || body.isEmpty()) continue
          processIncoming(address, body, date)
        }
      }

      if (newest > last) VoiceConfigStore.setLastProcessedSmsDate(this, newest)
    } catch (t: Throwable) {
      Log.w(TAG, "inbox observer failed: ${t.message}")
    } finally {
      checkingSms.set(false)
    }
  }

  /**
   * خط لوله‌ی مشترک: صف ثبت پیامک + تحلیل واریز + پخش.
   *
   * کلید ضدتکرار عمداً بدون میلی‌ثانیه است تا گیرنده‌ی broadcast و
   * ContentObserver (که مهر زمانی‌شان چند ثانیه فرق دارد) یک پیامک را یک‌بار
   * اعلام کنند.
   */
  private fun processIncoming(sender: String, body: String, timestamp: Long) {
    try {
      val config = VoiceConfigStore.read(this)
      if (!config.enabled) return

      val normalized = SmsSender.normalize(sender)
      if (normalized.isEmpty()) return

      val amount = SmsSender.amountOf(body)
      val hasVoiceAccounts = config.accounts.any { it.announceVoice }
      val senders = SmsStore.getSenders(this)
      val isKnown = senders.any { saved -> SmsSender.matches(saved, sender) }

      // صندوق ورودی همه‌ی پیامک‌ها را دارد؛ پیامک شخصی نباید وارد صف بانکی یا
      // اعلام صوتی شود. همان قاعده‌ی `SmsReceiver`: سرشماره‌ی شناخته‌شده، یا
      // پیامک بانکی‌نما با عددی در حد مبلغ وقتی اعلام صوتی روشن است.
      if (!isKnown && !(hasVoiceAccounts && SmsSender.looksBank(normalized, body) && amount > 0L)) {
        return
      }

      val minute = timestamp / 60_000L
      val dedupeKey = "$normalized|$amount|$minute"
      val fingerprint = "$dedupeKey|$timestamp"

      SmsStore.enqueue(this, sender.trim(), body, timestamp, fingerprint)

      val announcement = DepositVoiceAnnouncer.prepare(this, sender.trim(), body, dedupeKey) ?: return
      DepositVoiceAnnouncer.play(this, announcement)
    } catch (t: Throwable) {
      Log.w(TAG, "incoming sms handling failed: ${t.message}")
    }
  }

  // -------------------------------------------------------------------------
  // شروع دوباره
  // -------------------------------------------------------------------------

  private fun scheduleRestart(delayMs: Long) {
    try {
      if (!VoiceConfigStore.read(this).enabled) return

      val intent = Intent(this, VoiceAnnouncerService::class.java).setAction(ACTION_RESTART)
      val pending = PendingIntent.getForegroundService(
        this,
        RESTART_REQUEST,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val alarm = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      alarm.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + delayMs, pending)
    } catch (t: Throwable) {
      Log.w(TAG, "restart scheduling failed: ${t.message}")
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
    private const val RESTART_REQUEST = 4128
    private const val ACTION_RESTART = "com.darino.app.sms.RESTART_VOICE_GUARD"

    /** سرویس را فقط اگر اعلام صوتی روشن است بالا می‌آورد. */
    fun start(context: Context) {
      try {
        if (!VoiceConfigStore.read(context).enabled) return
        val intent = Intent(context, VoiceAnnouncerService::class.java)
        ContextCompat.startForegroundService(context, intent)
      } catch (t: Throwable) {
        Log.w(TAG, "service start failed: ${t.message}")
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, VoiceAnnouncerService::class.java))
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }
}
