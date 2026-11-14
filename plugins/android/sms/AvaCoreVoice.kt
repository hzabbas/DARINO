package com.darino.app.sms

import android.content.Context
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * گوینده‌ی فارسی آفلاین با موتور [AvaCore](https://github.com/PlayFoundryHQ/AvaCore).
 *
 * AvaCore یک موتور TTS مستقل اندروید است (GPL-3.0) و مثل هر موتور دیگری با
 * `android.speech.tts.TextToSpeech` صدا می‌دهد؛ پس کدش داخل دارینو کپی نمی‌شود و
 * فقط با پکیج `com.github.opscalehub.avacore` به آن وصل می‌شویم. مزیتش این است که
 * کاملاً آفلاین است و هیچ مجوز اینترنتی ندارد.
 *
 * دو نکته‌ی مهم:
 *  - ساخت `TextToSpeech` چند ثانیه طول می‌کشد. برای همین نمونه یک‌بار ساخته و
 *    نگه داشته می‌شود (`warm`) تا لحظه‌ی رسیدن پیامک، جمله بی‌درنگ گفته شود.
 *  - اگر موتور نصب نباشد یا صدایش راه نیفتد، `null`/`false` برمی‌گردد و لایه‌ی
 *    بالاتر کلیپ آفلاین یا TTS گوشی را امتحان می‌کند؛ هیچ‌وقت استثنا پرتاب نمی‌شود.
 */
object AvaCoreVoice {
  const val PACKAGE_NAME = "com.github.opscalehub.avacore"

  private const val TAG = "DarinoVoice"
  private const val VOICE_NAME = "fa-ir-ava-goftari"

  /** سقف انتظار برای بالا آمدن موتور؛ بیشتر از این یعنی سرویس گیر کرده است. */
  private const val INIT_TIMEOUT_MS = 5_000L

  /** سقف انتظار برای گفتن جمله؛ اولین جمله باید مدل ۶۳ مگابایتی را هم بار کند. */
  private const val SPEAK_TIMEOUT_MS = 30_000L

  data class EngineStatus(val installed: Boolean, val versionName: String?)

  private val lock = Any()

  private var engine: TextToSpeech? = null
  private var initLatch = CountDownLatch(1)
  private var initStatus = TextToSpeech.ERROR
  private var utteranceCounter = 0

  /** آیا اپ موتور آواکور روی گوشی نصب است؟ (برای نمایش وضعیت در تنظیمات) */
  fun status(context: Context): EngineStatus {
    return try {
      val manager = context.packageManager
      val info = if (android.os.Build.VERSION.SDK_INT >= 33) {
        manager.getPackageInfo(PACKAGE_NAME, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        manager.getPackageInfo(PACKAGE_NAME, 0)
      }
      EngineStatus(true, info.versionName)
    } catch (t: Throwable) {
      EngineStatus(false, null)
    }
  }

  /**
   * آماده‌سازی موتور در پس‌زمینه.
   *
   * بعد از هر همگام‌سازی تنظیمات صدا زده می‌شود تا اگر گیرنده‌ی پیامک وقتی اپ
   * بسته است بیدار شود، موتور از قبل بالا آمده باشد.
   */
  fun warm(context: Context) {
    try {
      obtain(context)
    } catch (t: Throwable) {
      Log.w(TAG, "avacore warm-up failed: ${t.message}")
    }
  }

  /** گفتن جمله با موتور آواکور و سرعت دلخواه؛ `true` یعنی جمله کامل پخش شد. */
  fun speak(context: Context, text: String, rate: Float): Boolean {
    val sentence = text.trim()
    if (sentence.isEmpty()) return false

    val tts = obtain(context) ?: return false
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)

    return try {
      val persian = Locale("fa", "IR")
      val available = try {
        tts.isLanguageAvailable(persian)
      } catch (t: Throwable) {
        TextToSpeech.LANG_NOT_SUPPORTED
      }
      if (available < TextToSpeech.LANG_AVAILABLE) {
        Log.w(TAG, "avacore has no persian voice ($available)")
        return false
      }

      val language = tts.setLanguage(persian)
      if (language == TextToSpeech.LANG_MISSING_DATA ||
        language == TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        return false
      }

      // صدای گفتاری آواکور با همین نام می‌آید؛ اگر لیست صداها در دسترس بود صریح
      // انتخابش می‌کنیم تا اگر کاربر در خود آواکور صدای دیگری انتخاب کرده باشد،
      // اعلام واریز همان صدای همیشگی باشد.
      try {
        val voice = tts.voices?.firstOrNull { it.name == VOICE_NAME }
        if (voice != null) tts.voice = voice
      } catch (t: Throwable) {
        // انتخاب صدا اختیاری است؛ setLanguage کافی است
      }

      tts.setSpeechRate(VoiceRate.normalize(rate))
      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
          // نادیده
        }

        override fun onDone(utteranceId: String?) {
          done.countDown()
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          failed.set(true)
          done.countDown()
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
          failed.set(true)
          done.countDown()
        }
      })

      val utteranceId = nextUtteranceId()
      if (tts.speak(sentence, TextToSpeech.QUEUE_FLUSH, null, utteranceId) != TextToSpeech.SUCCESS) {
        return false
      }

      val finished = done.await(SPEAK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      if (!finished) {
        Log.w(TAG, "avacore speak timed out")
        try {
          tts.stop()
        } catch (t: Throwable) {
          // نادیده
        }
      }
      finished && !failed.get()
    } catch (t: Throwable) {
      Log.w(TAG, "avacore speak failed: ${t.message}")
      false
    }
  }

  /** بستن موتور (وقتی موتور عوض شد یا خراب بود). */
  fun shutdown() {
    val instance = synchronized(lock) {
      val current = engine
      engine = null
      initLatch = CountDownLatch(1)
      initStatus = TextToSpeech.ERROR
      current
    }
    release(instance)
  }

  // -------------------------------------------------------------------------
  // ساخت و نگه‌داری موتور
  // -------------------------------------------------------------------------

  /**
   * نمونه‌ی آماده‌ی موتور یا `null`.
   *
   * انتظار برای init **بیرون** از قفل انجام می‌شود تا دو اعلان هم‌زمان یکدیگر را
   * قفل نکنند؛ ولی فقط یک نمونه ساخته می‌شود.
   */
  private fun obtain(context: Context): TextToSpeech? {
    val instance: TextToSpeech
    val latch: CountDownLatch

    synchronized(lock) {
      val existing = engine
      if (existing != null) {
        instance = existing
        latch = initLatch
      } else {
        val created = CountDownLatch(1)
        initStatus = TextToSpeech.ERROR
        initLatch = created
        instance = TextToSpeech(
          context.applicationContext,
          { code ->
            synchronized(lock) { initStatus = code }
            created.countDown()
          },
          PACKAGE_NAME
        )
        engine = instance
        latch = created
      }
    }

    val finished = try {
      latch.await(INIT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } catch (t: Throwable) {
      false
    }

    synchronized(lock) {
      if (finished && initStatus == TextToSpeech.SUCCESS) return instance
      // موتور نصب نیست یا بالا نیامد؛ نمونه را دور می‌ریزیم تا دفعه‌ی بعد از نو
      // تلاش شود (مثلاً کاربر همین حالا آواکور را نصب کرده است).
      if (engine === instance) {
        engine = null
        initLatch = CountDownLatch(1)
        initStatus = TextToSpeech.ERROR
      }
    }

    Log.w(TAG, "avacore engine unavailable")
    release(instance)
    return null
  }

  private fun release(instance: TextToSpeech?) {
    if (instance == null) return
    try {
      val worker = Thread {
        try {
          instance.stop()
        } catch (t: Throwable) {
          // نادیده
        }
        try {
          instance.shutdown()
        } catch (t: Throwable) {
          // نادیده
        }
      }
      worker.isDaemon = true
      worker.start()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  private fun nextUtteranceId(): String = synchronized(lock) {
    utteranceCounter += 1
    "darino-avacore-$utteranceCounter"
  }
}
