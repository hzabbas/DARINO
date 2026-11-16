package com.darino.app.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Thread-safe persistent queue for incoming bank SMS.
 * Holds unreviewed messages in SharedPreferences until acknowledged by React Native.
 */
object SmsStore {
  const val EXTRA_OPEN_PENDING = "openPendingSms"
  const val EXTRA_SMS_FINGERPRINT = "smsFingerprint"

  private const val PREFS = "darino_sms_reader"
  private const val KEY_SENDERS = "senders"
  private const val KEY_QUEUE = "queue"
  private const val KEY_SEQ = "queue_seq"
  private const val MAX_QUEUE = 120

  @Synchronized
  fun setSenders(context: Context, senders: List<String>) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString(KEY_SENDERS, JSONArray(senders).toString()).apply()
    } catch (t: Throwable) {
      // Ignore
    }
  }

  @Synchronized
  fun getSenders(context: Context): List<String> {
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_SENDERS, null) ?: return emptyList()
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index -> array.optString(index).takeIf { it.isNotEmpty() } }
    } catch (t: Throwable) {
      emptyList()
    }
  }

  /** Appends message to queue if fingerprint does not already exist. */
  @Synchronized
  fun enqueue(context: Context, sender: String, body: String, timestamp: Long, fingerprint: String): Boolean {
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val queue = readArray(prefs.getString(KEY_QUEUE, "[]"))

      for (index in 0 until queue.length()) {
        if (queue.optJSONObject(index)?.optString("fingerprint") == fingerprint) return false
      }

      val seq = prefs.getLong(KEY_SEQ, 0L) + 1L

      val item = JSONObject()
      item.put("sender", sender)
      item.put("body", body)
      item.put("date", timestamp)
      item.put("fingerprint", fingerprint)
      item.put("seq", seq)

      val next = JSONArray()
      next.put(item)
      val limit = minOf(queue.length(), MAX_QUEUE - 1)
      for (index in 0 until limit) {
        next.put(queue.get(index))
      }

      prefs.edit().putString(KEY_QUEUE, next.toString()).putLong(KEY_SEQ, seq).apply()
      true
    } catch (t: Throwable) {
      false
    }
  }

  /** Reads queue items and current maximum sequence number. */
  @Synchronized
  fun read(context: Context): String {
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val queue = readArray(prefs.getString(KEY_QUEUE, "[]"))

      var maxSeq = 0L
      for (index in 0 until queue.length()) {
        val seq = queue.optJSONObject(index)?.optLong("seq", 0L) ?: 0L
        if (seq > maxSeq) maxSeq = seq
      }

      val result = JSONObject()
      result.put("items", queue)
      result.put("maxSeq", maxSeq)
      result.toString()
    } catch (t: Throwable) {
      "{\"items\":[],\"maxSeq\":0}"
    }
  }

  /** Removes processed items with sequence number <= maxSeq. */
  @Synchronized
  fun clearUpTo(context: Context, maxSeq: Long) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val queue = readArray(prefs.getString(KEY_QUEUE, "[]"))

      val remaining = JSONArray()
      for (index in 0 until queue.length()) {
        val item = queue.optJSONObject(index) ?: continue
        if (item.optLong("seq", 0L) > maxSeq) remaining.put(item)
      }

      prefs.edit().putString(KEY_QUEUE, remaining.toString()).apply()
    } catch (t: Throwable) {
      // Ignore
    }
  }

  /** Clears full queue (used on database reset). */
  @Synchronized
  fun clear(context: Context) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().remove(KEY_QUEUE).apply()
    } catch (t: Throwable) {
      // Ignore
    }
  }

  private fun readArray(raw: String?): JSONArray {
    return try {
      if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
    } catch (t: Throwable) {
      JSONArray()
    }
  }
}
