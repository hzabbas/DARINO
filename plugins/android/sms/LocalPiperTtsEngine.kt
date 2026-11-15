package com.darino.app.sms

import android.content.Context

/**
 * جایگزین سبکِ موتور صدای عصبی روی گوشی برای بیلدهایی که AAR شیرپا و مدل
 * Piper را همراه ندارند (مثلاً بیلد محلی بدون اجرای
 * `node scripts/fetch-sherpa-onnx.mjs`).
 *
 * این فایل عمداً هیچ ایمپورتی از `com.k2fsa.sherpa.onnx` ندارد؛ وگرنه نبودِ
 * AAR کل بیلد اندروید را می‌شکست. اگر قطعات در دسترس باشند، پلاگین
 * `withSherpaTts` همین فایل را با پیاده‌سازی واقعی در
 * `plugins/android/sherpa/LocalPiperTtsEngine.kt` جایگزین می‌کند.
 *
 * رفتار در حالت نبود موتور: [speak] همیشه `false` برمی‌گرداند، پس زنجیره‌ی
 * اعلام به کلیپ‌های آفلاین یا TTS گوشی می‌رسد و هیچ‌وقت سکوت نمی‌شود.
 */
object LocalPiperTtsEngine {
  fun isBundled(context: Context): Boolean = false

  fun isReady(context: Context): Boolean = false

  fun speak(
    context: Context,
    text: String,
    gender: String,
    rate: Float,
    pitch: Float = 0.0f,
    gain: Float = 1.0f,
    speakerId: Int = -1,
    threads: Int = 2
  ): VoicePlaybackResult {
    return VoicePlaybackResult.failure(
      VoiceService.LOCAL,
      "موتور Sherpa-ONNX یا مدل فارسی در این نسخه بسته‌بندی نشده است."
    )
  }

  fun getModelName(context: Context): String = ""

  fun getModelBytes(context: Context): Long = 0L

  fun getNumSpeakers(): Int = 0

  fun resetModel(context: Context): Boolean = false

  fun release() {
    // چیزی برای آزادکردن نیست
  }
}
