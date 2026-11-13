package com.darino.app.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * انبار سبک پیامک‌های بانکی.
 *
 * گیرنده‌ی بومی (SmsReceiver) پیامک‌های بانکی را در SharedPreferences صف می‌کند
 * و جاوااسکریپت در اولین فرصت آن‌ها را تخلیه و در SQLite ثبت می‌کند. هیچ سرویس
 * پس‌زمینه‌ای اجرا نمی‌شود، پس مصرف باتری صفر است.
 */
object SmsStore {
  /**
   * کلیدهای intent لینک عمیق پیامک. گیرنده‌ی بومی می‌نویسد، ماژول جاوااسکریپت
   * می‌خواند؛ باید یکی باشند، پس این‌جا مشترک نگه داشته می‌شوند.
   */
  const val EXTRA_OPEN_PENDING = "openPendingSms"
  const val EXTRA_SMS_FINGERPRINT = "smsFingerprint"

  private const val PREFS = "darino_sms_reader"
  private const val KEY_SENDERS = "senders"
  private const val KEY_QUEUE = "queue"
  private const val MAX_QUEUE = 120

  fun setSenders(context: Context, senders: List<String>) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putString(KEY_SENDERS, JSONArray(senders).toString()).apply()
  }

  fun getSenders(context: Context): List<String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_SENDERS, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index -> array.optString(index).takeIf { it.isNotEmpty() } }
    } catch (error: Exception) {
      emptyList()
    }
  }

  fun enqueue(context: Context, sender: String, body: String, timestamp: Long, fingerprint: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = try {
      JSONArray(prefs.getString(KEY_QUEUE, "[]"))
    } catch (error: Exception) {
      JSONArray()
    }

    val item = JSONObject()
    item.put("sender", sender)
    item.put("body", body)
    item.put("date", timestamp)
    item.put("fingerprint", fingerprint)

    val next = JSONArray()
    next.put(item)
    val limit = minOf(queue.length(), MAX_QUEUE - 1)
    for (index in 0 until limit) {
      next.put(queue.get(index))
    }

    prefs.edit().putString(KEY_QUEUE, next.toString()).apply()
  }

  /** صف را برمی‌گرداند و پاک می‌کند (اتمیک در حد SharedPreferences). */
  fun drain(context: Context): JSONArray {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
    prefs.edit().putString(KEY_QUEUE, "[]").apply()
    return try {
      JSONArray(raw)
    } catch (error: Exception) {
      JSONArray()
    }
  }

  fun clear(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().remove(KEY_QUEUE).apply()
  }
}
