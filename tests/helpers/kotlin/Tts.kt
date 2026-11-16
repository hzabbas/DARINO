package android.speech.tts

import android.content.Context
import java.util.Locale

open class UtteranceProgressListener {
  open fun onStart(utteranceId: String?) {}
  open fun onDone(utteranceId: String?) {}
  open fun onError(utteranceId: String?) {}
  open fun onError(utteranceId: String?, errorCode: Int) {}
}

class TextToSpeech(context: Context, listener: OnInitListener) {
  fun interface OnInitListener { fun onInit(status: Int) }
  fun isLanguageAvailable(locale: Locale): Int = LANG_AVAILABLE
  fun setLanguage(locale: Locale): Int = LANG_AVAILABLE
  fun setOnUtteranceProgressListener(listener: UtteranceProgressListener) {}
  fun setSpeechRate(rate: Float): Int = SUCCESS
  fun setPitch(pitch: Float): Int = SUCCESS
  fun speak(text: String, queueMode: Int, params: android.os.Bundle?, id: String): Int = SUCCESS
  fun stop(): Int = SUCCESS
  fun shutdown() {}
  companion object {
    const val SUCCESS = 0
    const val LANG_AVAILABLE = 1
    const val LANG_MISSING_DATA = -1
    const val LANG_NOT_SUPPORTED = -2
    const val QUEUE_FLUSH = 0
  }
}
