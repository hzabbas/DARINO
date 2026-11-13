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

    // پیامک‌های فارسی با کدگذاری UCS-2 می‌آیند و تقریباً همیشه چندبخشی (PDU) هستند.
    // سیستم همه‌ی بخش‌های یک پیامک را در همین intent می‌فرستد، ولی هر بخش یک
    // SmsMessage جداست؛ اگر هر کدام جدا پردازش شود متن ناقص («بلو\nبرداشت زن») به
    // دست تحلیل‌گر می‌رسد و مبلغ/مانده پیدا نمی‌شود. پس بخش‌های هم‌فرستنده به ترتیب
    // رسیدن به هم چسبانده می‌شوند تا یک پیامک کامل بازسازی شود.
    val grouped = LinkedHashMap<String, MutableList<SmsMessage>>()
    for (message in messages) {
      val address = message.displayOriginatingAddress?.trim() ?: continue
      if (address.isEmpty()) continue
      grouped.getOrPut(SmsSender.normalize(address)) { mutableListOf() }.add(message)
    }

    for (parts in grouped.values) {
      val sender = parts.firstOrNull()?.displayOriginatingAddress?.trim() ?: continue
      val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }.trim()
      if (body.isEmpty()) continue

      val isKnown = senders.any { saved -> SmsSender.matches(saved, sender) }
      if (!isKnown) continue

      val timestamp = parts.minOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()
      // امضا همان چیزی است که هم روی نوتیفیکیشن و هم روی ردیف صف می‌نشیند تا با
      // لمس نوتیفیکیشن بتوانیم دقیقاً همین پیامک را در صف تایید پیدا و باز کنیم.
      val fingerprint = SmsSender.normalize(sender) + "|" + timestamp
      SmsStore.enqueue(context, sender, body, timestamp, fingerprint)
      showNotification(context, sender, body, fingerprint)
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

  /**
   * نوتیفیکیشن با لینک عمیق اختصاصی همین پیامک.
   *
   * هر پیامک `requestCode` مخصوص خودش را دارد؛ وگرنه یک PendingIntent مشترک با
   * `FLAG_UPDATE_CURRENT` اضافی پیامک آخر را روی همه‌ی نوتیفیکیشن‌ها می‌گذاشت و
   * لمس هر نوتیفیکیشن همیشه همان تراکنش تازه را باز می‌کرد.
   */
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
    // هم داده‌ی لینک عمیق (که React Native به‌عنوان URL اولیه می‌بیند) و هم extra
    // صریح؛ هر دو مسیر در جاوااسکریپت پشتیبانی می‌شود.
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
      .setSmallIcon(android.R.drawable.stat_notify_chat)
      .setContentTitle(summary.first)
      .setContentText(summary.second)
      .setStyle(NotificationCompat.BigTextStyle().bigText(summary.second))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    try {
      manager.notify(fingerprint.hashCode(), notification)
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
      isTransfer -> "تراکنش جدید بانکی: انتقال داخلی"
      isIncome -> "تراکنش جدید بانکی: واریز +$formatted تومان"
      else -> "تراکنش جدید بانکی: برداشت -$formatted تومان"
    }

    val balanceMatch = Regex("(?:مانده|موجودی)\\s*[:：]?\\s*([0-9]{3,})").find(normalized)
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
