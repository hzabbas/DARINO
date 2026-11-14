package com.darino.app.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * انبار سبک پیامک‌های بانکی.
 *
 * گیرنده‌ی بومی (SmsReceiver) پیامک‌های بانکی را در SharedPreferences صف می‌کند
 * و جاوااسکریپت آن‌ها را می‌خواند، در SQLite ثبت می‌کند و **بعد از** ثبت موفق
 * فقط همان ردیف‌های خوانده‌شده را پاک می‌کند. هیچ سرویس پس‌زمینه‌ای اجرا نمی‌شود،
 * پس مصرف باتری صفر است.
 *
 * قواعد مهم:
 *  - همه‌ی عملیات‌ها `@Synchronized` هستند. گیرنده‌ی پیامک می‌تواند هم‌زمان با
 *    درخواست جاوااسکریپت روی صف کار کند؛ بدون قفل، یک «بخوان + پاک کن» ساده
 *    پیامکی را که همان لحظه رسیده از دست می‌داد.
 *  - هر ردیف یک `seq` افزایشی دارد. جاوااسکریپت بالاترین seq خوانده‌شده را برمی‌گرداند
 *    و فقط تا همان `seq` را پاک می‌کند؛ پیامکِ رسیده در فاصله‌ی خواندن و پاک‌کردن
 *    (که seq بزرگ‌تری دارد) در صف می‌ماند.
 *  - اگر ثبت در SQLite شکست بخورد، جاوااسکریپت پاک نمی‌کند و همان ردیف‌ها دفعه‌ی
 *    بعد دوباره خوانده می‌شوند (ایمن در برابر تکرار، چون شناسه‌ی پیامک یکتاست).
 *  - هر عملیاتِ دیسک این‌جا داخل try/catch است: فایل تنظیمات خراب، حافظه‌ی پر یا
 *    دسترسی گرفته‌شده نباید هیچ‌وقت به کرش تبدیل شود؛ بدترین حالت این است که یک
 *    پیامک از دست برود، نه این‌که اپ بسته شود.
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
  private const val KEY_SEQ = "queue_seq"
  private const val MAX_QUEUE = 120

  @Synchronized
  fun setSenders(context: Context, senders: List<String>) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString(KEY_SENDERS, JSONArray(senders).toString()).apply()
    } catch (t: Throwable) {
      // ثبت نشدن سرشماره فقط یعنی پیامک خودکار نمی‌آید؛ خود اپ سالم است
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

  /**
   * افزودن یک پیامک به صف. اگر همان امضا (`fingerprint`) قبلاً در صف باشد،
   * دوباره اضافه نمی‌شود و `false` برمی‌گردد تا نوتیفیکیشن تکراری هم نشان داده نشود.
   */
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
      // پیامک از دست می‌رود ولی اپ و بقیه‌ی صف سالم می‌مانند
      false
    }
  }

  /**
   * صف را **بدون پاک‌کردن** برمی‌گرداند: `{"items": [...], "maxSeq": n}`.
   * پاک‌کردن فقط بعد از ثبت در دیتابیس و با [clearUpTo] انجام می‌شود.
   */
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

  /**
   * پاک‌کردن ردیف‌های خوانده‌شده (seq ≤ ورودی)؛ ردیف‌هایی که در فاصله‌ی خواندن و
   * ثبت رسیده‌اند می‌مانند تا دفعه‌ی بعد ثبت شوند.
   */
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
      // نادیده: صف دفعه‌ی بعد دوباره تلاش می‌شود
    }
  }

  /** پاک‌کردن کل صف (برای «ریست») */
  @Synchronized
  fun clear(context: Context) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().remove(KEY_QUEUE).apply()
    } catch (t: Throwable) {
      // نادیده: صف دفعه‌ی بعد دوباره تلاش می‌شود
    }
  }

  private fun readArray(raw: String?): JSONArray {
    return try {
      JSONArray(raw ?: "[]")
    } catch (t: Throwable) {
      JSONArray()
    }
  }
}
