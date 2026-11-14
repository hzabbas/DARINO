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
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/**
 * پل جاوااسکریپت ↔ پیامک‌های گوشی.
 *
 * فقط خواندن دفتر پیامک (content://sms/inbox) و ثبت سرشماره‌ها؛ هیچ سرویس
 * پس‌زمینه یا پولینگی وجود ندارد.
 *
 * قاعده‌ی سخت این فایل: **هیچ @ReactMethod نباید استثنا پرتاب کند.** استثنای
 * گرفته‌نشده از یک متد بومی، در بیلد release به کرش فوری برنامه تبدیل می‌شود
 * (جاوااسکریپت حتی فرصت گرفتن آن را ندارد). پس هر متد یا پیمان را resolve می‌کند
 * یا در بدترین حالت یک مقدار خالی/پیش‌فرض برمی‌گرداند.
 */
class SmsReaderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SmsReader"

  private fun hasPermissions(): Boolean {
    return try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        true
      } else {
        val read = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_SMS)
        val receive = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECEIVE_SMS)
        read == PackageManager.PERMISSION_GRANTED && receive == PackageManager.PERMISSION_GRANTED
      }
    } catch (t: Throwable) {
      false
    }
  }

  @ReactMethod
  fun hasPermission(promise: Promise) {
    val granted = try {
      hasPermissions()
    } catch (t: Throwable) {
      false
    }
    promise.resolve(granted)
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    try {
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
        // اکتیویتی هنوز آماده نیست (شروع سرد)؛ «نه» امن‌ترین پاسخ است و کاربر
        // می‌تواند بعداً از تنظیمات دوباره درخواست بدهد.
        promise.resolve(false)
      }
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** لیست یکتای فرستنده‌های اخیر با آخرین متن هرکدام. */
  @ReactMethod
  fun getRecentSmsSenders(promise: Promise) {
    val empty = Arguments.createArray()
    try {
      if (!hasPermissions()) {
        promise.reject("E_SMS_PERMISSION", "دسترسی خواندن پیامک داده نشده است")
        return
      }

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
    } catch (t: Throwable) {
      // خطای دفتر پیامک (permission revoked، cursor بسته، …) نباید اپ را ببندد
      promise.resolve(empty)
    }
  }

  /** پیامک‌های بعد از یک زمان مشخص، فقط از سرشماره‌های انتخابی کاربر. */
  @ReactMethod
  fun getSmsMessagesSince(timestamp: Double, senders: ReadableArray, promise: Promise) {
    val empty: WritableArray = Arguments.createArray()
    try {
      if (!hasPermissions()) {
        promise.reject("E_SMS_PERMISSION", "دسترسی خواندن پیامک داده نشده است")
        return
      }

      // هر سرشماره با همه‌ی شکل‌های ممکنش جست‌وجو می‌شود؛ چون کاربر ممکن است
      // «09999987641» را ذخیره کرده باشد ولی بانک پیامک را از «+989****7641»
      // فرستاده باشد و در آن حالت کوئری `address IN (…)` هیچ ردیفی پیدا نمی‌کرد.
      val allowed = LinkedHashSet<String>()
      for (index in 0 until senders.size()) {
        val raw = senders.getString(index) ?: continue
        for (variant in SmsSender.variants(raw)) {
          if (variant.isNotEmpty()) allowed.add(variant)
        }
      }

      if (allowed.isEmpty()) {
        promise.resolve(empty)
        return
      }

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
    } catch (t: Throwable) {
      promise.resolve(empty)
    }
  }

  /** سرشماره‌هایی که گیرنده‌ی بومی باید به آن‌ها واکنش نشان دهد. */
  @ReactMethod
  fun setBankSenders(senders: ReadableArray) {
    try {
      val list = mutableListOf<String>()
      for (index in 0 until senders.size()) {
        senders.getString(index)?.let { if (it.isNotBlank()) list.add(it.trim()) }
      }
      SmsStore.setSenders(reactContext, list)
    } catch (t: Throwable) {
      // ثبت سرشماره شکست بخورد یعنی فقط پیامک‌های خودکار نمی‌آیند؛ خود اپ سالم است
    }
  }

  /**
   * پیامک‌های جمع‌شده توسط گیرنده، برای ثبت. صف **پاک نمی‌شود**؛ جاوااسکریپت بعد از
   * ثبت موفق در SQLite با [clearQueue] ردیف‌های خوانده‌شده را پاک می‌کند.
   * خروجی: `{"items": [...], "maxSeq": n}`
   */
  @ReactMethod
  fun readQueue(promise: Promise) {
    try {
      promise.resolve(SmsStore.read(reactContext))
    } catch (t: Throwable) {
      promise.resolve("{\"items\":[],\"maxSeq\":0}")
    }
  }

  /** پاک‌کردن ردیف‌های خوانده‌شده (seq ≤ maxSeq)؛ فقط بعد از ثبت در دیتابیس. */
  @ReactMethod
  fun clearQueue(maxSeq: Double, promise: Promise) {
    try {
      SmsStore.clearUpTo(reactContext, maxSeq.toLong())
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
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
    } catch (t: Throwable) {
      // اکتیویتی ممکن است در شروع سرد هنوز آماده نباشد؛ این «هیچ اکشنی نیست» است
      promise.resolve(null)
    }
  }

  /**
   * تنظیمات و کارت‌های اعلام صوتی را در SharedPreferences بومی ذخیره می‌کند.
   * گیرنده‌ی پیامک وقتی برنامه بسته است از همین‌جا می‌خواند.
   */
  @ReactMethod
  fun syncVoiceConfig(configJson: String, promise: Promise) {
    try {
      val saved = VoiceConfigStore.save(reactContext, configJson)
      if (saved) {
        val config = VoiceConfigStore.read(reactContext)
        // سرشماره‌های بانکی هم از دل همین تنظیمات به‌روز می‌شوند تا گیرنده‌ی
        // بومی مستقل از باز بودن اپ بداند کدام پیامک‌ها را تعقیب کند.
        SmsStore.setSenders(reactContext, config.senders)

        // موتور آواکور چند ثانیه برای بالا آمدن وقت می‌برد؛ همین حالا که کاربر در
        // تنظیمات است گرمش می‌کنیم تا لحظه‌ی رسیدن پیامک بی‌درنگ صدا بدهد.
        if (config.service == VoiceService.AVACORE) {
          Thread {
            try {
              AvaCoreVoice.warm(reactContext.applicationContext)
            } catch (t: Throwable) {
              // گرم‌کردن اختیاری است؛ اعلام خودش دوباره تلاش می‌کند
            }
          }.start()
        }
      }
      promise.resolve(saved)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** وضعیت موتور آواکور برای نمایش در تنظیمات (نصب بودن و نسخه). */
  @ReactMethod
  fun getVoiceEngineStatus(promise: Promise) {
    try {
      val status = AvaCoreVoice.status(reactContext)
      val map = Arguments.createMap()
      map.putBoolean("avacoreInstalled", status.installed)
      map.putString("avacoreVersion", status.versionName)
      promise.resolve(map)
    } catch (t: Throwable) {
      val map = Arguments.createMap()
      map.putBoolean("avacoreInstalled", false)
      map.putString("avacoreVersion", null)
      promise.resolve(map)
    }
  }

  /**
   * پخش فوری جمله‌ی نمونه با همان قالب و همان سرویس انتخاب‌شده؛ برای دکمه‌ی
   * «تست صدای گوینده» در تنظیمات. روی یک رشته‌ی جداگانه اجرا می‌شود و **بعد از
   * پایان پخش** پاسخ می‌دهد تا اگر گوینده شکست خورد، تنظیمات متوجه شود و سکوت
   * بی‌دلیل نماند.
   */
  @ReactMethod
  fun testVoiceAnnouncement(options: ReadableMap, promise: Promise) {
    try {
      Thread {
        val played = try {
          DepositVoiceAnnouncer.announceTest(
            reactContext.applicationContext,
            template = if (options.hasKey("template")) options.getString("template") else null,
            service = if (options.hasKey("service")) options.getString("service") ?: "" else "",
            gender = if (options.hasKey("gender")) options.getString("gender") ?: "female" else "female",
            playChime = options.hasKey("chime") && options.getBoolean("chime"),
            rate = if (options.hasKey("rate")) options.getDouble("rate").toFloat() else VoiceRate.DEFAULT,
            amountToman = if (options.hasKey("amount")) options.getDouble("amount").toLong() else 70_000L,
            payerName = if (options.hasKey("payerName")) options.getString("payerName") else null,
            bankName = if (options.hasKey("bankName")) options.getString("bankName") else null,
            cardNumber = if (options.hasKey("cardNumber")) options.getString("cardNumber") else null
          )
        } catch (t: Throwable) {
          false
        }
        try {
          promise.resolve(played)
        } catch (t: Throwable) {
          // promise ممکن است قبلاً resolve شده باشد
        }
      }.start()
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  companion object {
    private const val REQUEST_CODE = 9124
  }
}
