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

/** تنظیمات کاملی که گیرنده‌ی پیامک برای اعلام صوتی لازم دارد. */
data class VoiceConfig(
  val enabled: Boolean,
  val gender: String,
  val chime: Boolean,
  val senders: List<String>,
  val accounts: List<VoiceAccount>
) {
  companion object {
    val DISABLED = VoiceConfig(
      enabled = false,
      gender = "female",
      chime = false,
      senders = emptyList(),
      accounts = emptyList()
    )
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
      normalized.put("senders", JSONArray(senders))
      normalized.put("accounts", JSONArray(accounts))

      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString(KEY_CONFIG, normalized.toString()).apply()
      true
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
        accounts = accounts
      )
    } catch (t: Throwable) {
      VoiceConfig.DISABLED
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
      val seen = JSONArray(prefs.getString(KEY_SEEN, "[]"))

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
