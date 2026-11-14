package com.darino.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * آلارم نگهبان: فرایند را بیدار می‌کند و سرویس دائمی را برمی‌گرداند.
 *
 * آلارم عمداً به یک گیرنده می‌رود (نه مستقیم به سرویس) تا اگر اندروید ۱۲+ شروع
 * سرویس پیش‌زمینه از پس‌زمینه را رد کرد، استثنا به کرش اپ تبدیل نشود؛ همان‌جا
 * گرفتن می‌شود و در عوض یک بررسی صندوق پیامک انجام می‌دهد تا واریز بی‌صدا نماند.
 *
 * زنجیره‌ی آلارم خودش را هم تمدید می‌کند: هر بار که این گیرنده اجرا شود، آلارم
 * بعدی ست می‌شود. اگر اپ خاموش شود، زنجیره تا وقتی کاربر اعلام صوتی را خاموش
 * نکرده ادامه دارد.
 */
class WakeReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != VoiceGuardScheduler.ACTION_WAKE) return

    val app = context.applicationContext
    var alive = false

    try {
      alive = VoiceGuardScheduler.isAlive(app)
      VoiceAnnouncerService.start(app)
      // زنجیره‌ی نگهبان را برای دور بعد تمدید کن (اگر اعلام صوتی روشن باشد).
      VoiceGuardScheduler.scheduleWatchdog(app, VoiceGuardScheduler.WATCHDOG_INTERVAL_MS)
      if (alive) return
    } catch (t: Throwable) {
      Log.w(TAG, "guard wake failed: ${t.message}")
    }

    // سرویس زنده نبود: همان‌جا صندوق را بررسی کن تا واریزهای این بازه از دست نروند.
    val pending = goAsync()
    Thread {
      try {
        SmsInboxChecker.request(app)
      } catch (t: Throwable) {
        Log.w(TAG, "guard catch-up failed: ${t.message}")
      } finally {
        try {
          pending.finish()
        } catch (t: Throwable) {
          // نادیده
        }
      }
    }.start()
  }

  private companion object {
    const val TAG = "DarinoVoice"
  }
}
