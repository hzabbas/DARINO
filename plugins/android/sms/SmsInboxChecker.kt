package com.darino.app.sms

import android.content.Context
import android.net.Uri
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Polls SMS inbox and announces new deposits.
 * Acts as fallback when dynamic broadcast receivers are killed by OS.
 */
object SmsInboxChecker {
  private const val TAG = "DarinoVoice"

  private const val MAX_ROWS = 40
  private const val MAX_PASSES = 4
  private const val MAX_ANNOUNCE_AGE_MS = 30 * 60 * 1000L

  private val running = AtomicBoolean(false)
  private val rerun = AtomicBoolean(false)

  /** Scan inbox; runs from background worker. */
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

  /** Single pass read; returns true if more rows remain. */
  private fun runOnce(context: Context): Boolean {
    val config = VoiceConfigStore.read(context)
    if (!config.enabled) return false

    val lastId = VoiceConfigStore.lastSeenSmsId(context)
    if (lastId <= 0L) return bootstrap(context)

    return readAfterId(context, lastId)
  }

  /** Initializes watermark to latest SMS ID or migrates from timestamp. */
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

  /** Queries rows where _id > lastId. */
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

      // Fallback to timestamp query if _id is unavailable in custom SMS provider
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

        // Skip announcements for messages older than max age threshold
        if (date < System.currentTimeMillis() - MAX_ANNOUNCE_AGE_MS) continue

        SmsPipeline.handle(context, address, body, date)
      }

      VoiceConfigStore.advanceLastSeenSmsId(context, newestId)
      if (newestDate > 0L) VoiceConfigStore.setLastProcessedSmsDate(context, newestDate)

      return rows >= MAX_ROWS
    }
  }

  /** Timestamp-based fallback query. */
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

  /** Fallback date boundary when _id column is unavailable. */
  private fun lastIdDateFallback(context: Context): Long {
    val date = VoiceConfigStore.lastProcessedSmsDate(context)
    return if (date > 0L) date else System.currentTimeMillis()
  }

  /** ID and date of the newest inbox SMS; used for initial bootstrap. */
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
