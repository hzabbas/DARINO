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
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.sin

/** جمله و تنظیمات آماده‌ی پخش. */
data class VoiceAnnouncement(
  val speech: String,
  val gender: String,
  val playChime: Boolean,
  /** مبلغ تومانی؛ برای چسباندن کلیپ‌های آفلاین لازم است. */
  val amountToman: Long = 0L,
  /** جمله‌ی نمونه‌ی تنظیمات؛ اگر باشد کلیپ آماده‌ی `test_sample.mp3` پخش می‌شود. */
  val isTest: Boolean = false
)

/**
 * گوینده‌ی واریز در پس‌زمینه.
 *
 * کارهایی که انجام می‌دهد:
 *  - فقط واریز واقعی را می‌پذیرد (نه برداشت/رمز/تبلیغ)
 *  - کارت را با چهار رقم آخر کارت/حساب، یا سرشماره‌ی بانک تطبیق می‌دهد
 *  - تکراری‌ها را با امضای پیامک حذف می‌کند
 *  - با AudioFocus موقت و ducking صحبت می‌کند تا موسیقی/مسیریاب ماشین کم شود
 *
 * ترتیب پخش (هر مرحله فقط اگر مرحله‌ی قبل شکست بخورد):
 *  A) جمله‌ی کامل با گوینده‌ی عصبی آنلاین (نام واریزکننده هم خوانده می‌شود)
 *  B) کلیپ‌های عصبی بسته‌بندی‌شده در خود اپ (آفلاین، طبیعی، بدون اینترنت)
 *  C) TTS اندروید با فینگلیسی؛ تا هیچ‌وقت سکوت مطلق نباشد
 *
 * همیشه اول زنگ، بعد جمله. زنگ و جمله از یک مسیر صوتی
 * (`USAGE_MEDIA` + `CONTENT_TYPE_SPEECH`) پخش می‌شوند تا روی بلندگوی گوشی و
 * بلوتوث ماشین شنیده شوند.
 */
object DepositVoiceAnnouncer {
  private const val TAG = "DarinoVoice"
  private const val WAKE_LOCK_TIMEOUT_MS = 20_000L
  private const val SYNTH_TIMEOUT_MS = 4_000L
  private const val PLAY_TIMEOUT_MS = 12_000L
  private const val TTS_TIMEOUT_MS = 8_000L
  private const val TTS_INIT_TIMEOUT_SECONDS = 4L
  private const val CHIME_GAP_MS = 80L
  private const val MIN_AUDIO_BYTES = 500
  private const val UTTERANCE_ID = "darino-deposit-voice"

  /** همان جمله‌ای که دکمه‌ی «تست» در تنظیمات می‌فرستد. */
  private const val TEST_SAMPLE_TEXT = "علی محمدی، هفتاد تومن برات واریز کرد"
  private const val TEST_SAMPLE_AMOUNT = 70_000L

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
        playChime = config.chime,
        amountToman = deposit.amountToman,
        isTest = false
      )
    } catch (t: Throwable) {
      null
    }
  }

  /** پخش جمله‌ی نمونه‌ی تنظیمات؛ نتیجه به جاوااسکریپت برمی‌گردد تا خطا پنهان نماند. */
  fun announceTest(context: Context, text: String, gender: String, playChime: Boolean): Boolean {
    val speech = text.trim()
    if (speech.isEmpty()) return false

    val isSample = speech == TEST_SAMPLE_TEXT
    return play(
      context,
      VoiceAnnouncement(
        speech = speech,
        gender = gender,
        playChime = playChime,
        amountToman = if (isSample) TEST_SAMPLE_AMOUNT else 0L,
        isTest = true
      )
    )
  }

  /**
   * پخش کامل با wake lock، فوکوس صدا، زنگ اختیاری و گوینده.
   * `true` یعنی دست‌کم یک صدا واقعاً پخش شد.
   */
  fun play(context: Context, announcement: VoiceAnnouncement): Boolean {
    val wakeLock = acquireWakeLock(context)
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val focus = requestAudioFocus(audioManager)

    try {
      // دانلود جمله‌ی عصبی همان لحظه شروع می‌شود تا زنگ، انتظار شبکه را بپوشاند.
      val online = AtomicReference<File?>(null)
      val worker = Thread {
        try {
          online.set(NeuralVoiceSynth.synthesize(context, announcement.speech, announcement.gender))
        } catch (t: Throwable) {
          Log.w(TAG, "online voice failed: ${t.message}")
        }
      }
      worker.isDaemon = true
      worker.start()

      if (announcement.playChime) {
        playChime()
        // ۸۰ میلی‌ثانیه سکوت تا سینک سخت‌افزار صدا کامل آزاد شود.
        Thread.sleep(CHIME_GAP_MS)
      }

      worker.join(SYNTH_TIMEOUT_MS)
      val onlineFile = online.get()
      if (onlineFile != null && playFile(onlineFile)) return true

      if (playBundled(context, announcement)) return true

      return speakFallback(context, announcement.speech)
    } catch (t: Throwable) {
      Log.w(TAG, "announcement failed: ${t.message}")
      return false
    } finally {
      abandonAudioFocus(audioManager, focus)
      releaseWakeLock(wakeLock)
    }
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
      .setUsage(AudioAttributes.USAGE_MEDIA)
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
  // مرحله‌ی B: کلیپ‌های بسته‌بندی‌شده
  // -------------------------------------------------------------------------

  private fun playBundled(context: Context, announcement: VoiceAnnouncement): Boolean {
    val gender = if (announcement.gender == "male") "male" else "female"

    if (announcement.isTest && announcement.speech == TEST_SAMPLE_TEXT) {
      val sample = assetFile(context, "voice/$gender/test_sample.mp3")
      if (sample != null && playFile(sample)) return true
      return false
    }

    if (announcement.amountToman <= 0L) return false

    val clips = VoiceClipStitcher.clipsFor(announcement.amountToman) ?: return false
    val stitched = stitch(context, gender, clips) ?: return false
    return playFile(stitched)
  }

  /** کپی یک asset در کش (MediaPlayer با فایل، قابل‌اعتمادتر از descriptor است). */
  private fun assetFile(context: Context, path: String): File? {
    return try {
      val directory = File(context.cacheDir, CACHE_DIR)
      if (!directory.exists()) directory.mkdirs()

      val target = File(directory, "asset-" + path.replace('/', '-'))
      if (target.exists() && target.length() > MIN_AUDIO_BYTES) return target

      val bytes = context.assets.open(path).use { input -> input.readBytes() }
      if (bytes.size <= MIN_AUDIO_BYTES) return null

      FileOutputStream(target).use { output -> output.write(bytes) }
      if (target.length() > MIN_AUDIO_BYTES) target else null
    } catch (t: Throwable) {
      Log.w(TAG, "asset $path unavailable: ${t.message}")
      null
    }
  }

  /**
   * چسباندن کلیپ‌ها در یک فایل MP3.
   *
   * همه‌ی کلیپ‌ها با یک تنظیم (۲۴ کیلوهرتز، مونو، ۴۸ کیلوبیت) ساخته شده‌اند،
   * پس قاب‌های MP3 پشت‌سرهم یک جریان معتبر می‌سازند و پخش بدون مکث انجام
   * می‌شود. هدر ID3 (اگر ابزار ساخت اضافه کرده باشد) بریده می‌شود، چون پخش‌کن
   * آن را وسط جریان نمی‌فهمد.
   */
  private fun stitch(context: Context, gender: String, clips: List<String>): File? {
    return try {
      val directory = File(context.cacheDir, CACHE_DIR)
      if (!directory.exists()) directory.mkdirs()

      val target = File(directory, "stitch-$gender-" + clips.joinToString("_") + ".mp3")
      if (target.exists() && target.length() > MIN_AUDIO_BYTES) return target

      val audio = ByteArrayOutputStream()
      for (clip in clips) {
        val bytes = context.assets.open("voice/$gender/$clip.mp3").use { input -> input.readBytes() }
        audio.write(stripId3(bytes))
      }

      val data = audio.toByteArray()
      if (data.size <= MIN_AUDIO_BYTES) return null

      FileOutputStream(target).use { output -> output.write(data) }
      if (target.length() > MIN_AUDIO_BYTES) target else null
    } catch (t: Throwable) {
      Log.w(TAG, "stitching failed: ${t.message}")
      null
    }
  }

  /** حذف تگ ID3v2 از ابتدا و ID3v1 از انتهای بایت‌های MP3. */
  private fun stripId3(bytes: ByteArray): ByteArray {
    var start = 0
    var end = bytes.size

    if (bytes.size >= 10 && bytes[0].toInt() == 0x49 && bytes[1].toInt() == 0x44 &&
      bytes[2].toInt() == 0x33
    ) {
      val size = ((bytes[6].toInt() and 0x7F) shl 21) or
        ((bytes[7].toInt() and 0x7F) shl 14) or
        ((bytes[8].toInt() and 0x7F) shl 7) or
        (bytes[9].toInt() and 0x7F)
      var total = 10 + size
      if ((bytes[5].toInt() and 0x10) != 0) total += 10
      start = minOf(total, bytes.size)
    }

    if (end - start >= 128 &&
      bytes[end - 128].toInt() == 0x54 &&
      bytes[end - 127].toInt() == 0x41 &&
      bytes[end - 126].toInt() == 0x47
    ) {
      end -= 128
    }

    if (start == 0 && end == bytes.size) return bytes
    if (end <= start) return bytes
    return bytes.copyOfRange(start, end)
  }

  // -------------------------------------------------------------------------
  // پخش MP3
  // -------------------------------------------------------------------------

  private fun playFile(file: File): Boolean {
    var player: MediaPlayer? = null
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)

    return try {
      val mediaPlayer = MediaPlayer()
      player = mediaPlayer
      mediaPlayer.setAudioAttributes(audioAttributes())
      mediaPlayer.setVolume(1.0f, 1.0f)

      // مسیر رشته‌ای روی اندروید ۹+ رد می‌شود؛ همیشه از descriptor استفاده کن.
      FileInputStream(file).use { input ->
        mediaPlayer.setDataSource(input.fd)
        mediaPlayer.prepare()
      }

      mediaPlayer.setOnCompletionListener { done.countDown() }
      mediaPlayer.setOnErrorListener { _, what, extra ->
        Log.w(TAG, "media error $what/$extra")
        failed.set(true)
        done.countDown()
        true
      }

      mediaPlayer.start()

      val finished = done.await(PLAY_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      if (!finished) Log.w(TAG, "playback timed out")
      finished && !failed.get()
    } catch (t: Throwable) {
      Log.w(TAG, "playback failed: ${t.message}")
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
  // مرحله‌ی C: TTS اندروید (فارسی یا فینگلیسی)
  // -------------------------------------------------------------------------

  private fun speakFallback(context: Context, text: String): Boolean {
    var tts: TextToSpeech? = null
    val ready = CountDownLatch(1)
    val done = CountDownLatch(1)
    val initialized = AtomicBoolean(false)

    try {
      tts = TextToSpeech(context.applicationContext) { status ->
        initialized.set(status == TextToSpeech.SUCCESS)
        ready.countDown()
      }

      if (!ready.await(TTS_INIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) return false
      if (!initialized.get()) return false

      val engine = tts ?: return false
      val persian = Locale("fa", "IR")
      val available = try {
        engine.isLanguageAvailable(persian)
      } catch (t: Throwable) {
        TextToSpeech.LANG_NOT_SUPPORTED
      }

      val usePersian = available >= TextToSpeech.LANG_AVAILABLE
      val spoken = if (usePersian) text else PersianFinglish.transliterate(text)
      if (spoken.isBlank()) return false

      val language = try {
        engine.setLanguage(if (usePersian) persian else Locale.US)
      } catch (t: Throwable) {
        TextToSpeech.LANG_NOT_SUPPORTED
      }
      if (language == TextToSpeech.LANG_MISSING_DATA ||
        language == TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        return false
      }

      engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
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

      engine.setSpeechRate(1.0f)
      if (engine.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID) !=
        TextToSpeech.SUCCESS
      ) {
        return false
      }

      val finished = done.await(TTS_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      if (!finished) Log.w(TAG, "tts timed out")
      return finished
    } catch (t: Throwable) {
      Log.w(TAG, "tts failed: ${t.message}")
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

  private const val CACHE_DIR = "voice-announcer"
}
