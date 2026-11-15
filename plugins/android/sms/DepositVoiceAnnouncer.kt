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
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/** جمله و تنظیمات آماده‌ی پخش. */
data class VoiceAnnouncement(
  val speech: String,
  /** یکی از سرویس‌های [VoiceService] */
  val service: String,
  val gender: String,
  val playChime: Boolean,
  /** سرعت گفتار؛ ۱ یعنی طبیعی. */
  val rate: Float,
  /** مبلغ تومانی؛ برای چسباندن کلیپ‌های آفلاین لازم است. */
  val amountToman: Long = 0L
)

/**
 * گوینده‌ی واریز در پس‌زمینه.
 *
 * کارهایی که انجام می‌دهد:
 *  - فقط واریز واقعی را می‌پذیرد (نه برداشت/رمز/تبلیغ)
 *  - کارت را با چهار رقم آخر کارت/حساب، یا سرشماره‌ی بانک تطبیق می‌دهد
 *  - تکراری‌ها را با امضای پیامک حذف می‌کند
 *  - جمله را از قالب دلخواه کاربر می‌سازد ([SpeechTemplate])
 *  - با AudioFocus موقت و ducking صحبت می‌کند تا موسیقی/مسیریاب ماشین کم شود
 *
 * در حالت تست فقط موتور انتخاب‌شده پخش می‌شود. Fallback به کلیپ و TTS گوشی فقط
 * در دریافت واقعی پیامک در پس‌زمینه مجاز است تا هیچ واریزی بی‌صدا نماند.
 * جنسیت کلیپ‌ها مستقیماً از `assets/voice/female` یا `assets/voice/male` می‌آید.
 *
 * همیشه اول زنگ، بعد جمله. زنگ و جمله از یک مسیر صوتی
 * (`USAGE_MEDIA` + `CONTENT_TYPE_SPEECH`) پخش می‌شوند تا روی بلندگوی گوشی و
 * بلوتوث ماشین شنیده شوند.
 */
object DepositVoiceAnnouncer {
  private const val TAG = "DarinoVoice"

  /** جمله‌ی نمونه‌ی تست که فایل یک‌نفسش هم کنار اپ بسته‌بندی شده است. */
  private const val SAMPLE_PAYER = "علی محمدی"
  private const val SAMPLE_BANK = "بلوبانک"
  private const val SAMPLE_CARD = "6104337812345678"

  /** قفل بیداری تا پایان صدا؛ پخش Edge/کلیپ نهایتاً چند ثانیه است. */
  private const val WAKE_LOCK_TIMEOUT_MS = 60_000L
  private const val PLAY_TIMEOUT_MS = 25_000L
  private const val TTS_TIMEOUT_MS = 25_000L
  private const val TTS_INIT_TIMEOUT_SECONDS = 4L
  private const val CHIME_GAP_MS = 80L
  private const val MIN_AUDIO_BYTES = 500
  private const val UTTERANCE_ID = "darino-deposit-voice"

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
      val account = VoiceConfig.matchAccountForAnnouncement(config, sender, body) ?: return null
      if (!VoiceConfigStore.shouldAnnounce(context, fingerprint)) return null

      VoiceAnnouncement(
        speech = SpeechTemplate.render(
          config.template,
          deposit.payerName,
          deposit.amountToman,
          account.bankName,
          account.cardNumber
        ),
        service = config.service,
        gender = config.gender,
        playChime = config.chime,
        rate = config.rate,
        amountToman = deposit.amountToman
      )
    } catch (t: Throwable) {
      null
    }
  }

  /**
   * پخش جمله‌ی نمونه‌ی تنظیمات با همان قالب و همان سرویسی که کاربر انتخاب کرده؛
   * نتیجه به جاوااسکریپت برمی‌گردد تا خطا پنهان نماند.
   */
  fun announceTest(
    context: Context,
    template: String?,
    service: String,
    gender: String,
    playChime: Boolean,
    rate: Float,
    amountToman: Long
  ): VoicePlaybackResult {
    val speech = SpeechTemplate.render(template, SAMPLE_PAYER, amountToman, SAMPLE_BANK, SAMPLE_CARD)
    if (speech.isEmpty()) {
      return VoicePlaybackResult.failure(service, "جمله‌ای برای پخش وجود ندارد.")
    }

    return play(
      context,
      VoiceAnnouncement(
        speech = speech,
        service = VoiceService.normalize(service),
        gender = gender,
        playChime = playChime,
        rate = rate,
        amountToman = amountToman
      ),
      allowFallback = false
    )
  }

  /**
   * پخش با یک موتور مشخص. در تست `allowFallback=false` است و هیچ صدای دیگری
   * خطای موتور انتخاب‌شده را پنهان نمی‌کند. فقط پردازش واقعی پیامک در پس‌زمینه
   * اجازه دارد برای پیش‌گیری از ازدست‌رفتن اعلان به کلیپ و سپس TTS برود.
   */
  fun play(
    context: Context,
    announcement: VoiceAnnouncement,
    allowFallback: Boolean = true
  ): VoicePlaybackResult {
    val wakeLock = acquireWakeLock(context)
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val focus = requestAudioFocus(audioManager)
    val service = VoiceService.normalize(announcement.service)
    val rate = VoiceRate.normalize(announcement.rate)

    try {
      if (announcement.playChime) {
        playChime()
        Thread.sleep(CHIME_GAP_MS)
      }

      val result = when (service) {
        VoiceService.LOCAL -> {
          val config = VoiceConfigStore.read(context)
          LocalPiperTtsEngine.speak(
            context,
            announcement.speech,
            announcement.gender,
            rate,
            pitch = config.sherpaPitch,
            gain = config.sherpaGain,
            speakerId = config.sherpaSpeakerId,
            threads = config.sherpaThreads
          )
        }

        VoiceService.NEURAL -> {
          val synthesis = NeuralVoiceSynth.synthesize(
            context, announcement.speech, announcement.gender, rate
          )
          val file = synthesis.audio
          when {
            file != null && playFile(file, 1f) -> VoicePlaybackResult(true, service)
            else -> VoicePlaybackResult.failure(
              service,
              synthesis.message ?: "اتصال به سرویس صوتی آنلاین برقرار نشد"
            )
          }
        }

        VoiceService.CLIPS -> if (playBundled(context, announcement, rate)) {
          VoicePlaybackResult(true, service)
        } else {
          VoicePlaybackResult.failure(
            service,
            "کلیپ‌های «${if (announcement.gender == "male") "مرد" else "زن"}» کامل نیستند یا پخش آن‌ها ممکن نشد."
          )
        }

        else -> if (speakWithSystem(context, announcement.speech, rate)) {
          VoicePlaybackResult(true, VoiceService.SYSTEM)
        } else {
          VoicePlaybackResult.failure(
            VoiceService.SYSTEM,
            "موتور گوینده‌ی گوشی در دسترس نیست. نصب یا فعال‌سازی Text-to-Speech را بررسی کن."
          )
        }
      }

      if (result.ok || !allowFallback) return result

      if (service != VoiceService.CLIPS && playBundled(context, announcement, rate)) {
        return VoicePlaybackResult(true, VoiceService.CLIPS)
      }
      if (speakWithSystem(context, announcement.speech, rate)) {
        return VoicePlaybackResult(true, VoiceService.SYSTEM)
      }
      return result
    } catch (t: Throwable) {
      Log.w(TAG, "announcement failed: ${t.message}")
      return VoicePlaybackResult.failure(service, engineError(service))
    } finally {
      abandonAudioFocus(audioManager, focus)
      releaseWakeLock(wakeLock)
    }
  }

  private fun engineError(service: String): String = when (service) {
    VoiceService.NEURAL -> "اتصال به سرویس صوتی آنلاین برقرار نشد"
    VoiceService.LOCAL -> "موتور آفلاین Sherpa-ONNX یا مدل فارسی آن در دسترس نیست."
    VoiceService.CLIPS -> "کلیپ‌های آفلاین در دسترس نیستند یا پخش نشدند."
    else -> "موتور گوینده‌ی گوشی در دسترس نیست."
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
  // مرحله‌ی آفلاین: کلیپ‌های بسته‌بندی‌شده
  // -------------------------------------------------------------------------

  /**
   * کلیپ‌های آماده فقط «مبلغ + تومن واریز شد» را می‌گویند؛ قالب دلخواه کاربر را
   * نمی‌سازند. عمداً هم همین‌طور است: این مرحله آخرین تور نجات است، نه انتخاب
   * اول کاربر.
   *
   * چسباندن بایتی MP3 کنار گذاشته شد: هر کلیپ خودش یک جریان کامل با تگ و
   * هدرهای خودش است و چسباندن خام آن‌ها بین دو کلیپ وقفه‌ی کوتاه و صدای
   * «رباتی» می‌ساخت. حالا کلیپ‌ها با `MediaPlayer.setNextMediaPlayer` پشت هم
   * زنجیر می‌شوند؛ سیستم کلیپ بعدی را از قبل آماده می‌کند و انتقال بی‌مکث است.
   * سکوت ابتدا/انتهای کلیپ‌ها هم هنگام ساخت با ffmpeg (`silenceremove`) گرفته
   * شده است.
   */
  private fun playBundled(context: Context, announcement: VoiceAnnouncement, rate: Float): Boolean {
    if (announcement.amountToman <= 0L) return false

    val gender = if (announcement.gender == "male") "male" else "female"
    val clips = VoiceClipStitcher.clipsFor(announcement.amountToman) ?: return false
    val files = clipFiles(context, gender, clips) ?: return false
    if (files.isEmpty()) return false

    return when (playChain(files, rate)) {
      ChainResult.PLAYED -> true
      // زنجیر قبل از شروع پخش شکست خورد (پخش‌کن `setNextMediaPlayer` را پشتیبانی
      // نمی‌کند)؛ تک‌تک پخش می‌کنیم تا جمله گفته شود.
      ChainResult.NOT_STARTED -> playSequentially(files, rate)
      // خطای وسط پخش؛ تکرار از اول باعث دو بار شنیدن بخشی از جمله می‌شود.
      ChainResult.BROKEN -> false
    }
  }

  /** نتیجه‌ی تلاش برای پخش زنجیره‌ای کلیپ‌ها. */
  private enum class ChainResult { PLAYED, NOT_STARTED, BROKEN }

  /**
   * آماده‌سازی فایل‌های کلیپ در کش.
   *
   * `MediaPlayer` نمی‌تواند مستقیم از `assets` بخواند (فایل واقعی می‌خواهد) و
   * برای زنجیره هر کلیپ باید فایل مستقل باشد؛ پس هر کلیپ یک‌بار در کش کپی
   * می‌شود و بارهای بعد همان فایل استفاده می‌شود.
   */
  private fun clipFiles(context: Context, gender: String, clips: List<String>): List<File>? {
    return try {
      val directory = File(context.cacheDir, "$CACHE_DIR/clips-$gender")
      if (!directory.exists() && !directory.mkdirs()) return null

      val files = ArrayList<File>(clips.size)
      for (clip in clips) {
        val target = File(directory, "$clip.mp3")
        if (!target.exists() || target.length() <= MIN_AUDIO_BYTES) {
          context.assets.open("voice/$gender/$clip.mp3").use { input ->
            FileOutputStream(target).use { output -> input.copyTo(output) }
          }
        }
        if (target.length() <= MIN_AUDIO_BYTES) return null
        files.add(target)
      }
      files
    } catch (t: Throwable) {
      Log.w(TAG, "clip preparation failed: ${t.message}")
      null
    }
  }

  /**
   * پخش زنجیره‌ای بی‌مکث: همه‌ی پخش‌کن‌ها از قبل آماده می‌شوند، هر کدام به
   * بعدی زنجیر می‌شود و فقط اولی `start` می‌خورد.
   */
  private fun playChain(files: List<File>, speed: Float): ChainResult {
    val players = ArrayList<MediaPlayer>(files.size)
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)
    var started = false

    return try {
      for (file in files) {
        val player = MediaPlayer()
        players.add(player)
        player.setAudioAttributes(audioAttributes())
        player.setVolume(1.0f, 1.0f)
        FileInputStream(file).use { input ->
          player.setDataSource(input.fd)
          player.prepare()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && abs(speed - 1f) > 0.01f) {
          try {
            player.playbackParams = player.playbackParams.setSpeed(speed).setPitch(1f)
          } catch (t: Throwable) {
            Log.w(TAG, "clip speed change failed: ${t.message}")
          }
        }
        player.setOnErrorListener { _, what, extra ->
          Log.w(TAG, "clip playback error $what/$extra")
          failed.set(true)
          done.countDown()
          true
        }
      }

      for (index in 0 until players.size - 1) {
        players[index].setNextMediaPlayer(players[index + 1])
      }
      players.last().setOnCompletionListener { done.countDown() }

      players.first().start()
      started = true

      val finished = done.await(PLAY_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      if (!finished) Log.w(TAG, "clip chain timed out")
      if (finished && !failed.get()) ChainResult.PLAYED else ChainResult.BROKEN
    } catch (t: Throwable) {
      Log.w(TAG, "clip chain failed: ${t.message}")
      if (started) ChainResult.BROKEN else ChainResult.NOT_STARTED
    } finally {
      for (player in players) {
        try {
          player.stop()
        } catch (t: Throwable) {
          // نادیده
        }
        try {
          player.release()
        } catch (t: Throwable) {
          // نادیده
        }
      }
    }
  }

  /** پخش تکی کلیپ‌ها، تور نجات وقتی زنجیره روی دستگاه پشتیبانی نمی‌شود. */
  private fun playSequentially(files: List<File>, speed: Float): Boolean {
    var played = false
    for (file in files) {
      if (!playFile(file, speed)) return played
      played = true
    }
    return played
  }

  // -------------------------------------------------------------------------
  // پخش MP3
  // -------------------------------------------------------------------------

  /**
   * پخش فایل MP3 با سرعت دلخواه.
   *
   * [speed] فقط برای کلیپ‌های بسته‌بندی‌شده لازم است؛ فایل Edge سرعتش را از قبل
   * داخل SSML دارد و باید با ۱ پخش شود تا دو بار کند نشود. MediaPlayer سرعت را
   * با حفظ گام صدا (time-stretch) اعمال می‌کند، نه با پیچ‌کردن فرکانس.
   */
  private fun playFile(file: File, speed: Float = 1f): Boolean {
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

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && abs(speed - 1f) > 0.01f) {
        try {
          mediaPlayer.playbackParams = mediaPlayer.playbackParams
            .setSpeed(speed)
            .setPitch(1f)
        } catch (t: Throwable) {
          Log.w(TAG, "speed change failed: ${t.message}")
        }
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
  // مرحله‌ی آخر: TTS خود گوشی (فارسی یا فینگلیسی)
  // -------------------------------------------------------------------------

  private fun speakWithSystem(context: Context, text: String, rate: Float): Boolean {
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

      engine.setSpeechRate(VoiceRate.normalize(rate))
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
