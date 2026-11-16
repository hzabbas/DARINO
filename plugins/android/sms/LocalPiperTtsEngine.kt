package com.darino.app.sms

import android.content.Context

/**
 * Lightweight stub for builds without bundled sherpa-onnx AAR and models.
 * Swapped with full implementation by withSherpaTts plugin when bundled.
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
    // No-op in stub
  }
}
