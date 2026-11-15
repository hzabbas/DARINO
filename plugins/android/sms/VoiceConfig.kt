package com.darino.app.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** یک کارت بانکی که ممکن است اعلام صوتی داشته باشد. */
data class VoiceAccount(
  val id: Int,
  val bankKey: String,
  val bankName: String,
  val cardNumber: String,
  val accountNumber: String,
  val senders: List<String>,
  val announceVoice: Boolean
)

/**
 * سرویس‌هایی که کاربر می‌تواند برای گفتن جمله انتخاب کند.
 *
 *  - [LOCAL] صدای عصبی فارسی روی خود گوشی (sherpa-onnx + Piper): جمله‌ی کامل
 *    در یک نفس، بدون اینترنت و بدون کلیپ تکه‌تکه
 *  - [EDGE] صدای عصبی آنلاین مایکروسافت (پیش‌فرض): جمله‌ی کامل در یک نفس
 *  - [OFFLINE] فقط کلیپ‌های بسته‌بندی‌شده (جمله‌ی ثابت «… تومن واریز شد»)
 *  - [SYSTEM] موتور TTS خود گوشی
 *
 * مقدار قدیمی `avacore` که در نسخه‌های قبل ذخیره شده بود، به‌طور خودکار به
 * [EDGE] تبدیل می‌شود؛ موتور آواکور از این نسخه حذف شده است.
 */
object VoiceService {
  const val LOCAL = "local"
  const val NEURAL = "neural"
  const val CLIPS = "clips"
  const val SYSTEM = "system"

  val ALL = listOf(LOCAL, NEURAL, CLIPS, SYSTEM)

  /** تنظیمات قدیمی edge/offline به نام روشنِ همان موتور تبدیل می‌شوند. */
  fun normalize(value: String?): String {
    return when (value?.trim()?.lowercase().orEmpty()) {
      "edge", "avacore" -> NEURAL
      "offline" -> CLIPS
      LOCAL -> LOCAL
      NEURAL -> NEURAL
      CLIPS -> CLIPS
      SYSTEM -> SYSTEM
      else -> NEURAL
    }
  }
}

/** خروجی واقعی یک موتور؛ برای تست، خطا همراه نام همان موتور برمی‌گردد. */
data class VoicePlaybackResult(
  val ok: Boolean,
  val engine: String,
  val message: String? = null
) {
  companion object {
    fun failure(engine: String, message: String) =
      VoicePlaybackResult(ok = false, engine = engine, message = message)
  }
}

/**
 * سرعت گفتار.
 *
 * ۱ یعنی سرعت طبیعی؛ کمتر یعنی آرام‌تر و بیشتر یعنی تندتر. بازه‌ی ۰٫۶ تا ۱٫۴
 * عمداً باریک است: خارج از آن جمله یا کشیده و خواب‌آور می‌شود یا ناخوانا.
 */
object VoiceRate {
  const val DEFAULT = 1.0f
  const val MIN = 0.6f
  const val MAX = 1.4f

  fun normalize(value: Float): Float {
    if (!value.isFinite()) return DEFAULT
    return value.coerceIn(MIN, MAX)
  }

  fun normalize(value: Double): Float = normalize(value.toFloat())
}

/** تنظیمات کاملی که گیرنده‌ی پیامک برای اعلام صوتی لازم دارد. */
data class VoiceConfig(
  val enabled: Boolean,
  val gender: String,
  val chime: Boolean,
  val senders: List<String>,
  val accounts: List<VoiceAccount>,
  val service: String = VoiceService.NEURAL,
  val template: String = SpeechTemplate.DEFAULT,
  val rate: Float = VoiceRate.DEFAULT,
  val sherpaPitch: Float = 0.0f,
  val sherpaGain: Float = 1.0f,
  val sherpaSpeakerId: Int = -1,
  val sherpaThreads: Int = 2
) {
  companion object {
    val DISABLED = VoiceConfig(
      enabled = false,
      gender = "female",
      chime = false,
      senders = emptyList(),
      accounts = emptyList()
    )

    private fun digitsOnly(raw: String): String {
      return SmsSender.toLatinDigits(raw).replace(Regex("[^0-9]"), "")
    }

    private fun lastFour(raw: String): String {
      val digits = digitsOnly(raw)
      return if (digits.length >= 4) digits.takeLast(4) else ""
    }

    /**
     * کارتی که این پیامک به آن مربوط است؛ با تطبیق سخاوتمندانه.
     *
     * ترتیب:
     *  ۱. بین کارت‌های روشن، چهار رقم آخر کارت یا حساب در متن باشد.
     *  ۲. بین کارت‌های روشن، سرشماره یا کلید بانک تطبیق بخورد.
     *  ۳. اگر هیچ کارتی روشن نیست، باز هم اعلام کن (کاربر اعلام صوتی کلی را
     *     روشن کرده است؛ جمله‌ی بدون نام بانک بهتر از سکوت است).
     *  ۴. اگر کارت روشن هست ولی پیامک هیچ نشانه‌ای ندارد، به اولین کارت روشن
     *     نسبت بده؛ فقط وقتی اعلام نکن که رقم‌های پیامک مال کارت **خاموش**
     *     دیگری باشد (یعنی پیامک درباره‌ی همان کارت است).
     */
    fun matchAccountForAnnouncement(
      config: VoiceConfig,
      sender: String,
      body: String
    ): VoiceAccount? {
      val enabled = config.accounts.filter { it.announceVoice }
      val bodyDigits = digitsOnly(body)
      val normalizedSender = SmsSender.normalize(sender)

      for (account in enabled) {
        val card = lastFour(account.cardNumber)
        if (card.isNotEmpty() && bodyDigits.contains(card)) return account

        val accountSuffix = lastFour(account.accountNumber)
        if (accountSuffix.isNotEmpty() && bodyDigits.contains(accountSuffix)) return account
      }

      for (account in enabled) {
        if (account.senders.any { saved -> SmsSender.matches(saved, sender) }) return account

        val key = account.bankKey.trim().lowercase()
        if (key.length >= 3 && normalizedSender.contains(key)) return account
      }

      if (enabled.isEmpty()) {
        // هیچ کارتی علامت نخورده؛ ولی اعلام صوتی کلی روشن است.
        return VoiceAccount(
          id = 0,
          bankKey = "",
          bankName = "",
          cardNumber = "",
          accountNumber = "",
          senders = emptyList(),
          announceVoice = true
        )
      }

      // پیامک درباره‌ی کارت خاموش دیگری است؛ نباید با کارت روشن جور شود.
      for (account in config.accounts) {
        if (account.announceVoice) continue

        val card = lastFour(account.cardNumber)
        if (card.isNotEmpty() && bodyDigits.contains(card)) return null

        val accountSuffix = lastFour(account.accountNumber)
        if (accountSuffix.isNotEmpty() && bodyDigits.contains(accountSuffix)) return null
      }

      return enabled.first()
    }
  }
}

/**
 * انبار تنظیمات اعلام صوتی در SharedPreferences.
 *
 * داده از سمت جاوااسکریپت می‌آید (`syncVoiceConfig`) و گیرنده‌ی بومی وقتی برنامه
 * بسته است از همین‌جا می‌خواند. همه‌ی عملیات در try/catch هستند: یک فایل تنظیمات
 * خراب نباید باعث کرش گیرنده یا از دست رفتن اعلان شود.
 */
object VoiceConfigStore {
  private const val PREFS = "darino_voice_announcer"
  private const val KEY_CONFIG = "config"
  private const val KEY_SEEN = "seen"
  private const val KEY_LAST_SMS_DATE = "last_sms_date"
  private const val KEY_LAST_SMS_ID = "last_sms_id"
  private const val MAX_SEEN = 40

  @Synchronized
  fun save(context: Context, json: String): Boolean {
    return try {
      val input = JSONObject(json)
      val accounts = mutableListOf<JSONObject>()

      val inputAccounts = input.optJSONArray("accounts") ?: JSONArray()
      for (index in 0 until inputAccounts.length()) {
        val item = inputAccounts.optJSONObject(index) ?: continue
        val senders = mutableListOf<String>()
        val inputSenders = item.optJSONArray("senders")
        if (inputSenders != null) {
          for (senderIndex in 0 until inputSenders.length()) {
            val sender = inputSenders.optString(senderIndex, "")
            if (sender.isNotBlank()) senders.add(sender.trim())
          }
        }

        val account = JSONObject()
        account.put("id", item.optInt("id", 0))
        account.put("bankKey", item.optString("bankKey", ""))
        account.put("bankName", item.optString("bankName", ""))
        account.put("cardNumber", item.optString("cardNumber", ""))
        account.put("accountNumber", item.optString("accountNumber", ""))
        account.put("senders", JSONArray(senders))
        account.put("announceVoice", item.optBoolean("announceVoice", false))
        accounts.add(account)
      }

      val senders = mutableListOf<String>()
      val inputSenders = input.optJSONArray("senders")
      if (inputSenders != null) {
        for (index in 0 until inputSenders.length()) {
          val sender = inputSenders.optString(index, "")
          if (sender.isNotBlank()) senders.add(sender.trim())
        }
      }

      val normalized = JSONObject()
      normalized.put("enabled", input.optBoolean("enabled", false))
      normalized.put("gender", if (input.optString("gender", "female") == "male") "male" else "female")
      normalized.put("chime", input.optBoolean("chime", false))
      normalized.put("service", VoiceService.normalize(input.optString("service", VoiceService.NEURAL)))

      // قالب خراب یا بدون جای مبلغ، بی‌صدا به پیش‌فرض برمی‌گردد؛ هیچ واریزی نباید
      // فقط به‌خاطر یک قالب ناقص بی‌صدا بماند.
      normalized.put(
        "template",
        SpeechTemplate.sanitize(input.optString("template", SpeechTemplate.DEFAULT))
      )
      normalized.put("rate", VoiceRate.normalize(input.optDouble("rate", VoiceRate.DEFAULT.toDouble())))
      normalized.put("sherpaPitch", input.optDouble("sherpaPitch", 0.0))
      normalized.put("sherpaGain", input.optDouble("sherpaGain", 1.0).coerceIn(0.5, 2.0))
      normalized.put("sherpaSpeakerId", input.optInt("sherpaSpeakerId", -1))
      normalized.put("sherpaThreads", input.optInt("sherpaThreads", 2).coerceIn(1, 4))
      normalized.put("senders", JSONArray(senders))
      normalized.put("accounts", JSONArray(accounts))

      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString(KEY_CONFIG, normalized.toString()).apply()
      true
    } catch (t: Throwable) {
      false
    }
  }

  /**
   * ذخیره‌ی همزمان پارامترهای همان تست؛ برخلاف `apply`، `commit` پیش از شروع پخش
   * روی دیسک تمام می‌شود و گیرنده‌ی پس‌زمینه نمی‌تواند تنظیم نیمه‌قدیمی بخواند.
   * کارت‌ها، سرشماره‌ها و وضعیت فعال‌بودن دست‌نخورده باقی می‌مانند.
   */
  @Synchronized
  fun saveVoiceSelection(
    context: Context,
    engine: String,
    gender: String,
    rate: Double,
    template: String?,
    chimeEnabled: Boolean
  ): Boolean {
    return try {
      val current = read(context)
      val normalized = JSONObject()
      normalized.put("enabled", current.enabled)
      normalized.put("gender", if (gender == "male") "male" else "female")
      normalized.put("chime", chimeEnabled)
      normalized.put("service", VoiceService.normalize(engine))
      normalized.put("template", SpeechTemplate.sanitize(template))
      normalized.put("rate", VoiceRate.normalize(rate))
      normalized.put("sherpaPitch", current.sherpaPitch.toDouble())
      normalized.put("sherpaGain", current.sherpaGain.toDouble())
      normalized.put("sherpaSpeakerId", current.sherpaSpeakerId)
      normalized.put("sherpaThreads", current.sherpaThreads)
      normalized.put("senders", JSONArray(current.senders))
      val accounts = JSONArray()
      for (account in current.accounts) {
        val item = JSONObject()
        item.put("id", account.id)
        item.put("bankKey", account.bankKey)
        item.put("bankName", account.bankName)
        item.put("cardNumber", account.cardNumber)
        item.put("accountNumber", account.accountNumber)
        item.put("senders", JSONArray(account.senders))
        item.put("announceVoice", account.announceVoice)
        accounts.put(item)
      }
      normalized.put("accounts", accounts)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putString(KEY_CONFIG, normalized.toString()).commit()
    } catch (t: Throwable) {
      false
    }
  }

  @Synchronized
  fun read(context: Context): VoiceConfig {
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_CONFIG, null) ?: return VoiceConfig.DISABLED
      val input = JSONObject(raw)

      val senders = readStrings(input.optJSONArray("senders"))
      val accounts = mutableListOf<VoiceAccount>()
      val inputAccounts = input.optJSONArray("accounts") ?: JSONArray()
      for (index in 0 until inputAccounts.length()) {
        val item = inputAccounts.optJSONObject(index) ?: continue
        accounts.add(
          VoiceAccount(
            id = item.optInt("id", 0),
            bankKey = item.optString("bankKey", ""),
            bankName = item.optString("bankName", ""),
            cardNumber = item.optString("cardNumber", ""),
            accountNumber = item.optString("accountNumber", ""),
            senders = readStrings(item.optJSONArray("senders")),
            announceVoice = item.optBoolean("announceVoice", false)
          )
        )
      }

      VoiceConfig(
        enabled = input.optBoolean("enabled", false),
        gender = if (input.optString("gender", "female") == "male") "male" else "female",
        chime = input.optBoolean("chime", false),
        senders = senders,
        accounts = accounts,
        service = VoiceService.normalize(input.optString("service", VoiceService.NEURAL)),
        template = SpeechTemplate.sanitize(input.optString("template", SpeechTemplate.DEFAULT)),
        rate = VoiceRate.normalize(input.optDouble("rate", VoiceRate.DEFAULT.toDouble())),
        sherpaPitch = input.optDouble("sherpaPitch", 0.0).toFloat(),
        sherpaGain = input.optDouble("sherpaGain", 1.0).toFloat().coerceIn(0.5f, 2.0f),
        sherpaSpeakerId = input.optInt("sherpaSpeakerId", -1),
        sherpaThreads = input.optInt("sherpaThreads", 2).coerceIn(1, 4)
      )
    } catch (t: Throwable) {
      VoiceConfig.DISABLED
    }
  }

  /**
   * ذخیره مستقیم تنظیمات موتور عصبی محلی Sherpa-ONNX در حافظه بومی.
   */
  @Synchronized
  fun saveSherpaTtsSettings(
    context: Context,
    pitch: Float,
    gain: Float,
    speakerId: Int,
    threads: Int
  ): Boolean {
    return try {
      val current = read(context)
      val normalized = JSONObject()
      normalized.put("enabled", current.enabled)
      normalized.put("gender", current.gender)
      normalized.put("chime", current.chime)
      normalized.put("service", current.service)
      normalized.put("template", current.template)
      normalized.put("rate", current.rate.toDouble())
      normalized.put("sherpaPitch", pitch.toDouble())
      normalized.put("sherpaGain", gain.toDouble().coerceIn(0.5, 2.0))
      normalized.put("sherpaSpeakerId", speakerId)
      normalized.put("sherpaThreads", threads.coerceIn(1, 4))
      normalized.put("senders", JSONArray(current.senders))
      val accounts = JSONArray()
      for (account in current.accounts) {
        val item = JSONObject()
        item.put("id", account.id)
        item.put("bankKey", account.bankKey)
        item.put("bankName", account.bankName)
        item.put("cardNumber", account.cardNumber)
        item.put("accountNumber", account.accountNumber)
        item.put("senders", JSONArray(account.senders))
        item.put("announceVoice", account.announceVoice)
        accounts.put(item)
      }
      normalized.put("accounts", accounts)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putString(KEY_CONFIG, normalized.toString()).commit()
    } catch (t: Throwable) {
      false
    }
  }

  /**
   * آیا این پیامک قبلاً اعلام شده است؟ اگر نه، همین‌جا علامت می‌زند تا اعلان
   * تکراری (بازخوانی صندوق پیامک، تحویل دوباره‌ی broadcast) صدا ندهد.
   */
  @Synchronized
  fun shouldAnnounce(context: Context, fingerprint: String): Boolean {
    if (fingerprint.isBlank()) return false
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val seen = JSONArray(prefs.getString(KEY_SEEN, "[]") ?: "[]")

      for (index in 0 until seen.length()) {
        if (seen.optString(index) == fingerprint) return false
      }

      val next = JSONArray()
      val start = maxOf(0, seen.length() - (MAX_SEEN - 1))
      for (index in start until seen.length()) {
        next.put(seen.optString(index))
      }
      next.put(fingerprint)

      prefs.edit().putString(KEY_SEEN, next.toString()).apply()
      true
    } catch (t: Throwable) {
      // اگر حافظه در دسترس نبود، ترجیح می‌دهیم اعلام انجام شود تا از دست نرود.
      true
    }
  }

  @Synchronized
  fun clearSeen(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().remove(KEY_SEEN).apply()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  /**
   * آخرین زمان پیامکی (میلی‌ثانیه) که سرویس دائمی از دفتر پیامک خوانده است.
   *
   * این مقدار در SharedPreferences می‌ماند تا بعد از بوت/ری‌استارت سرویس،
   * پیامک‌های قدیمی صندوق دوباره اعلام نشوند.
   */
  @Synchronized
  fun lastProcessedSmsDate(context: Context): Long {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getLong(KEY_LAST_SMS_DATE, 0L)
    } catch (t: Throwable) {
      0L
    }
  }

  @Synchronized
  fun setLastProcessedSmsDate(context: Context, value: Long) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putLong(KEY_LAST_SMS_DATE, value).apply()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  /**
   * شناسه‌ی آخرین ردیف صندوق ورودی که سرویس دائمی پردازش کرده است (`_id` در
   * `content://sms/inbox`).
   *
   * چرا تاریخ کافی نیست: دو پیامک می‌توانند مهر زمانی یکسان یا حتی کمی
   * عقب‌تر داشته باشند (تحویل دیرهنگام، تنظیم ساعت). شناسه‌ی ردیف در دفتر
   * پیامک یکتا و صعودی است، پس مرز دقیق است و نه واریزی جا می‌ماند، نه یک
   * ردیف دوباره خوانده می‌شود. تاریخ فقط برای مهاجرت از نسخه‌ی قبل و
   * وقتی دفتر پیامک `_id` نمی‌دهد استفاده می‌شود.
   */
  @Synchronized
  fun lastSeenSmsId(context: Context): Long {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getLong(KEY_LAST_SMS_ID, 0L)
    } catch (t: Throwable) {
      0L
    }
  }

  @Synchronized
  fun setLastSeenSmsId(context: Context, value: Long) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putLong(KEY_LAST_SMS_ID, value).apply()
    } catch (t: Throwable) {
      // نادیده
    }
  }

  /** مرز شناسه را با مقدار بزرگ‌تر جلو می‌برد؛ هرگز عقب نمی‌آید. */
  @Synchronized
  fun advanceLastSeenSmsId(context: Context, value: Long) {
    if (value <= 0L) return
    if (value <= lastSeenSmsId(context)) return
    setLastSeenSmsId(context, value)
  }

  private fun readStrings(array: JSONArray?): List<String> {
    if (array == null) return emptyList()
    val result = mutableListOf<String>()
    for (index in 0 until array.length()) {
      val value = array.optString(index, "")
      if (value.isNotBlank()) result.add(value.trim())
    }
    return result
  }
}
