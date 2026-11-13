package com.darino.app.sms

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * گیرنده‌ی سبک پیامک.
 *
 * فقط برای پیامک‌هایی بیدار می‌شود که فرستنده‌شان در لیست بانک‌های کاربر باشد؛
 * پیامک را در صف ذخیره می‌کند و یک نوتیفیکیشن کوتاه نشان می‌دهد. هیچ سرویس یا
 * حلقه‌ی پس‌زمینه‌ای اجرا نمی‌شود.
 */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = try {
      Telephony.Sms.Intents.getMessagesFromIntent(intent)
    } catch (error: Exception) {
      null
    } ?: return

    val senders = SmsStore.getSenders(context)
    if (senders.isEmpty()) return

    for (message in messages) {
      val sender = message.displayOriginatingAddress?.trim() ?: continue
      val body = message.displayMessageBody ?: continue
      if (body.isBlank()) continue

      val isKnown = senders.any { saved ->
        val normalizedSaved = saved.trim()
        normalizedSaved.equals(sender, ignoreCase = true) ||
          sender.contains(normalizedSaved, ignoreCase = true)
      }
      if (!isKnown) continue

      SmsStore.enqueue(context, sender, body, System.currentTimeMillis())
      showNotification(context, sender, body)
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

  private fun showNotification(context: Context, sender: String, body: String) {
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

    val pendingIntent = PendingIntent.getActivity(
      context,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_chat)
      .setContentTitle(summary.first)
      .setContentText(summary.second)
      .setStyle(NotificationCompat.BigTextStyle().bigText(summary.second))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    try {
      manager.notify(sender.hashCode() + (System.currentTimeMillis() % 1000).toInt(), notification)
    } catch (error: SecurityException) {
      // بدون مجوز نوتیفیکیشن، ثبت در صف انجام شده و کافی است
    }
  }

  /** خلاصه‌ی فارسی برای نوتیفیکیشن؛ فقط برای نمایش، نه ثبت داده. */
  private fun summarize(body: String): Pair<String, String> {
    val normalized = body
      .replace("\u200c", " ")
      .replace(",", "")
      .replace("٬", "")

    val amountMatch = Regex("([0-9]{4,})").find(normalized)
    val rial = amountMatch?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    val toman = if (rial > 0) rial / 10 else 0L
    val formatted = toPersian(String.format("%,d", toman))

    val isIncome = normalized.contains("نشست") || normalized.contains("واریز") ||
      normalized.contains("بستانکار") || normalized.contains("دریافت")
    val isTransfer = normalized.contains("انتقال") && normalized.contains("مانده")

    val title = when {
      isTransfer -> "انتقال بانکی تشخیص داده شد: $formatted تومان"
      isIncome -> "واریز به حساب: +$formatted تومان"
      else -> "برداشت از حساب: -$formatted تومان"
    }

    val balanceMatch = Regex("(?:مانده|موجودی)\\s*[:：]?\\s*([0-9]{3,})").find(normalized)
    val balance = balanceMatch?.groupValues?.get(1)?.toLongOrNull()?.let { toPersian(String.format("%,d", it / 10)) }

    val detail = if (balance != null) {
      "موجودی جدید: $balance تومان • برای انتخاب دسته‌بندی لمس کنید"
    } else {
      "برای انتخاب دسته‌بندی لمس کنید"
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
