package com.darino.app.sms

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Lightweight broadcast receiver for incoming SMS messages.
 * Hands off valid messages to SmsPipeline on a worker thread.
 */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    try {
      handle(context, intent)
    } catch (t: Throwable) {
      // Receiver must never throw uncaught exceptions
    }
  }

  private fun handle(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    if (!VoiceAnnouncerService.start(context.applicationContext)) {
      VoiceGuardScheduler.scheduleRelaunch(context.applicationContext, 5_000L)
    }

    val messages = try {
      Telephony.Sms.Intents.getMessagesFromIntent(intent)
    } catch (error: Exception) {
      null
    } ?: return

    // Group multipart SMS PDU segments by sender
    val grouped = LinkedHashMap<String, MutableList<SmsMessage>>()
    for (message in messages) {
      val address = message.displayOriginatingAddress?.trim() ?: continue
      if (address.isEmpty()) continue
      grouped.getOrPut(SmsSender.normalize(address)) { mutableListOf() }.add(message)
    }

    val incoming = mutableListOf<Triple<String, String, Long>>()
    for (parts in grouped.values) {
      val rawSender = parts.firstOrNull()?.displayOriginatingAddress?.trim() ?: continue
      if (rawSender.isEmpty()) continue

      val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }.trim()
      if (body.isEmpty()) continue

      val timestamp = parts
        .mapNotNull { part -> part.timestampMillis.takeIf { it > 0L } }
        .minOrNull()
        ?: System.currentTimeMillis()

      incoming.add(Triple(rawSender, body, timestamp))
    }

    if (incoming.isEmpty()) return

    var pendingResult: BroadcastReceiver.PendingResult? = null
    try {
      pendingResult = goAsync()
      val result = pendingResult
      val appContext = context.applicationContext
      Thread {
        val wakeLock = VoiceWakeLock.acquire(appContext)
        try {
          for ((rawSender, body, timestamp) in incoming) {
            SmsPipeline.handle(appContext, rawSender, body, timestamp) { fingerprint ->
              showNotification(appContext, rawSender, body, fingerprint)
            }
          }
        } catch (t: Throwable) {
          // Ignore
        } finally {
          VoiceWakeLock.release(wakeLock)
          try {
            result?.finish()
          } catch (t: Throwable) {
            // Ignore
          }
        }
      }.start()
    } catch (t: Throwable) {
      try {
        pendingResult?.finish()
      } catch (inner: Throwable) {
        // Ignore
      }
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "پیامک‌های بانکی",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "تراکنش‌های خودکار خوانده‌شده از پیامک بانک‌ها"
    }

    manager.createNotificationChannel(channel)
  }

  /** Shows user notification with deep link to review and categorize the transaction. */
  private fun showNotification(context: Context, sender: String, body: String, fingerprint: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }

    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return

    ensureChannel(context)

    val summary = summarize(body)
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent()
    launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    launchIntent.data = Uri.parse("darino://pending-sms?open=1&sms=" + Uri.encode(fingerprint))
    launchIntent.putExtra(SmsStore.EXTRA_OPEN_PENDING, true)
    launchIntent.putExtra(SmsStore.EXTRA_SMS_FINGERPRINT, fingerprint)

    val pendingIntent = PendingIntent.getActivity(
      context,
      fingerprint.hashCode(),
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(
        context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
      )
      .setContentTitle(summary.first)
      .setContentText(summary.second)
      .setStyle(NotificationCompat.BigTextStyle().bigText(summary.second))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    try {
      manager.notify(fingerprint.hashCode(), notification)
    } catch (t: Throwable) {
      // Ignore notification posting errors
    }
  }

  /** Formats concise notification title and summary in Persian. */
  private fun summarize(body: String): Pair<String, String> {
    val normalized = SmsSender.normalizeBody(body)

    val rial = SmsSender.amountOf(normalized)
    val toman = if (rial > 0) rial / 10 else 0L
    val formatted = toPersian(String.format("%,d", toman))

    val isIncome = normalized.contains("نشست") || normalized.contains("واریز") ||
      normalized.contains("بستانکار") || normalized.contains("دریافت")
    val isTransfer = normalized.contains("انتقال") && normalized.contains("مانده")

    val title = when {
      isTransfer -> "تراکنش جدید بانکی: انتقال داخلی"
      isIncome -> "تراکنش جدید بانکی: واریز +$formatted تومان"
      else -> "تراکنش جدید بانکی: برداشت -$formatted تومان"
    }

    val balanceMatch = Regex("(?:مانده|موجودی)\\s*[:：]?\\s*([0-9]{3,})")
      .find(SmsSender.toLatinDigits(body).replace(",", "").replace("٬", ""))
    val balance = balanceMatch?.groupValues?.get(1)?.toLongOrNull()?.let { toPersian(String.format("%,d", it / 10)) }

    val detail = if (balance != null) {
      "موجودی جدید: $balance تومان • ضربه بزنید تا دسته‌بندی را انتخاب کنید"
    } else {
      "ضربه بزنید تا دسته‌بندی را انتخاب کنید"
    }

    return title to detail
  }

  private fun toPersian(input: String): String {
    val builder = StringBuilder(input.length)
    for (character in input) {
      if (character in '0'..'9') {
        builder.append('۰' + (character - '0'))
      } else {
        builder.append(character)
      }
    }
    return builder.toString()
  }

  private companion object {
    const val CHANNEL_ID = "darino_sms"
  }
}
