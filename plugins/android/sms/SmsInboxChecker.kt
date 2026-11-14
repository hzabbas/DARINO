package com.darino.app.sms

import android.content.Context
import android.net.Uri
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * خواندن صندوق ورودی پیامک و اعلام واریزهای تازه.
 *
 * این مسیر «تور نجات» سرویس دائمی است: اگر ROM گیرنده‌ی `SMS_RECEIVED` را
 * خوابانده باشد (شیائومی/HyperOS)، هنوز ردیف تازه‌ی `content://sms/inbox` را
 * می‌بینیم و همان واریز را اعلام می‌کنیم.
 *
 * چند نکته‌ی مهم که قبلاً باگ بود:
 *  - **هم‌زمانی:** اگر هنگام یک بررسی، پیامک تازه‌ای برسد، درخواست بعدی باید
 *    دوباره اجرا شود؛ قبلاً آن درخواست بی‌صدا دور ریخته می‌شد و واریز از دست
 *    می‌رفت. حالا یک پرچم «دوباره اجرا کن» دارد.
 *  - **آبشار زمانی:** مرز خواندن با `date >= last` است (نه `>`), چون دو پیامک
 *    می‌توانند مهر زمانی یکسان داشته باشند. تکرار با کلید ضدتکرار اعلام حذف
 *    می‌شود، پس خواندن دوباره‌ی یک ردیف صدا نمی‌دهد.
 *  - **بازیابی بعد از کشته‌شدن سرویس:** اگر سرویس نیم ساعت پیش کشته شده باشد،
 *    واریزهای داخل همین بازه هنگام برگشت اعلام می‌شوند؛ پیامک‌های خیلی قدیمی
 *    فقط مرز را جلو می‌برند تا ساعت‌ها بعد یک‌جا خوانده نشوند.
 */
object SmsInboxChecker {
  private const val TAG = "DarinoVoice"

  /** سقف ردیف هر دور؛ با LIMIT کوچک، بروزرسانی سریع می‌ماند. */
  private const val MAX_ROWS = 40

  /** حداکثر دور پشت‌سرهم در یک درخواست؛ جلوگیری از حلقه‌ی بی‌پایان. */
  private const val MAX_PASSES = 4

  /**
   * حداکثر سن پیامکی که هنوز ارزش گفتن دارد. سرویس بعد از کشته‌شدن هم برمی‌گردد؛
   * بدون این سقف، آرشیو قدیمی یک‌جا خوانده می‌شد.
   */
  private const val MAX_ANNOUNCE_AGE_MS = 30 * 60 * 1000L

  private val running = AtomicBoolean(false)
  private val rerun = AtomicBoolean(false)

  /** بررسی کامل صندوق؛ باید از یک رشته‌ی پس‌زمینه صدا زده شود. */
  fun request(context: Context) {
    val app = context.applicationContext
    if (!running.compareAndSet(false, true)) {
      rerun.set(true)
      return
    }

    try {
      var pass = 0
      while (pass < MAX_PASSES) {
        rerun.set(false)
        pass += 1
        val more = runOnce(app)
        if (!more && !rerun.get()) break
      }
    } catch (t: Throwable) {
      Log.w(TAG, "inbox check failed: ${t.message}")
    } finally {
      running.set(false)
    }
  }

  /** یک دور خواندن؛ `true` یعنی ممکن است ردیف تازه‌ی بیشتری مانده باشد. */
  private fun runOnce(context: Context): Boolean {
    val config = VoiceConfigStore.read(context)
    if (!config.enabled) return false

    val last = VoiceConfigStore.lastProcessedSmsDate(context)
    val now = System.currentTimeMillis()

    if (last <= 0L) {
      // اولین اجرا: تاریخچه‌ی موجود را نادیده بگیر و از «تازه‌ترین پیامک» شروع کن
      // (نه از همین لحظه) تا پیامکی که چند ثانیه قبل رسیده از دست نرود.
      VoiceConfigStore.setLastProcessedSmsDate(context, newestInboxDate(context) ?: now)
      return false
    }

    var newest = last
    var rows = 0
    val threshold = (last - 1L).coerceAtLeast(0L)

    val cursor = context.contentResolver.query(
      Uri.parse("content://sms/inbox"),
      arrayOf("address", "body", "date"),
      "date >= ?",
      arrayOf(threshold.toString()),
      "date ASC LIMIT $MAX_ROWS"
    )

    cursor?.use { result ->
      val addressIndex = result.getColumnIndex("address")
      val bodyIndex = result.getColumnIndex("body")
      val dateIndex = result.getColumnIndex("date")

      while (result.moveToNext()) {
        rows += 1
        val date = result.getLong(dateIndex)
        if (date > newest) newest = date

        val address = result.getString(addressIndex)?.trim().orEmpty()
        val body = result.getString(bodyIndex)?.trim().orEmpty()
        if (address.isEmpty() || body.isEmpty()) continue

        // پیامک قدیمی فقط مرز را جلو می‌برد، ولی گفته نمی‌شود.
        if (date < now - MAX_ANNOUNCE_AGE_MS) continue

        SmsPipeline.handle(context, address, body, date)
      }
    }

    if (newest > last) VoiceConfigStore.setLastProcessedSmsDate(context, newest)

    return rows >= MAX_ROWS
  }

  /** تاریخ تازه‌ترین پیامک صندوق ورودی؛ برای شروع امن در اولین اجرا. */
  private fun newestInboxDate(context: Context): Long? {
    return try {
      val cursor = context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("date"),
        null,
        null,
        "date DESC LIMIT 1"
      )
      cursor?.use { rows ->
        if (rows.moveToFirst()) {
          val date = rows.getLong(rows.getColumnIndex("date"))
          if (date > 0L) date else null
        } else {
          null
        }
      }
    } catch (t: Throwable) {
      null
    }
  }
}
