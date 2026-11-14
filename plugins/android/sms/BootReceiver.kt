package com.darino.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * سرویس دائمی اعلام واریز را بعد از روشن‌شدن گوشی و بعد از به‌روزرسانی اپ
 * دوباره بالا می‌آورد.
 *
 * اندروید با ری‌استارت، همه‌ی سرویس‌ها و آلارم‌ها را می‌کشد؛ بدون این گیرنده،
 * اعلام صوتی تا اولین باز شدن دستی دارینو خاموش می‌ماند. اگر اعلام صوتی خاموش
 * باشد، [VoiceAnnouncerService.start] کاری نمی‌کند.
 *
 * `BOOT_COMPLETED` و `MY_PACKAGE_REPLACED` جزو معافیت‌های «شروع سرویس
 * پیش‌زمینه از پس‌زمینه» در اندروید ۱۲+ هستند، پس این‌جا استثنا نمی‌خوریم.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        "android.intent.action.QUICKBOOT_POWERON",
        "com.htc.intent.action.QUICKBOOT_POWERON" -> {
          val app = context.applicationContext
          VoiceAnnouncerService.start(app)
          // زنجیره‌ی نگهبان و جاب پایدار هم بعد از بوت دوباره ست می‌شوند.
          VoiceGuardScheduler.ensure(app)
        }
      }
    } catch (t: Throwable) {
      Log.w("DarinoVoice", "boot restart failed: ${t.message}")
    }
  }
}
