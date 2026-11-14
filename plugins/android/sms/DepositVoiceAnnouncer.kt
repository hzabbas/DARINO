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
  val amountToman: Long = 0L,
  /** آیا این همان جمله‌ی نمونه‌ی تست است؟ برای پخش فایل یک‌نفسِ آفلاین. */
  val isTestSample: Boolean = false
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
 * ترتیب پخش به انتخاب کاربر بستگی دارد ([VoiceService]) و هر مرحله فقط اگر
 * مرحله‌ی قبل شکست بخورد اجرا می‌شود:
 *  A) صدای عصبی آنلاین Edge (جمله‌ی کامل در یک نفس) → نمونه/کلیپ → TTS گوشی
 *  B) کلیپ‌های بسته‌بندی‌شده → TTS گوشی
 *  C) TTS گوشی → کلیپ‌های بسته‌بندی‌شده
 *
 * همیشه اول زنگ، بعد جمله. زنگ و جمله از یک مسیر صوتی
 * (`USAGE_MEDIA` + `CONTENT_TYPE_SPEECH`) پخش می‌شوند تا روی بلندگوی گوشی و
 * بلوتوث ماشین شنیده شوند.
 */
object DepositVoiceAnnouncer {
  private const val TAG = "DarinoVoice"

  /** جمله‌ی نمونه‌ی تست که فایل یک‌نفسش هم کنار اپ بسته‌بندی شده است. */
  private const val SAMPLE_PAYER = "علی محمدی"
  private const val SAMPLE_AMOUNT_TOMAN = 70_000L

  /** قفل بیداری تا پایان صدا؛ پخش Edge/کلیپ نهایتاً چند ثانیه است. */
  private const val WAKE_LOCK_TIMEOUT_MS = 60_000L
  private const val SYNTH_TIMEOUT_MS = 4_000L
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
    amountToman: Long,
    payerName: String?,
    bankName: String?,
    cardNumber: String?
  ): Boolean {
    val speech = SpeechTemplate.render(template, payerName, amountToman, bankName, cardNumber)
    if (speech.isEmpty()) return false

    val sampleSentence = DepositSpeech.buildColloquialDepositSpeech(
      SAMPLE_AMOUNT_TOMAN,
      SAMPLE_PAYER
    )

    return play(
      context,
      VoiceAnnouncement(
        speech = speech,
        service = VoiceService.normalize(service),
        gender = gender,
        playChime = playChime,
        rate = rate,
        amountToman = amountToman,
        isTestSample = amountToman == SAMPLE_AMOUNT_TOMAN &&
          payerName?.trim() == SAMPLE_PAYER &&
          speech == sampleSentence
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
    val service = VoiceService.normalize(announcement.service)
    val rate = VoiceRate.normalize(announcement.rate)

    try {
      // دانلود جمله‌ی عصبی همان لحظه شروع می‌شود تا زنگ، انتظار شبکه را بپوشاند.
      val online = AtomicReference<File?>(null)
      val worker = startBackground {
        if (service == VoiceService.EDGE) {
          online.set(
            NeuralVoiceSynth.synthesize(context, announcement.speech, announcement.gender, rate)
          )
        }
      }

      if (announcement.playChime) {
        playChime()
        // ۸۰ میلی‌ثانیه سکوت تا سینک سخت‌افزار صدا کامل آزاد شود.
        Thread.sleep(CHIME_GAP_MS)
      }

      val played = when (service) {
        VoiceService.EDGE -> {
          worker?.join(SYNTH_TIMEOUT_MS)
          val file = online.get()
          (file != null && playFile(file, 1f)) ||
            (announcement.isTestSample && playSample(context, announcement.gender, rate)) ||
            playBundled(context, announcement, rate) ||
            speakWithSystem(context, announcement.speech, rate)
        }

        VoiceService.OFFLINE ->
          (announcement.isTestSample && playSample(context, announcement.gender, rate)) ||
            playBundled(context, announcement, rate) ||
            speakWithSystem(context, announcement.speech, rate)

        else ->
          speakWithSystem(context, announcement.speech, rate) ||
            (announcement.isTestSample && playSample(context, announcement.gender, rate)) ||
            playBundled(context, announcement, rate)
      }

      return played
    } catch (t: Throwable) {
      Log.w(TAG, "announcement failed: ${t.message}")
      return false
    } finally {
      abandonAudioFocus(audioManager, focus)
      releaseWakeLock(wakeLock)
    }
  }

  private fun startBackground(block: () -> Unit): Thread? {
    return try {
      val thread = Thread(block)
      thread.isDaemon = true
      thread.start()
      thread
    } catch (t: Throwable) {
      null
    }
  }

  // -------------------------------------------------------------------------
  // نمونه‌ی یک‌نفس آفلاین
  // -------------------------------------------------------------------------

  /**
   * پخش فایل از پیش‌ساخته‌ی `assets/voice/{gender}/test_sample.mp3`.
   *
   * این فایل یک ضبط کامل «علی محمدی، هفتاد تومن برات واریز کرد» است؛ برای
   * دکمه‌ی تست وقتی اینترنت قطع است، تا کاربر به‌جای کلیپ‌های تکه‌تکه همان
   * جمله‌ی یک‌نفس طبیعی را بشنود. فایل به کش کپی می‌شود چون MediaPlayer از
   * descriptor فایل باز می‌خواند.
   */
  private fun playSample(context: Context, gender: String, rate: Float): Boolean {
    val folder = if (gender == "male") "male" else "female"
    val target = File(File(context.cacheDir, CACHE_DIR), "sample-$folder.mp3")
    return try {
      if (!target.exists() || target.length() <= MIN_AUDIO_BYTES) {
        target.parentFile?.mkdirs()
        context.assets.open("voice/$folder/test_sample.mp3").use { input ->
          FileOutputStream(target).use { output -> input.copyTo(output) }
        }
      }
      if (!target.exists() || target.length() <= MIN_AUDIO_BYTES) return false
      playFile(target, rate)
    } catch (t: Throwable) {
      Log.w(TAG, "sample playback failed: ${t.message}")
      false
    }
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
   */
  private fun playBundled(context: Context, announcement: VoiceAnnouncement, rate: Float): Boolean {
    if (announcement.amountToman <= 0L) return false

    val gender = if (announcement.gender == "male") "male" else "female"
    val clips = VoiceClipStitcher.clipsFor(announcement.amountToman) ?: return false
    val stitched = stitch(context, gender, clips) ?: return false
    return playFile(stitched, rate)
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
        audio.write(cleanMp3Frames(bytes))
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

  /**
   * حذف هر چیزی که وسط جریان MP3 چسبیده‌شده است و پخش‌کن را گیج می‌کند:
   *
   *  - تگ ID3v2 از ابتدا و ID3v1 از انتها
   *  - بایت‌های صفرِ جامانده‌ی قبل/بعد از قاب‌ها
   *  - قاب Xing/Info (هدر VBR) که خودش صدای واقعی ندارد؛ اگر بمانَد بین دو
   *    کلیپ یک قاب بی‌صدا و یک جابه‌جایی کوچک در ریتم می‌سازد
   *
   * کلیپ‌ها با ffmpeg و بدون `write_xing`/ID3 ساخته می‌شوند، ولی این لایه
   * دفاعی است تا اگر کلیپ خام Edge یا فایل قدیمی در اپ ماند، مکثِ رباتی
   * ایجاد نشود.
   */
  private fun cleanMp3Frames(bytes: ByteArray): ByteArray {
    var data = stripMetadata(bytes)
    if (data.size < 4) return data

    var start = 0
    while (start < data.size && data[start].toInt() == 0) start += 1
    if (start > 0 && start < data.size) data = data.copyOfRange(start, data.size)

    data = dropXingFrame(data)

    var end = data.size
    while (end > 0 && data[end - 1].toInt() == 0) end -= 1
    if (end < data.size) data = data.copyOfRange(0, end)

    return data
  }

  /** اگر قاب اول Xing/Info باشد، کل آن قاب حذف می‌شود. */
  private fun dropXingFrame(data: ByteArray): ByteArray {
    if (data.size < 8) return data
    if (!isFrameSync(data, 0)) return data

    val length = mp3FrameLength(data, 0)
    if (length <= 0 || length >= data.size) return data

    val header = String(data, 0, minOf(length, 256), Charsets.ISO_8859_1)
    if (!header.contains("Xing") && !header.contains("Info")) return data

    return data.copyOfRange(length, data.size)
  }

  /** حذف تگ ID3v2 از ابتدا و ID3v1 از انتهای بایت‌های MP3. */
  private fun stripMetadata(bytes: ByteArray): ByteArray {
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

  private fun isFrameSync(data: ByteArray, offset: Int): Boolean {
    return offset + 1 < data.size &&
      data[offset].toInt() == 0xFF &&
      (data[offset + 1].toInt() and 0xE0) == 0xE0
  }

  /**
   * طول قاب MP3 از هدر ۴ بایتی؛ فقط برای Layer III.
   * اگر هدر معتبر نباشد ۰ برمی‌گردد.
   */
  private fun mp3FrameLength(data: ByteArray, offset: Int): Int {
    if (offset + 3 >= data.size) return 0

    val second = data[offset + 1].toInt() and 0xFF
    val third = data[offset + 2].toInt() and 0xFF

    val versionBits = (second ushr 3) and 0x03
    val layerBits = (second ushr 1) and 0x03
    if (layerBits != 0x01) return 0 // فقط Layer III

    val bitrateIndex = (third ushr 4) and 0x0F
    val sampleIndex = (third ushr 2) and 0x03
    val padding = (third ushr 1) and 0x01
    if (bitrateIndex == 0 || bitrateIndex == 0x0F || sampleIndex == 0x03) return 0

    val mpeg1 = versionBits == 0x03
    val bitrates = if (mpeg1) {
      intArrayOf(0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
    } else {
      intArrayOf(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
    }
    val sampleRates = when (versionBits) {
      0x03 -> intArrayOf(44_100, 48_000, 32_000)
      0x02 -> intArrayOf(22_050, 24_000, 16_000)
      0x00 -> intArrayOf(11_025, 12_000, 8_000)
      else -> return 0
    }

    val bitrate = bitrates[bitrateIndex]
    val sampleRate = sampleRates[sampleIndex]
    if (bitrate == 0 || sampleRate == 0) return 0

    val coefficient = if (mpeg1) 144 else 72
    return (coefficient * bitrate * 1000 / sampleRate) + padding
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
