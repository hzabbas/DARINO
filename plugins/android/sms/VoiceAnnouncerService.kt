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
 * Foreground service ensuring bank deposit announcements survive background kills.
 * Listens via dynamic high-priority SMS receiver and ContentObserver on content://sms.
 */
class VoiceAnnouncerService : Service() {

  private val registered = AtomicBoolean(false)
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "darino-voice-observer").apply { isDaemon = true }
  }

  /** Heartbeat every 5 minutes to confirm service liveness to UI. */
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

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (VoiceConfigStore.read(this).enabled) {
      VoiceGuardScheduler.scheduleRelaunch(this, 10_000L)
    }
  }

  override fun onDestroy() {
    unregisterSources()
    heartbeatHandler.removeCallbacks(heartbeatTask)
    try {
      worker.shutdownNow()
    } catch (t: Throwable) {
      // Ignore
    }
    if (VoiceConfigStore.read(this).enabled) {
      VoiceGuardScheduler.scheduleRelaunch(this, 10_000L)
    }
    super.onDestroy()
  }

  // -------------------------------------------------------------------------
  // Foreground notification
  // -------------------------------------------------------------------------

  private fun startForegroundSafely(): Boolean {
    val notification = try {
      buildNotification()
    } catch (t: Throwable) {
      Log.w(TAG, "notification build failed: ${t.message}")
      return false
    }

    if (Build.VERSION.SDK_INT >= 34) {
      val types = intArrayOf(
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
      for (type in types) {
        try {
          startForeground(NOTIFICATION_ID, notification, type)
          return true
        } catch (t: Throwable) {
          Log.w(TAG, "startForeground(type=$type) failed: ${t.message}")
        }
      }
    }

    return try {
      startForeground(NOTIFICATION_ID, notification)
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
  // SMS observation channels
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
      // Ignore
    }
    try {
      contentResolver.unregisterContentObserver(observer)
    } catch (t: Throwable) {
      // Ignore
    }
  }

  private var lastInboxCheck = 0L
  private fun scheduleInboxCheck() {
    val now = android.os.SystemClock.uptimeMillis()
    if (now - lastInboxCheck < 2_000L) return
    lastInboxCheck = now
    execute { SmsInboxChecker.request(this) }
  }

  private fun execute(block: () -> Unit) {
    try {
      worker.execute(block)
    } catch (t: Throwable) {
      // Worker terminated
    }
  }

  private fun stopGuard() {
    try {
      unregisterSources()
      stopForeground(true)
    } catch (t: Throwable) {
      // Ignore
    }
    stopSelf()
  }

  companion object {
    private const val TAG = "DarinoVoice"
    private const val CHANNEL_ID = "darino_voice_guard"
    private const val NOTIFICATION_ID = 4127
    private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L

    /** Starts foreground service if voice announcer is enabled. */
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
        // Ignore
      }
      try {
        context.stopService(Intent(context, VoiceAnnouncerService::class.java))
      } catch (t: Throwable) {
        // Ignore
      }
    }
  }
}
