package com.darino.app.sms

import android.content.Context
import android.content.res.AssetManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

/**
 * On-device neural speech synthesis engine for Persian using sherpa-onnx + Piper (VITS).
 * Synthesizes full natural sentences offline with no network dependency.
 */
object LocalPiperTtsEngine {
  private const val TAG = "DarinoVoice"

  private const val ASSET_DIR = "sherpa-tts/fa_IR"
  private const val TARGET_DIR = "sherpa-tts/fa_IR"
  private const val READY_MARKER = ".ready"
  private const val MIN_MODEL_BYTES = 1_000_000L
  private const val SPEAK_TIMEOUT_SECONDS = 25L
  private const val WRITE_CHUNK = 2_048

  private val executor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "darino-local-tts").apply { isDaemon = true }
  }

  private val unavailable = AtomicBoolean(false)

  @Volatile
  private var engine: OfflineTts? = null

  /** Checks if offline model assets exist in this APK build. */
  fun isBundled(context: Context): Boolean {
    return try {
      !context.assets.list(ASSET_DIR).isNullOrEmpty()
    } catch (t: Throwable) {
      false
    }
  }

  /** Checks if the extracted model and engine are ready for speech. */
  fun isReady(context: Context): Boolean {
    if (unavailable.get()) return false
    if (engine != null) return true
    val directory = modelDir(context) ?: return false
    return hasModelFiles(directory)
  }

  /** Synthesizes and plays text offline. Returns failure if unbundled or broken. */
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
    if (text.isBlank()) {
      return VoicePlaybackResult.failure(VoiceService.LOCAL, "جمله‌ای برای موتور آفلاین وجود ندارد.")
    }
    val engineError = "موتور آفلاین Sherpa-ONNX یا مدل فارسی آن در دسترس نیست."
    if (unavailable.get()) return VoicePlaybackResult.failure(VoiceService.LOCAL, engineError)

    val app = context.applicationContext
    val future = try {
      executor.submit<Boolean> {
        speakOnWorker(app, text, gender, rate, pitch, gain, speakerId, threads)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "local tts queue failed: ${t.message}")
      return VoicePlaybackResult.failure(VoiceService.LOCAL, engineError)
    }

    val played = try {
      future.get(SPEAK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (t: Throwable) {
      Log.w(TAG, "local tts timed out: ${t.message}")
      future.cancel(true)
      false
    }

    return if (played) {
      VoicePlaybackResult(ok = true, engine = VoiceService.LOCAL)
    } else {
      VoicePlaybackResult.failure(VoiceService.LOCAL, engineError)
    }
  }

  /** Model filename currently in target directory. */
  fun getModelName(context: Context): String {
    val dir = modelDir(context) ?: return ""
    return findModel(dir)?.name ?: ""
  }

  /** Model size in bytes. */
  fun getModelBytes(context: Context): Long {
    val dir = modelDir(context) ?: return 0L
    return findModel(dir)?.length() ?: 0L
  }

  /** Number of speakers supported by loaded model. */
  fun getNumSpeakers(): Int = engine?.numSpeakers() ?: 1

  /** Re-extracts model assets from APK into filesDir. */
  fun resetModel(context: Context): Boolean {
    release()
    unavailable.set(false)
    val directory = modelDir(context) ?: return false
    return try {
      directory.deleteRecursively()
      val restored = ensureModel(context)
      restored != null && hasModelFiles(restored)
    } catch (t: Throwable) {
      Log.w(TAG, "resetModel failed: ${t.message}")
      false
    }
  }

  /** Releases native engine memory. */
  fun release() {
    val current = engine
    engine = null
    try {
      current?.release()
    } catch (t: Throwable) {
      // Ignore
    }
  }

  // -------------------------------------------------------------------------
  // Worker Thread
  // -------------------------------------------------------------------------

  private fun speakOnWorker(
    context: Context,
    text: String,
    gender: String,
    rate: Float,
    pitch: Float,
    gain: Float,
    speakerId: Int,
    threads: Int
  ): Boolean {
    return try {
      val directory = ensureModel(context) ?: return false
      val tts = ensureEngine(context, directory, threads) ?: return false

      val chosenSpeaker = speakerFor(tts, gender, speakerId)
      val audio = tts.generate(text, chosenSpeaker, VoiceRate.normalize(rate))
      val samples = audio?.samples
      val sampleRate = audio?.sampleRate ?: 0
      if (samples == null || samples.isEmpty() || sampleRate <= 0) return false

      val effectivePitch = if (pitch in 0.6f..1.6f) {
        pitch
      } else {
        if (tts.numSpeakers() > 1) 1f else pitchFor(gender)
      }

      val gainedSamples = if (gain != 1.0f && gain in 0.5f..2.5f) {
        FloatArray(samples.size) { i -> (samples[i] * gain).coerceIn(-1.0f, 1.0f) }
      } else {
        samples
      }

      playSamples(gainedSamples, sampleRate, effectivePitch)
    } catch (t: Throwable) {
      Log.w(TAG, "local tts failed: ${t.javaClass.simpleName}: ${t.message}")
      if (t is LinkageError) unavailable.set(true)
      false
    }
  }

  @Synchronized
  private fun ensureEngine(context: Context, directory: File, threads: Int = 2): OfflineTts? {
    engine?.let { return it }

    val model = findModel(directory) ?: return null
    val tokens = File(directory, "tokens.txt")
    val dataDir = File(directory, "espeak-ng-data")
    if (!model.isFile || model.length() < MIN_MODEL_BYTES) return null
    if (!tokens.isFile || !dataDir.isDirectory) return null

    return try {
      val config = OfflineTtsConfig(
        model = OfflineTtsModelConfig(
          vits = OfflineTtsVitsModelConfig(
            model = model.absolutePath,
            tokens = tokens.absolutePath,
            dataDir = dataDir.absolutePath,
          ),
          numThreads = threads.coerceIn(1, 4),
          debug = false,
          provider = "cpu",
        ),
        ruleFsts = "",
        ruleFars = "",
        maxNumSentences = 1
      )

      val created = OfflineTts(assetManager = null, config = config)
      engine = created
      Log.i(TAG, "local sherpa-onnx tts ready: ${model.name} (${model.length() / 1024} KB)")
      created
    } catch (t: Throwable) {
      Log.w(TAG, "local tts init failed: ${t.javaClass.simpleName}: ${t.message}")
      unavailable.set(true)
      null
    }
  }

  // -------------------------------------------------------------------------
  // Model Extraction
  // -------------------------------------------------------------------------

  private fun modelDir(context: Context): File? {
    return try {
      File(context.filesDir, TARGET_DIR)
    } catch (t: Throwable) {
      null
    }
  }

  private fun hasModelFiles(directory: File): Boolean {
    return File(directory, READY_MARKER).isFile && hasRequiredModelFiles(directory)
  }

  /** Validates required model and phoneme files exist with valid size. */
  fun hasRequiredModelFiles(directory: File): Boolean {
    val model = findModel(directory) ?: return false
    return model.length() >= MIN_MODEL_BYTES &&
      File(directory, "tokens.txt").isFile &&
      File(directory, "espeak-ng-data/phondata").isFile &&
      File(directory, "espeak-ng-data/phontab").isFile &&
      File(directory, "espeak-ng-data/phonindex").isFile &&
      File(directory, "espeak-ng-data/fa_dict").isFile
  }

  /** Extracts bundled assets to filesDir on first run. */
  @Synchronized
  private fun ensureModel(context: Context): File? {
    val directory = modelDir(context) ?: return null
    if (hasModelFiles(directory)) return directory

    if (!isBundled(context)) {
      Log.w(TAG, "local tts model is not bundled in this build")
      return null
    }

    return try {
      if (directory.exists()) directory.deleteRecursively()
      directory.mkdirs()

      if (!copyAssetTree(context.assets, ASSET_DIR, directory)) {
        directory.deleteRecursively()
        return null
      }

      if (!hasRequiredModelFiles(directory)) {
        directory.deleteRecursively()
        return null
      }

      File(directory, READY_MARKER).writeText("ok")
      return if (hasModelFiles(directory)) directory else null
    } catch (t: Throwable) {
      Log.w(TAG, "local tts extraction failed: ${t.message}")
      try {
        directory.deleteRecursively()
      } catch (ignored: Throwable) {
        // Ignore
      }
      null
    }
  }

  private fun copyAssetTree(assets: AssetManager, assetPath: String, target: File): Boolean {
    return try {
      val children = assets.list(assetPath).orEmpty()
      if (children.isEmpty()) {
        target.parentFile?.mkdirs()
        assets.open(assetPath).use { input ->
          FileOutputStream(target).use { output -> input.copyTo(output, 64 * 1024) }
        }
        return target.length() > 0
      }

      if (!target.exists() && !target.mkdirs()) return false
      for (child in children) {
        if (!copyAssetTree(assets, "$assetPath/$child", File(target, child))) return false
      }
      true
    } catch (t: Throwable) {
      Log.w(TAG, "asset copy failed at $assetPath: ${t.message}")
      false
    }
  }

  private fun findModel(directory: File): File? {
    val preferred = listOf(
      "fa_IR-mana-medium.onnx",
      "fa_IR-amir-medium.onnx",
      "fa_IR-gyro-medium.onnx",
      "fa_IR-ganji-medium.onnx",
      "fa_IR-reza_ibrahim-medium.onnx",
      "model.onnx"
    )

    for (name in preferred) {
      val file = File(directory, name)
      if (file.isFile) return file
    }

    return try {
      directory.listFiles()
        ?.filter { it.isFile && it.name.endsWith(".onnx", ignoreCase = true) }
        ?.maxByOrNull { it.length() }
    } catch (t: Throwable) {
      null
    }
  }

  // -------------------------------------------------------------------------
  // Raw PCM Playback
  // -------------------------------------------------------------------------

  private fun audioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }

  private fun speakerFor(tts: OfflineTts, gender: String, speakerId: Int = -1): Int {
    val count = tts.numSpeakers()
    if (count <= 1) return 0
    if (speakerId in 0 until count) return speakerId
    return if (gender == "male") 0 else count - 1
  }

  private fun pitchFor(gender: String): Float = if (gender == "male") 0.88f else 1.12f

  private fun playSamples(samples: FloatArray, sampleRate: Int, pitch: Float): Boolean {
    var track: AudioTrack? = null
    return try {
      val minBuffer = AudioTrack.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_FLOAT
      )
      val bufferSize = maxOf(
        if (minBuffer > 0) minBuffer * 2 else 0,
        32 * 1024,
        samples.size * 4
      )

      val created = AudioTrack.Builder()
        .setAudioAttributes(audioAttributes())
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(bufferSize)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
      track = created

      if (pitch != 1f) {
        try {
          created.playbackParams = created.playbackParams.setPitch(pitch).setSpeed(1f)
          if (abs(created.playbackParams.pitch - pitch) > 0.01f) return false
        } catch (t: Throwable) {
          Log.w(TAG, "pitch change failed: ${t.message}")
          return false
        }
      }

      created.play()

      var offset = 0
      while (offset < samples.size) {
        val chunk = minOf(samples.size - offset, WRITE_CHUNK)
        val written = created.write(samples, offset, chunk, AudioTrack.WRITE_BLOCKING)
        if (written < 0) {
          Log.w(TAG, "audiotrack write failed: $written")
          return false
        }
        offset += written
      }

      val frames = samples.size.toLong()
      val deadline = SystemClock.elapsedRealtime() + frames * 1_000L / sampleRate + 3_000L
      while (SystemClock.elapsedRealtime() < deadline) {
        if (created.playbackHeadPosition >= frames) break
        Thread.sleep(20L)
      }

      true
    } catch (t: Throwable) {
      Log.w(TAG, "pcm playback failed: ${t.message}")
      false
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
}
