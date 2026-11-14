package com.darino.app.sms

import android.content.Context
import android.os.PowerManager

/**
 * قفل بیداری کوتاه برای مسیر پیامک.
 *
 * روی اندروید ۱۴/۱۵ وقتی صفحه خاموش است و اپ از «اخیر» کنار زده شده، CPU
 * می‌تواند قبل از رسیدن صدا به `AudioTrack` بخوابد؛ نتیجه‌اش واریزی است که
 * ثبت می‌شود ولی شنیده نمی‌شود. قفل از **قبل از خواندن صندوق ورودی** گرفته
 * می‌شود و تا پایان پخش (که همگام در همان مسیر انجام می‌شود) نگه داشته
 * می‌شود.
 *
 * `setReferenceCounted(false)` عمدی است: هر مسیر مستقل قفل خودش را دارد و
 * رهاکردن یکی نباید قفل مسیر دیگر را آزاد کند. سقف زمانی هم دفاعی است تا
 * اگر مسیر پیامک وسط کار کشته شد، قفل برای همیشه CPU را بیدار نگه ندارد.
 */
object VoiceWakeLock {
  private const val NAME = "darino:voice-pipeline"

  /** بلندتر از بدترین حالت (شبکه + پخش چند جمله) ولی کوتاه‌تر از عمر باتری. */
  private const val TIMEOUT_MS = 90_000L

  fun acquire(context: Context): PowerManager.WakeLock? {
    return try {
      val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return null
      val lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, NAME)
      lock.setReferenceCounted(false)
      lock.acquire(TIMEOUT_MS)
      lock
    } catch (t: Throwable) {
      null
    }
  }

  fun release(lock: PowerManager.WakeLock?) {
    try {
      if (lock != null && lock.isHeld) lock.release()
    } catch (t: Throwable) {
      // نادیده
    }
  }
}
