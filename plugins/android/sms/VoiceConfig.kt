package com.darino.app.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Bank card account eligible for voice announcements. */
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
 * Speech synthesis engines supported by Darino:
 *  - [LOCAL]: On-device neural voice (sherpa-onnx + Piper)
 *  - [NEURAL]: Online neural voice (Microsoft Edge TTS)
 *  - [CLIPS]: Packaged offline audio clips
 *  - [SYSTEM]: Android system TextToSpeech
 */
object VoiceService {
  const val LOCAL = "local"
  const val NEURAL = "neural"
  const val CLIPS = "clips"
  const val SYSTEM = "system"

  val ALL = listOf(LOCAL, NEURAL, CLIPS, SYSTEM)

  /** Normalizes legacy engine keys to current standard names. */
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

/** Result of a voice playback attempt. */
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

/** Speech rate constraints (1.0 = normal, 0.6 = slowest, 1.4 = fastest). */
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

/** Voice pitch / tone constraints (1.0 = normal, 0.8 = bass, 1.25 = treble). */
object VoicePitch {
  const val DEFAULT = 1.0f
  const val BASS = 0.8f
  const val NORMAL = 1.0f
  const val TREBLE = 1.25f
  const val MIN = 0.5f
  const val MAX = 1.8f

  fun normalize(value: Float): Float {
    if (!value.isFinite()) return DEFAULT
    if (value == 0.0f) return DEFAULT
    return value.coerceIn(MIN, MAX)
  }

  fun normalize(value: Double): Float = normalize(value.toFloat())
}

/** Audio volume gain constraints (1.0 = 100%, 0.5 = 50%, 2.0 = 200%). */
object VoiceGain {
  const val DEFAULT = 1.0f
  const val MIN = 0.5f
  const val MAX = 2.0f

  fun normalize(value: Float): Float {
    if (!value.isFinite()) return DEFAULT
    return value.coerceIn(MIN, MAX)
  }

  fun normalize(value: Double): Float = normalize(value.toFloat())
}

/** Complete voice announcer configuration. */
data class VoiceConfig(
  val enabled: Boolean,
  val gender: String,
  val chime: Boolean,
  val senders: List<String>,
  val accounts: List<VoiceAccount>,
  val service: String = VoiceService.NEURAL,
  val template: String = SpeechTemplate.DEFAULT,
  val rate: Float = VoiceRate.DEFAULT,
  val pitch: Float = 0.0f,
  val gain: Float = 1.0f,
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

    /** Matches incoming SMS body/sender against configured bank accounts. */
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
 * SharedPreferences storage for background voice announcer settings.
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
      normalized.put(
        "template",
        SpeechTemplate.sanitize(input.optString("template", SpeechTemplate.DEFAULT))
      )
      normalized.put("rate", VoiceRate.normalize(input.optDouble("rate", VoiceRate.DEFAULT.toDouble())))

      val pitch = input.optDouble("pitch", input.optDouble("sherpaPitch", 0.0))
      val gain = input.optDouble("gain", input.optDouble("sherpaGain", 1.0)).coerceIn(0.5, 2.0)
      normalized.put("pitch", pitch)
      normalized.put("gain", gain)
      normalized.put("sherpaPitch", pitch)
      normalized.put("sherpaGain", gain)

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
   * Synchronously persists voice selection before live test execution.
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
      normalized.put("pitch", current.pitch.toDouble())
      normalized.put("gain", current.gain.toDouble())
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

      val pitch = input.optDouble("pitch", input.optDouble("sherpaPitch", 0.0)).toFloat()
      val gain = input.optDouble("gain", input.optDouble("sherpaGain", 1.0)).toFloat().coerceIn(0.5f, 2.0f)

      VoiceConfig(
        enabled = input.optBoolean("enabled", false),
        gender = if (input.optString("gender", "female") == "male") "male" else "female",
        chime = input.optBoolean("chime", false),
        senders = senders,
        accounts = accounts,
        service = VoiceService.normalize(input.optString("service", VoiceService.NEURAL)),
        template = SpeechTemplate.sanitize(input.optString("template", SpeechTemplate.DEFAULT)),
        rate = VoiceRate.normalize(input.optDouble("rate", VoiceRate.DEFAULT.toDouble())),
        pitch = pitch,
        gain = gain,
        sherpaPitch = pitch,
        sherpaGain = gain,
        sherpaSpeakerId = input.optInt("sherpaSpeakerId", -1),
        sherpaThreads = input.optInt("sherpaThreads", 2).coerceIn(1, 4)
      )
    } catch (t: Throwable) {
      VoiceConfig.DISABLED
    }
  }

  /**
   * Persists fine-tuning voice parameters (pitch, gain, speakerId, threads).
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
      normalized.put("pitch", pitch.toDouble())
      normalized.put("gain", gain.toDouble().coerceIn(0.5, 2.0))
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

  /** Checks if SMS was already announced to avoid duplicates. */
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
      true
    }
  }

  @Synchronized
  fun clearSeen(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().remove(KEY_SEEN).apply()
    } catch (t: Throwable) {
      // Ignore
    }
  }

  /** Timestamp (ms) of the latest SMS read by background service. */
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
      // Ignore
    }
  }

  /** Highest SMS row id processed by background service (_id in content://sms/inbox). */
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
      // Ignore
    }
  }

  /** Advances last seen SMS id monotonically. */
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
