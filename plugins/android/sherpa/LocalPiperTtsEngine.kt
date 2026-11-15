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
 * موتور صدای عصبی فارسی **روی خود گوشی** با sherpa-onnx + مدل Piper (VITS).
 *
 * چرا این لایه اضافه شده: چسباندن کلیپ‌های MP3 برای مبلغ‌های بزرگ و نام
 * واریزکننده جمله‌ی تکه‌تکه می‌سازد و برای هر جمله‌ی دلخواه کلیپ از پیش ساخته‌شده
 * وجود ندارد. Piper کل جمله را در **یک نفس** و بدون اینترنت می‌سازد
 * («علی محمدی، صد و پنجاه تومن برات واریز کرد»).
 *
 * قواعد ضدکرش (هر کدام قبلاً باعث کرش نسخه‌ی release شده بود):
 *  - همه‌ی مسیرهای JNI داخل `catch (t: Throwable)` هستند، نه `Exception`؛
 *    `UnsatisfiedLinkError` و `NoClassDefFoundError` از `Error` ارث می‌برند.
 *  - مدل هرگز مستقیم از داخل APK خوانده نمی‌شود؛ اول به `filesDir` استخراج
 *    می‌شود، چون `OfflineTts` مسیر فایل واقعی می‌خواهد و `assets` فشرده است.
 *  - ساخت موتور و تولید صدا روی یک رشته‌ی تکی و پشت یک قفل انجام می‌شود؛
 *    `OfflineTts` هم‌زمان‌پذیر (thread-safe) نیست.
 *  - هر خطا فقط این لایه را خاموش می‌کند و اعلام به لایه‌ی بعدی زنجیره
 *    (Edge → کلیپ → TTS گوشی) می‌رسد؛ هیچ‌وقت اپ را نمی‌بندد.
 *
 * مدل: بسته‌ی رسمی `vits-piper-fa_IR-*-medium-int8` از انتشارهای sherpa-onnx
 * (پیش‌فرض `fa_IR-amir-medium`). اگر `fa_IR-mana-medium.onnx` هم کنارش باشد،
 * همان ترجیح داده می‌شود.
 */
object LocalPiperTtsEngine {
  private const val TAG = "DarinoVoice"

  /** مسیر مدل داخل `assets` و مقصد استخراج در `filesDir`. */
  private const val ASSET_DIR = "sherpa-tts/fa_IR"
  private const val TARGET_DIR = "sherpa-tts/fa_IR"
  private const val READY_MARKER = ".ready"

  /** کوچک‌تر از این یعنی مدل ناقص/خراب است. */
  private const val MIN_MODEL_BYTES = 1_000_000L

  /** سقف انتظار برای ساخت صدا؛ جمله‌ی یک‌نفس معمولاً زیر یک ثانیه است. */
  private const val SPEAK_TIMEOUT_SECONDS = 25L

  private const val WRITE_CHUNK = 2_048

  private val executor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "darino-local-tts").apply { isDaemon = true }
  }

  /** یک‌بار خرابی JNI/مدل دیده شد؛ دیگر هر پیامکی را معطل نکن. */
  private val unavailable = AtomicBoolean(false)

  @Volatile
  private var engine: OfflineTts? = null

  /** آیا مدل در این نسخه‌ی اپ بسته‌بندی شده است؟ */
  fun isBundled(context: Context): Boolean {
    return try {
      !context.assets.list(ASSET_DIR).isNullOrEmpty()
    } catch (t: Throwable) {
      false
    }
  }

  /** آیا مدل استخراج شده و موتور قابل استفاده است؟ (ارزان؛ برای UI) */
  fun isReady(context: Context): Boolean {
    if (unavailable.get()) return false
    if (engine != null) return true
    val directory = modelDir(context) ?: return false
    return hasModelFiles(directory)
  }

  /** جمله را کاملاً آفلاین می‌سازد و پخش می‌کند. `false` یعنی لایه‌ی بعد را صدا بزن. */
  fun speak(context: Context, text: String, gender: String, rate: Float): VoicePlaybackResult {
    if (text.isBlank()) {
      return VoicePlaybackResult.failure(VoiceService.LOCAL, "جمله‌ای برای موتور آفلاین وجود ندارد.")
    }
    val engineError = "موتور آفلاین Sherpa-ONNX یا مدل فارسی آن در دسترس نیست."
    if (unavailable.get()) return VoicePlaybackResult.failure(VoiceService.LOCAL, engineError)

    val app = context.applicationContext
    val future = try {
      executor.submit<Boolean> { speakOnWorker(app, text, gender, rate) }
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

  /**
   * پاک‌کردن موتور. فقط برای تست/تغییر مدل لازم است؛ `OfflineTts` خودش هم در
   * `finalize` آزاد می‌شود، ولی آزادسازی دستی حافظه‌ی بومی را سریع‌تر پس می‌دهد.
   */
  fun release() {
    val current = engine
    engine = null
    try {
      current?.release()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  // -------------------------------------------------------------------------
  // رشته‌ی کارگر
  // -------------------------------------------------------------------------

  private fun speakOnWorker(context: Context, text: String, gender: String, rate: Float): Boolean {
    return try {
      val directory = ensureModel(context) ?: return false
      val tts = ensureEngine(context, directory) ?: return false

      val audio = tts.generate(text, speakerFor(tts, gender), VoiceRate.normalize(rate))
      val samples = audio?.samples
      val sampleRate = audio?.sampleRate ?: 0
      if (samples == null || samples.isEmpty() || sampleRate <= 0) return false

      val multiSpeakerPitch = if (tts.numSpeakers() > 1) 1f else pitchFor(gender)
      playSamples(samples, sampleRate, multiSpeakerPitch)
    } catch (t: Throwable) {
      Log.w(TAG, "local tts failed: ${t.javaClass.simpleName}: ${t.message}")
      // خطای حلقه‌ی native/مدل دیگر با تلاش دوباره درست نمی‌شود؛ سرویس local
      // خاموش می‌ماند تا هر اعلان ثانیه‌ها معطل نشود.
      // `UnsatisfiedLinkError` زیرکلاس `LinkageError` است.
      if (t is LinkageError) unavailable.set(true)
      false
    }
  }

  @Synchronized
  private fun ensureEngine(context: Context, directory: File): OfflineTts? {
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
          numThreads = Runtime.getRuntime().availableProcessors().coerceIn(1, 4),
          debug = false,
          provider = "cpu",
        ),
        ruleFsts = "",
        ruleFars = "",
        maxNumSentences = 1
      )

      // `assetManager = null` چون مدل قبلاً در filesDir استخراج شده است.
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
  // مدل: استخراج از assets
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

  /** بررسی محتوا به نشانه‌ی .ready وابسته نیست؛ همان نشانه در پایان استخراج ساخته می‌شود. */
  private fun hasRequiredModelFiles(directory: File): Boolean {
    val model = findModel(directory) ?: return false
    return model.length() >= MIN_MODEL_BYTES &&
      File(directory, "tokens.txt").isFile &&
      File(directory, "espeak-ng-data/phondata").isFile &&
      File(directory, "espeak-ng-data/phontab").isFile &&
      File(directory, "espeak-ng-data/phonindex").isFile &&
      File(directory, "espeak-ng-data/fa_dict").isFile
  }

  /**
   * مطمئن می‌شود مدل در `filesDir` آماده است.
   *
   * استخراج یک‌بار انجام می‌شود و با فایل نشانه‌ی `.ready` علامت می‌خورد؛ اگر
   * استخراج نصفه بماند (کشتن فرایند وسط کار) دفعه‌ی بعد از نو انجام می‌شود و
   * فایل ناقص هرگز به موتور داده نمی‌شود.
   */
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
        // نادیده
      }
      null
    }
  }

  /** کپی بازگشتی یک شاخه از `assets`؛ `assets.list` برای فایل، آرایه‌ی خالی می‌دهد. */
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

  /**
   * انتخاب فایل مدل. نام‌های شناخته‌شده اولویت دارند (Mana، بعد amir/gyro/…)
   * و در آخر هر `*.onnx` دیگری پذیرفته می‌شود.
   */
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
  // پخش PCM خام (بدون فایل MP3 و بدون گلیچ قاب)
  // -------------------------------------------------------------------------

  private fun audioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }

  /** مدل چندگوینده شناسه دارد؛ مدل تک‌گوینده روی دو نیم‌پرده‌ی متفاوت PCM پخش می‌شود. */
  private fun speakerFor(tts: OfflineTts, gender: String): Int {
    val count = tts.numSpeakers()
    if (count <= 1) return 0
    return if (gender == "male") 0 else count - 1
  }

  /** پردازش واقعی PCM با AudioTrack و بدون دوباره‌سرعت‌دادن به جمله. */
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

      // اگر دستگاه pitch را نپذیرفت، موفقیت جعلی گزارش نمی‌شود؛ دو گزینه‌ی
      // جنسیت نباید بی‌صدا به همان خروجی مدل اصلی سقوط کنند.
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

      // صبر تا پایان بافر؛ وگرنه انتهای جمله بریده می‌شود.
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
        // نادیده
      }
      try {
        track?.release()
      } catch (t: Throwable) {
        // نادیده
      }
    }
  }
}
