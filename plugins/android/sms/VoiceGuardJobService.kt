package com.darino.app.sms

import android.app.job.JobParameters
import android.app.job.JobService
import android.util.Log

/**
 * کار دوره‌ای پایدار (`JobScheduler`) برای زنده نگه‌داشتن سرویس اعلام واریز.
 *
 * این کار با `setPersisted(true)` ثبت می‌شود، پس بعد از بوت و مرگ فرایند هم
 * زمان‌بندی‌اش در سیستم می‌ماند. هر ۱۵ دقیقه سرویس را صدا می‌زند و اگر سرویس
 * بالا نیامد (مثلاً ROM اجازه نداد) خودش صندوق پیامک را بررسی می‌کند تا
 * دست‌کم واریزهای عقب‌مانده اعلام شوند.
 *
 * مدت اجرا کوتاه است: کار روی یک رشته‌ی جدا انجام می‌شود و بلافاصله
 * `jobFinished` صدا زده می‌شود تا سیستم کار را مصرف‌شده حساب کند.
 */
class VoiceGuardJobService : JobService() {

  override fun onStartJob(params: JobParameters?): Boolean {
    val app = applicationContext
    Thread {
      try {
        if (VoiceConfigStore.read(app).enabled) {
          VoiceAnnouncerService.start(app)
          VoiceGuardScheduler.ensure(app)
          SmsInboxChecker.request(app)
        }
      } catch (t: Throwable) {
        Log.w(TAG, "guard job failed: ${t.message}")
      } finally {
        try {
          jobFinished(params, false)
        } catch (t: Throwable) {
          // نادیده: کار ممکن است قبلاً تمام شده باشد
        }
      }
    }.start()
    return true
  }

  /** اگر سیستم کار را قطع کرد، دوباره زمان‌بندی شود. */
  override fun onStopJob(params: JobParameters?): Boolean = true

  private companion object {
    const val TAG = "DarinoVoice"
  }
}
