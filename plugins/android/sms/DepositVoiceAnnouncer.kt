package com.darino.app.sms

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Build
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.sin

/** جمله و تنظیمات آماده‌ی پخش. */
data class VoiceAnnouncement(
  val speech: String,
  val gender: String,
  val playChime: Boolean
)

/**
 * گوینده‌ی واریز در پس‌زمینه.
 *
 * کارهایی که انجام می‌دهد:
 *  - فقط واریز واقعی را می‌پذیرد (نه برداشت/رمز/تبلیغ)
 *  - کارت را با چهار رقم آخر کارت/حساب، یا سرشماره‌ی بانک تطبیق می‌دهد
 *  - تکراری‌ها را با امضای پیامک حذف می‌کند
 *  - با AudioFocus موقت و ducking صحبت می‌کند تا موسیقی/مسیریاب ماشین کم شود
 *  - اول گوینده‌ی عصبی، بعد TTS خود اندروید
 */
object DepositVoiceAnnouncer {
  private const val WAKE_LOCK_TIMEOUT_MS = 15_000L
  private const val PLAY_TIMEOUT_SECONDS = 8L
  private const val TTS_TIMEOUT_SECONDS = 8L

  private val focusListener = AudioManager.OnAudioFocusChangeListener { }

  /** اگر این پیامک باید اعلام شود، جمله‌ی آماده را برمی‌گرداند و تکراری را علامت می‌زند. */
  fun prepare(
    context: Context,
    sender: String,
    body: String,
    fingerprint: String
  ): VoiceAnnouncement? {
    return try {
      val config = VoiceConfigStore.read(context)
      if (!config.enabled) return null

      val deposit = DepositSmsParser.parse(body) ?: return null
      if (!matchesAnyAccount(config, sender, body)) return null
      if (!VoiceConfigStore.shouldAnnounce(context, fingerprint)) return null

      VoiceAnnouncement(
        speech = DepositSpeech.buildColloquialDepositSpeech(deposit.amountToman, deposit.payerName),
        gender = config.gender,
        playChime = config.chime
      )
    } catch (t: Throwable) {
      null
    }
  }

  /** پخش کامل با wake lock، فوکوس صدا، زنگ اختیاری و گوینده. */
  fun play(context: Context, announcement: VoiceAnnouncement) {
    val wakeLock = acquireWakeLock(context)
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val focus = requestAudioFocus(audioManager)

    try {
      if (announcement.playChime) {
        playChime()
      }

      val file = NeuralVoiceSynth.synthesize(context, announcement.speech, announcement.gender)
      val played = if (file != null) playFile(file) else false

      if (!played) {
        speakWithAndroidTts(context, announcement.speech)
      }
    } catch (t: Throwable) {
      // صدا پخش نشد؛ هیچ‌چیز نباید بشکند
    } finally {
      abandonAudioFocus(audioManager, focus)
      releaseWakeLock(wakeLock)
    }
  }

  /** پخش یک جمله‌ی دلخواه؛ برای دکمه‌ی «تست صدای گوینده» در تنظیمات. */
  fun playText(context: Context, text: String, gender: String, playChime: Boolean) {
    play(context, VoiceAnnouncement(text, gender, playChime))
  }

  // -------------------------------------------------------------------------
  // تطبیق حساب
  // -------------------------------------------------------------------------

  private fun digitsOnly(raw: String): String {
    return SmsSender.toLatinDigits(raw).replace(Regex("[^0-9]"), "")
  }

  private fun lastFour(raw: String): String {
    val digits = digitsOnly(raw)
    return if (digits.length >= 4) digits.takeLast(4) else ""
  }

  private fun matchesAnyAccount(config: VoiceConfig, sender: String, body: String): Boolean {
    val voiceAccounts = config.accounts.filter { it.announceVoice }
    if (voiceAccounts.isEmpty()) return false

    val bodyDigits = digitsOnly(body)
    val normalizedSender = SmsSender.normalize(sender)

    for (account in voiceAccounts) {
      val card = lastFour(account.cardNumber)
      if (card.isNotEmpty() && bodyDigits.contains(card)) return true

      val accountSuffix = lastFour(account.accountNumber)
      if (accountSuffix.isNotEmpty() && bodyDigits.contains(accountSuffix)) return true
    }

    // اگر شماره کارت در متن نبود، سرشماره‌ی بانک تعیین می‌کند
    for (account in voiceAccounts) {
      if (account.senders.any { saved -> SmsSender.matches(saved, sender) }) return true

      val key = account.bankKey.trim().lowercase()
      if (key.length >= 3 && normalizedSender.contains(key)) return true
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Wake lock
  // -------------------------------------------------------------------------

  private fun acquireWakeLock(context: Context): PowerManager.WakeLock? {
    return try {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        ?: return null
      val lock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "darino:deposit-voice"
      )
      lock.setReferenceCounted(false)
      lock.acquire(WAKE_LOCK_TIMEOUT_MS)
      lock
    } catch (t: Throwable) {
      null
    }
  }

  private fun releaseWakeLock(lock: PowerManager.WakeLock?) {
    try {
      if (lock != null && lock.isHeld) lock.release()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  // -------------------------------------------------------------------------
  // فوکوس صدا (ducking)
  // -------------------------------------------------------------------------

  private fun audioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }

  private class FocusHandle(val request: AudioFocusRequest?, val granted: Boolean)

  private fun requestAudioFocus(audioManager: AudioManager?): FocusHandle {
    if (audioManager == null) return FocusHandle(null, false)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(audioAttributes())
          .setWillPauseWhenDucked(false)
          .build()
        val granted = audioManager.requestAudioFocus(request) ==
          AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        FocusHandle(request, granted)
      } else {
        @Suppress("DEPRECATION")
        val granted = audioManager.requestAudioFocus(
          focusListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        FocusHandle(null, granted)
      }
    } catch (t: Throwable) {
      FocusHandle(null, false)
    }
  }

  private fun abandonAudioFocus(audioManager: AudioManager?, focus: FocusHandle) {
    if (audioManager == null || !focus.granted) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        focus.request?.let { audioManager.abandonAudioFocusRequest(it) }
      } else {
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(focusListener)
      }
    } catch (t: Throwable) {
      // نادیده
    }
  }

  // -------------------------------------------------------------------------
  // زنگ کوتاه
  // -------------------------------------------------------------------------

  /** دو نت نرم (~۲۶۰ میلی‌ثانیه) بدون فایل صوتی؛ کاملاً برنامه‌ای ساخته می‌شود. */
  private fun playChime() {
    var track: AudioTrack? = null
    val sampleRate = 44_100
    val durationMs = 260
    val totalSamples = sampleRate * durationMs / 1000

    try {
      val samples = ShortArray(totalSamples)
      for (index in 0 until totalSamples) {
        val time = index.toDouble() / sampleRate
        val frequency = if (index < totalSamples / 2) 880.0 else 1_320.0
        val fade = when {
          index < totalSamples * 0.08 -> index / (totalSamples * 0.08)
          index > totalSamples * 0.82 -> (totalSamples - index) / (totalSamples * 0.18)
          else -> 1.0
        }
        val amplitude = 0.20 * fade
        samples[index] = (sin(2 * PI * frequency * time) * amplitude * Short.MAX_VALUE)
          .toInt()
          .toShort()
      }

      track = AudioTrack.Builder()
        .setAudioAttributes(audioAttributes())
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(samples.size * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()

      track.write(samples, 0, samples.size)
      track.play()
      Thread.sleep(durationMs.toLong())
    } catch (t: Throwable) {
      // زنگ نپخشید؛ جمله مهم‌تر است
    } finally {
      try {
        track?.stop()
      } catch (t: Throwable) {
        // نادیده
      }
      try {
        track?.release()
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }

  // -------------------------------------------------------------------------
  // پخش MP3 عصبی
  // -------------------------------------------------------------------------

  private fun playFile(file: java.io.File): Boolean {
    var player: MediaPlayer? = null
    val done = CountDownLatch(1)

    return try {
      player = MediaPlayer()
      player.setAudioAttributes(audioAttributes())
      player.setDataSource(file.absolutePath)
      player.setOnCompletionListener { done.countDown() }
      player.setOnErrorListener { _, _, _ ->
        done.countDown()
        true
      }
      player.prepare()
      player.start()

      // اگر پخش به هر دلیلی گیر کرد، از این جمله می‌گذریم تا گیرنده قفل نماند.
      done.await(PLAY_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      true
    } catch (t: Throwable) {
      false
    } finally {
      try {
        player?.stop()
      } catch (t: Throwable) {
        // نادیده
      }
      try {
        player?.release()
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }

  // -------------------------------------------------------------------------
  // TTS آفلاین اندروید
  // -------------------------------------------------------------------------

  private fun speakWithAndroidTts(context: Context, text: String): Boolean {
    var tts: TextToSpeech? = null
    val initialized = CountDownLatch(1)
    val done = CountDownLatch(1)
    var initSucceeded = false

    try {
      tts = TextToSpeech(context.applicationContext) { status ->
        initSucceeded = status == TextToSpeech.SUCCESS
        initialized.countDown()
      }

      if (!initialized.await(4, TimeUnit.SECONDS)) return false
      if (!initSucceeded) return false

      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
          // نادیده
        }

        override fun onDone(utteranceId: String?) {
          done.countDown()
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          done.countDown()
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
          done.countDown()
        }
      })

      val languageResult = tts.setLanguage(Locale("fa", "IR"))
      if (languageResult == TextToSpeech.LANG_MISSING_DATA ||
        languageResult == TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        return false
      }

      tts.setSpeechRate(1.0f)
      val speakResult = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "darino-deposit-voice")
      if (speakResult != TextToSpeech.SUCCESS) return false

      done.await(TTS_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      return true
    } catch (t: Throwable) {
      return false
    } finally {
      try {
        tts?.stop()
      } catch (t: Throwable) {
        // نادیده
      }
      try {
        tts?.shutdown()
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }
}
