package com.darino.app.sms

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/**
 * پل جاوااسکریپت ↔ پیامک‌های گوشی.
 *
 * فقط خواندن دفتر پیامک (content://sms/inbox) و ثبت سرشماره‌ها؛ هیچ سرویس
 * پس‌زمینه یا پولینگی وجود ندارد.
 */
class SmsReaderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SmsReader"

  private fun hasPermissions(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val read = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_SMS)
    val receive = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECEIVE_SMS)
    return read == PackageManager.PERMISSION_GRANTED && receive == PackageManager.PERMISSION_GRANTED
  }

  @ReactMethod
  fun hasPermission(promise: Promise) {
    promise.resolve(hasPermissions())
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (hasPermissions()) {
      promise.resolve(true)
      return
    }

    val activity = reactApplicationContext.getCurrentActivity()
    if (activity is PermissionAwareActivity) {
      activity.requestPermissions(
        arrayOf(
          Manifest.permission.READ_SMS,
          Manifest.permission.RECEIVE_SMS,
          Manifest.permission.POST_NOTIFICATIONS
        ),
        REQUEST_CODE,
        PermissionListener { requestCode, _, grantResults ->
          if (requestCode == REQUEST_CODE) {
            promise.resolve(
              grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            )
            true
          } else {
            false
          }
        }
      )
    } else {
      promise.resolve(false)
    }
  }

  /** لیست یکتای فرستنده‌های اخیر با آخرین متن هرکدام. */
  @ReactMethod
  fun getRecentSmsSenders(promise: Promise) {
    if (!hasPermissions()) {
      promise.reject("E_SMS_PERMISSION", "دسترسی خواندن پیامک داده نشده است")
      return
    }

    try {
      val seen = LinkedHashMap<String, MutableMap<String, Any>>()
      val cursor = reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        null,
        null,
        "date DESC"
      )

      cursor?.use { rows ->
        val addressIndex = rows.getColumnIndex("address")
        val bodyIndex = rows.getColumnIndex("body")
        val dateIndex = rows.getColumnIndex("date")
        var visited = 0

        while (rows.moveToNext() && visited < 400) {
          val address = rows.getString(addressIndex) ?: continue
          visited += 1

          val existing = seen[address]
          if (existing == null) {
            seen[address] = mutableMapOf(
              "sender" to address,
              "lastBody" to (rows.getString(bodyIndex) ?: ""),
              "lastDate" to rows.getLong(dateIndex),
              "count" to 1
            )
          } else {
            existing["count"] = ((existing["count"] as Int) + 1)
          }
        }
      }

      val result = Arguments.createArray()
      for (entry in seen.values) {
        val map = Arguments.createMap()
        map.putString("sender", entry["sender"] as String)
        map.putString("lastBody", entry["lastBody"] as String)
        map.putDouble("lastDate", (entry["lastDate"] as Long).toDouble())
        map.putInt("count", entry["count"] as Int)
        result.pushMap(map)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("E_SMS_QUERY", error)
    }
  }

  /** پیامک‌های بعد از یک زمان مشخص، فقط از سرشماره‌های انتخابی کاربر. */
  @ReactMethod
  fun getSmsMessagesSince(timestamp: Double, senders: ReadableArray, promise: Promise) {
    if (!hasPermissions()) {
      promise.reject("E_SMS_PERMISSION", "دسترسی خواندن پیامک داده نشده است")
      return
    }

    // هر سرشماره با همه‌ی شکل‌های ممکنش جست‌وجو می‌شود؛ چون کاربر ممکن است
    // «09999987641» را ذخیره کرده باشد ولی بانک پیامک را از «+989999987641»
    // فرستاده باشد و در آن حالت کوئری `address IN (…)` هیچ ردیفی پیدا نمی‌کرد.
    val allowed = LinkedHashSet<String>()
    for (index in 0 until senders.size()) {
      val raw = senders.getString(index) ?: continue
      for (variant in SmsSender.variants(raw)) {
        if (variant.isNotEmpty()) allowed.add(variant)
      }
    }

    if (allowed.isEmpty()) {
      promise.resolve(Arguments.createArray())
      return
    }

    try {
      val allowedList = allowed.toList()
      val placeholders = allowedList.joinToString(",") { "?" }
      val selection = "date > ? AND address IN ($placeholders)"
      val args = arrayOf(timestamp.toLong().toString()) + allowedList.toTypedArray()

      val cursor = reactContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        selection,
        args,
        "date ASC"
      )

      val result = Arguments.createArray()
      cursor?.use { rows ->
        val idIndex = rows.getColumnIndex("_id")
        val addressIndex = rows.getColumnIndex("address")
        val bodyIndex = rows.getColumnIndex("body")
        val dateIndex = rows.getColumnIndex("date")

        while (rows.moveToNext()) {
          val map = Arguments.createMap()
          map.putString("id", rows.getString(idIndex))
          map.putString("sender", rows.getString(addressIndex))
          map.putString("body", rows.getString(bodyIndex) ?: "")
          map.putDouble("date", rows.getLong(dateIndex).toDouble())
          result.pushMap(map)
        }
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("E_SMS_QUERY", error)
    }
  }

  /** سرشماره‌هایی که گیرنده‌ی بومی باید به آن‌ها واکنش نشان دهد. */
  @ReactMethod
  fun setBankSenders(senders: ReadableArray) {
    val list = mutableListOf<String>()
    for (index in 0 until senders.size()) {
      senders.getString(index)?.let { if (it.isNotBlank()) list.add(it.trim()) }
    }
    SmsStore.setSenders(reactContext, list)
  }

  /** پیامک‌های جمع‌شده توسط گیرنده، برای ثبت فوری. */
  @ReactMethod
  fun drainQueue(promise: Promise) {
    try {
      promise.resolve(SmsStore.drain(reactContext).toString())
    } catch (error: Exception) {
      promise.reject("E_SMS_QUEUE", error)
    }
  }

  @ReactMethod
  fun clearQueue(promise: Promise) {
    SmsStore.clear(reactContext)
    promise.resolve(true)
  }

  /**
   * اکشنی که برنامه با آن باز شده است (لمس نوتیفیکیشن پیامک بانکی).
   *
   * نوتیفیکیشن یک intent صریح با داده‌ی `darino://pending-sms?...&sms=<امضا>` و
   * دو extra می‌فرستد. این متد هر دو را می‌خواند و بلافاصله پاک می‌کند (یک‌بار
   * مصرف) تا با هر بار بازگشت به برنامه دوباره صف تایید باز نشود.
   * خروجی `null` یعنی برنامه از راه نوتیفیکیشن باز نشده است.
   */
  @ReactMethod
  fun getInitialNotificationAction(promise: Promise) {
    try {
      val intent = reactApplicationContext.getCurrentActivity()?.intent
      val extras = intent?.extras
      val open = extras?.getBoolean(SmsStore.EXTRA_OPEN_PENDING, false) == true
      val fingerprint = extras?.getString(SmsStore.EXTRA_SMS_FINGERPRINT)
      val url = intent?.dataString

      if (!open && fingerprint.isNullOrEmpty() && url.isNullOrEmpty()) {
        promise.resolve(null)
        return
      }

      intent?.removeExtra(SmsStore.EXTRA_OPEN_PENDING)
      intent?.removeExtra(SmsStore.EXTRA_SMS_FINGERPRINT)
      intent?.data = null

      val map = Arguments.createMap()
      map.putBoolean("open", true)
      map.putString("smsFingerprint", fingerprint)
      map.putString("url", url)
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("E_SMS_ACTION", error)
    }
  }

  companion object {
    private const val REQUEST_CODE = 9124
  }
}
