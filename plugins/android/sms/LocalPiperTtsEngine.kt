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

  fun speak(context: Context, text: String, gender: String, rate: Float): Boolean = false

  fun release() {
    // چیزی برای آزادکردن نیست
  }
}
