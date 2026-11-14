package com.darino.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * سرویس دائمی اعلام واریز را بعد از روشن‌شدن گوشی و بعد از به‌روزرسانی اپ
 * دوباره بالا می‌آورد.
 *
 * اندروید با ری‌استارت، همه‌ی سرویس‌ها را می‌کشد؛ بدون این گیرنده، اعلام صوتی
 * تا اولین باز شدن دستی دارینو خاموش می‌ماند. اگر اعلام صوتی خاموش باشد،
 * [VoiceAnnouncerService.start] کاری نمی‌کند.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        "android.intent.action.QUICKBOOT_POWERON",
        "com.htc.intent.action.QUICKBOOT_POWERON" ->
          VoiceAnnouncerService.start(context.applicationContext)
      }
    } catch (t: Throwable) {
      Log.w("DarinoVoice", "boot restart failed: ${t.message}")
    }
  }
}
