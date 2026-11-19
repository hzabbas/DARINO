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

/** Synthesized announcement payload and audio parameters. */
data class VoiceAnnouncement(
  val speech: String,
  val service: String,
  val gender: String,
  val playChime: Boolean,
  val rate: Float,
  val amountToman: Long = 0L,
  val pitch: Float = 0.0f,
  val gain: Float = 1.0f
)

/**
 * Background voice announcer for bank deposit alerts.
 * Supports ducking, audio focus management, and 4 synthesis engines.
 */
object DepositVoiceAnnouncer {
  private const val TAG = "DarinoVoice"

  private const val SAMPLE_PAYER = "علی محمدی"
  private const val SAMPLE_BANK = "بلوبانک"
  private const val SAMPLE_CARD = "6104337812345678"

  private const val WAKE_LOCK_TIMEOUT_MS = 15_000L
  private const val PLAY_TIMEOUT_MS = 25_000L
  private const val TTS_TIMEOUT_MS = 25_000L
  private const val TTS_INIT_TIMEOUT_SECONDS = 4L
  private const val CHIME_GAP_MS = 80L
  private const val MIN_AUDIO_BYTES = 500
  private const val UTTERANCE_ID = "darino-deposit-voice"

  private val focusListener = AudioManager.OnAudioFocusChangeListener { }

  /** Prepares announcement speech if SMS is a valid, matched, unannounced deposit. */
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

      val effectivePitch = if (config.pitch != 0.0f) config.pitch else config.sherpaPitch
      val effectiveGain = if (config.gain != 1.0f) config.gain else config.sherpaGain

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
        amountToman = deposit.amountToman,
        pitch = effectivePitch,
        gain = effectiveGain
      )
    } catch (t: Throwable) {
      null
    }
  }

  /** Plays sample test speech strictly on the requested engine without silent fallback. */
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

    val config = VoiceConfigStore.read(context)
    val effectivePitch = if (config.pitch != 0.0f) config.pitch else config.sherpaPitch
    val effectiveGain = if (config.gain != 1.0f) config.gain else config.sherpaGain

    return play(
      context,
      VoiceAnnouncement(
        speech = speech,
        service = VoiceService.normalize(service),
        gender = gender,
        playChime = playChime,
        rate = rate,
        amountToman = amountToman,
        pitch = effectivePitch,
        gain = effectiveGain
      ),
      allowFallback = false
    )
  }

  /**
   * Executes speech synthesis and playback.
   * allowFallback=false in test mode ensures failure reporting without silent degradation.
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

    val config = VoiceConfigStore.read(context)
    val effectivePitch = if (announcement.pitch != 0.0f) {
      announcement.pitch
    } else if (config.pitch != 0.0f) {
      config.pitch
    } else {
      config.sherpaPitch
    }

    val effectiveGain = if (announcement.gain != 1.0f) {
      announcement.gain
    } else if (config.gain != 1.0f) {
      config.gain
    } else {
      config.sherpaGain
    }

    try {
      if (announcement.playChime) {
        playChime()
        Thread.sleep(CHIME_GAP_MS)
      }

      val result = when (service) {
        VoiceService.LOCAL -> {
          LocalPiperTtsEngine.speak(
            context,
            announcement.speech,
            announcement.gender,
            rate,
            pitch = effectivePitch,
            gain = effectiveGain,
            speakerId = config.sherpaSpeakerId,
            threads = config.sherpaThreads
          )
        }

        VoiceService.NEURAL -> {
          val synthesis = NeuralVoiceSynth.synthesize(
            context,
            announcement.speech,
            announcement.gender,
            rate,
            pitch = effectivePitch,
            gain = effectiveGain
          )
          val file = synthesis.audio
          when {
            file != null && playFile(file, speed = 1f, pitch = 1f, gain = effectiveGain) ->
              VoicePlaybackResult(true, service)
            else -> VoicePlaybackResult.failure(
              service,
              synthesis.message ?: "اتصال به سرویس صوتی آنلاین برقرار نشد"
            )
          }
        }

        VoiceService.CLIPS -> if (playBundled(context, announcement, rate, effectivePitch, effectiveGain)) {
          VoicePlaybackResult(true, service)
        } else {
          VoicePlaybackResult.failure(
            service,
            "کلیپ‌های «${if (announcement.gender == "male") "مرد" else "زن"}» کامل نیستند یا پخش آن‌ها ممکن نشد."
          )
        }

        else -> if (speakWithSystem(context, announcement.speech, rate, effectivePitch, effectiveGain)) {
          VoicePlaybackResult(true, VoiceService.SYSTEM)
        } else {
          VoicePlaybackResult.failure(
            VoiceService.SYSTEM,
            "موتور گوینده‌ی گوشی در دسترس نیست. نصب یا فعال‌سازی Text-to-Speech را بررسی کن."
          )
        }
      }

      if (result.ok || !allowFallback) return result

      // Fallback only during actual background SMS handling
      if (service != VoiceService.CLIPS && playBundled(context, announcement, rate, effectivePitch, effectiveGain)) {
        return VoicePlaybackResult(true, VoiceService.CLIPS)
      }
      if (speakWithSystem(context, announcement.speech, rate, effectivePitch, effectiveGain)) {
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
      // Ignore
    }
  }

  // -------------------------------------------------------------------------
  // Audio focus
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
      // Ignore
    }
  }

  // -------------------------------------------------------------------------
  // Notification Chime
  // -------------------------------------------------------------------------

  /** Synthesizes two-tone pleasant chime (~260ms) programmatically without asset files. */
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
      // Non-critical if chime fails
    } finally {
      try {
        track?.stop()
      } catch (t: Throwable) {
        // Ignore
      }
      try {
        track?.release()
      } catch (t: Throwable) {
        // Ignore
      }
    }
  }

  // -------------------------------------------------------------------------
  // Offline packaged clips
  // -------------------------------------------------------------------------

  private fun playBundled(
    context: Context,
    announcement: VoiceAnnouncement,
    rate: Float,
    pitch: Float,
    gain: Float
  ): Boolean {
    if (announcement.amountToman <= 0L) return false

    val gender = if (announcement.gender == "male") "male" else "female"
    val clips = VoiceClipStitcher.clipsFor(announcement.amountToman) ?: return false
    val files = clipFiles(context, gender, clips) ?: return false
    if (files.isEmpty()) return false

    return when (playChain(files, rate, pitch, gain)) {
      ChainResult.PLAYED -> true
      ChainResult.NOT_STARTED -> playSequentially(files, rate, pitch, gain)
      ChainResult.BROKEN -> false
    }
  }

  private enum class ChainResult { PLAYED, NOT_STARTED, BROKEN }

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

  /** Plays audio clips seamlessly with MediaPlayer chain. */
  private fun playChain(
    files: List<File>,
    speed: Float,
    pitch: Float,
    gain: Float
  ): ChainResult {
    val players = ArrayList<MediaPlayer>(files.size)
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)
    var started = false

    return try {
      val volume = gain.coerceIn(0.2f, 2.0f)
      val basePitch = if (pitch in 0.5f..2.0f) pitch else 1.0f

      for (file in files) {
        val player = MediaPlayer()
        players.add(player)
        player.setAudioAttributes(audioAttributes())
        player.setVolume(volume, volume)
        FileInputStream(file).use { input ->
          player.setDataSource(input.fd)
          player.prepare()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
          (abs(speed - 1f) > 0.01f || abs(basePitch - 1f) > 0.01f)
        ) {
          try {
            player.playbackParams = player.playbackParams.setSpeed(speed).setPitch(basePitch)
          } catch (t: Throwable) {
            Log.w(TAG, "clip playbackParams failed: ${t.message}")
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
          // Ignore
        }
        try {
          player.release()
        } catch (t: Throwable) {
          // Ignore
        }
      }
    }
  }

  private fun playSequentially(
    files: List<File>,
    speed: Float,
    pitch: Float,
    gain: Float
  ): Boolean {
    var played = false
    for (file in files) {
      if (!playFile(file, speed, pitch, gain)) return played
      played = true
    }
    return played
  }

  // -------------------------------------------------------------------------
  // MP3 playback helper
  // -------------------------------------------------------------------------

  private fun playFile(
    file: File,
    speed: Float = 1f,
    pitch: Float = 1f,
    gain: Float = 1f
  ): Boolean {
    var player: MediaPlayer? = null
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)

    return try {
      val mediaPlayer = MediaPlayer()
      player = mediaPlayer
      mediaPlayer.setAudioAttributes(audioAttributes())
      val volume = gain.coerceIn(0.2f, 2.0f)
      mediaPlayer.setVolume(volume, volume)

      FileInputStream(file).use { input ->
        mediaPlayer.setDataSource(input.fd)
        mediaPlayer.prepare()
      }

      val basePitch = if (pitch in 0.5f..2.0f) pitch else 1.0f
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
        (abs(speed - 1f) > 0.01f || abs(basePitch - 1f) > 0.01f)
      ) {
        try {
          mediaPlayer.playbackParams = mediaPlayer.playbackParams
            .setSpeed(speed)
            .setPitch(basePitch)
        } catch (t: Throwable) {
          Log.w(TAG, "speed/pitch change failed: ${t.message}")
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
        // Ignore
      }
      try {
        player?.release()
      } catch (t: Throwable) {
        // Ignore
      }
    }
  }

  // -------------------------------------------------------------------------
  // Device System TextToSpeech
  // -------------------------------------------------------------------------

  private fun speakWithSystem(
    context: Context,
    text: String,
    rate: Float,
    pitch: Float = 1.0f,
    gain: Float = 1.0f
  ): Boolean {
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
          // Ignore
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
      if (pitch in 0.5f..2.0f) {
        engine.setPitch(pitch)
      }

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
        // Ignore
      }
      try {
        tts?.shutdown()
      } catch (t: Throwable) {
        // Ignore
      }
    }
  }

  private const val CACHE_DIR = "voice-announcer"
}
