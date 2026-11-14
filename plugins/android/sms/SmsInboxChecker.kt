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
 *  - **مرز دقیق:** مرز خواندن شناسه‌ی ردیف (`_id`) است، نه مهر زمانی. دو
 *    پیامک می‌توانند مهر زمانی یکسان یا کمی عقب‌تر داشته باشند (تحویل دیرهنگام،
 *    تنظیم ساعت) و با مرز تاریخی یکی از دست می‌رفت. `_id` صعودی و یکتاست.
 *  - **هم‌زمانی:** اگر هنگام یک بررسی، پیامک تازه‌ای برسد، درخواست بعدی باید
 *    دوباره اجرا شود؛ قبلاً آن درخواست بی‌صدا دور ریخته می‌شد و واریز از دست
 *    می‌رفت. حالا یک پرچم «دوباره اجرا کن» دارد.
 *  - **بیدار ماندن:** قبل از کوئری یک `PARTIAL_WAKE_LOCK` گرفته می‌شود و تا
 *    پایان پخش نگه داشته می‌شود تا صفحه‌ی خاموش باعث خواب CPU و گم‌شدن صدا
 *    نشود.
 *  - **بازیابی بعد از کشته‌شدن سرویس:** اگر سرویس نیم ساعت پیش کشته شده باشد،
 *    واریزهای داخل همین بازه هنگام برگشت اعلام می‌شوند؛ پیامک‌های خیلی قدیمی
 *    فقط مرز را جلو می‌برند تا ساعت‌ها بعد یک‌جا خوانده نشوند.
 *  - **مهاجرت:** نسخه‌های قبل فقط تاریخ ذخیره می‌کردند. اگر شناسه‌ی مرز خالی
 *    باشد ولی تاریخ قبلی موجود باشد، یک‌بار با همان تاریخ می‌خوانیم و از آن
 *    به بعد مرز شناسه استفاده می‌شود.
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

    val wakeLock = VoiceWakeLock.acquire(app)
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
      VoiceWakeLock.release(wakeLock)
      running.set(false)
    }
  }

  /** یک دور خواندن؛ `true` یعنی ممکن است ردیف تازه‌ی بیشتری مانده باشد. */
  private fun runOnce(context: Context): Boolean {
    val config = VoiceConfigStore.read(context)
    if (!config.enabled) return false

    val lastId = VoiceConfigStore.lastSeenSmsId(context)
    if (lastId <= 0L) return bootstrap(context)

    return readAfterId(context, lastId)
  }

  /**
   * اولین اجرا یا مهاجرت از نسخه‌ی تاریخ‌محور.
   *
   * اگر مرز تاریخی قبلی وجود دارد، یک‌بار با تاریخ می‌خوانیم تا واریزهای همان
   * بازه از دست نروند؛ وگرنه فقط مرز را روی تازه‌ترین ردیف می‌گذاریم تا آرشیو
   * قدیمی یک‌جا خوانده نشود.
   */
  private fun bootstrap(context: Context): Boolean {
    val newest = newestInboxRow(context)
    val legacyDate = VoiceConfigStore.lastProcessedSmsDate(context)

    if (legacyDate > 0L) {
      val more = readAfterDate(context, legacyDate)
      newest?.let { VoiceConfigStore.advanceLastSeenSmsId(context, it.first) }
      return more
    }

    if (newest != null) {
      VoiceConfigStore.setLastSeenSmsId(context, newest.first)
      VoiceConfigStore.setLastProcessedSmsDate(context, newest.second)
    } else {
      VoiceConfigStore.setLastProcessedSmsDate(context, System.currentTimeMillis())
    }
    return false
  }

  /** مسیر اصلی: ردیف‌هایی که `_id` آن‌ها از مرز بزرگ‌تر است. */
  private fun readAfterId(context: Context, lastId: Long): Boolean {
    val cursor = try {
      context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "_id > ?",
        arrayOf(lastId.toString()),
        "_id ASC LIMIT $MAX_ROWS"
      )
    } catch (t: Throwable) {
      Log.w(TAG, "inbox id query failed: ${t.message}")
      null
    } ?: return false

    cursor.use { result ->
      val idIndex = result.getColumnIndex("_id")
      val addressIndex = result.getColumnIndex("address")
      val bodyIndex = result.getColumnIndex("body")
      val dateIndex = result.getColumnIndex("date")

      // بعضی دفترهای پیامک غیراستاندارد ستون `_id` نمی‌دهند؛ با تاریخ ادامه بده.
      if (idIndex < 0) {
        return readAfterDateWithCursor(
          context,
          result,
          addressIndex,
          bodyIndex,
          dateIndex,
          lastIdDateFallback(context)
        )
      }

      var newestId = lastId
      var newestDate = VoiceConfigStore.lastProcessedSmsDate(context)
      var rows = 0

      while (result.moveToNext()) {
        rows += 1
        val id = result.getLong(idIndex)
        val date = result.getLong(dateIndex)
        if (id > newestId) newestId = id
        if (date > newestDate) newestDate = date

        val address = result.getString(addressIndex)?.trim().orEmpty()
        val body = result.getString(bodyIndex)?.trim().orEmpty()
        if (address.isEmpty() || body.isEmpty()) continue

        // پیامک قدیمی فقط مرز را جلو می‌برد، ولی گفته نمی‌شود.
        if (date < System.currentTimeMillis() - MAX_ANNOUNCE_AGE_MS) continue

        SmsPipeline.handle(context, address, body, date)
      }

      VoiceConfigStore.advanceLastSeenSmsId(context, newestId)
      if (newestDate > 0L) VoiceConfigStore.setLastProcessedSmsDate(context, newestDate)

      return rows >= MAX_ROWS
    }
  }

  /**
   * مسیر مهاجرت/پشتیبان: با تاریخ می‌خواند (`date >= last`، نه `>`), چون دو
   * پیامک می‌توانند مهر زمانی یکسان داشته باشند. ضدتکرار اعلام، خواندن دوباره
   * را بی‌صدا می‌کند.
   */
  private fun readAfterDate(context: Context, last: Long): Boolean {
    return try {
      val cursor = context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date >= ?",
        arrayOf((last - 1L).coerceAtLeast(0L).toString()),
        "date ASC LIMIT $MAX_ROWS"
      ) ?: return false

      cursor.use { result ->
        val idIndex = result.getColumnIndex("_id")
        readAfterDateWithCursor(
          context,
          result,
          result.getColumnIndex("address"),
          result.getColumnIndex("body"),
          result.getColumnIndex("date"),
          last,
          idIndex
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "inbox date query failed: ${t.message}")
      false
    }
  }

  private fun readAfterDateWithCursor(
    context: Context,
    result: android.database.Cursor,
    addressIndex: Int,
    bodyIndex: Int,
    dateIndex: Int,
    last: Long,
    idIndex: Int = -1
  ): Boolean {
    var rows = 0
    var newestDate = last
    var newestId = 0L

    while (result.moveToNext()) {
      rows += 1
      val date = result.getLong(dateIndex)
      if (date > newestDate) newestDate = date
      if (idIndex >= 0) {
        val id = result.getLong(idIndex)
        if (id > newestId) newestId = id
      }

      val address = result.getString(addressIndex)?.trim().orEmpty()
      val body = result.getString(bodyIndex)?.trim().orEmpty()
      if (address.isEmpty() || body.isEmpty()) continue

      if (date < System.currentTimeMillis() - MAX_ANNOUNCE_AGE_MS) continue

      SmsPipeline.handle(context, address, body, date)
    }

    if (newestId > 0L) VoiceConfigStore.advanceLastSeenSmsId(context, newestId)
    if (newestDate > 0L) VoiceConfigStore.setLastProcessedSmsDate(context, newestDate)
    return rows >= MAX_ROWS
  }

  /** تاریخ مرزِ پشتیبان وقتی ستون `_id` وجود ندارد. */
  private fun lastIdDateFallback(context: Context): Long {
    val date = VoiceConfigStore.lastProcessedSmsDate(context)
    return if (date > 0L) date else System.currentTimeMillis()
  }

  /** شناسه و تاریخ تازه‌ترین پیامک صندوق ورودی؛ برای شروع امن در اولین اجرا. */
  private fun newestInboxRow(context: Context): Pair<Long, Long>? {
    return try {
      val cursor = context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "date"),
        null,
        null,
        "_id DESC LIMIT 1"
      )
      cursor?.use { rows ->
        if (!rows.moveToFirst()) return null

        val idIndex = rows.getColumnIndex("_id")
        val dateIndex = rows.getColumnIndex("date")
        val id = if (idIndex >= 0) rows.getLong(idIndex) else 0L
        val date = if (dateIndex >= 0) rows.getLong(dateIndex) else 0L
        if (id <= 0L && date <= 0L) null else id to date
      }
    } catch (t: Throwable) {
      null
    }
  }
}
