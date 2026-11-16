package com.darino.app.sms

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/**
 * JS bridge for SMS reader and background services.
 * Read-only inbox access and bank sender registration.
 * React methods catch all throwables to prevent release-build native crashes.
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

  private fun hasNotificationPermission(): Boolean {
    return try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        true
      } else {
        ContextCompat.checkSelfPermission(
          reactContext,
          Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
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
      val activity = reactApplicationContext.getCurrentActivity()
      val smsGranted = hasPermissions()
      val notificationsGranted = hasNotificationPermission()

      // Android 13+ requires POST_NOTIFICATIONS for foreground service notification
      if (smsGranted && notificationsGranted) {
        promise.resolve(true)
        return
      }

      val permissions = mutableListOf<String>()
      if (!smsGranted) {
        permissions.add(Manifest.permission.READ_SMS)
        permissions.add(Manifest.permission.RECEIVE_SMS)
      }
      if (!notificationsGranted) {
        permissions.add(Manifest.permission.POST_NOTIFICATIONS)
      }

      if (activity is PermissionAwareActivity) {
        val requestCode = REQUEST_CODE
        activity.requestPermissions(
          permissions.toTypedArray(),
          requestCode,
          PermissionListener { code, requested, grantResults ->
            if (code == requestCode) {
              val smsIndex = requested.indexOf(Manifest.permission.READ_SMS)
              val smsOk = if (smsIndex >= 0) {
                grantResults.getOrNull(smsIndex) == PackageManager.PERMISSION_GRANTED
              } else {
                hasPermissions()
              }
              promise.resolve(smsOk)
              true
            } else {
              false
            }
          }
        )
      } else {
        // Activity not ready on cold start; user can retry from settings
        promise.resolve(false)
      }
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Unique recent senders with their last body and timestamp. */
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
      // Inbox query error should not crash the app
      promise.resolve(empty)
    }
  }

  /** Read SMS messages after a timestamp for specific senders. */
  @ReactMethod
  fun getSmsMessagesSince(timestamp: Double, senders: ReadableArray, promise: Promise) {
    val empty: WritableArray = Arguments.createArray()
    try {
      if (!hasPermissions()) {
        promise.reject("E_SMS_PERMISSION", "دسترسی خواندن پیامک داده نشده است")
        return
      }

      // Query all number format variants (e.g. 09..., +989...)
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

  /** Bank sender phone numbers or display names monitored by native receiver. */
  @ReactMethod
  fun setBankSenders(senders: ReadableArray) {
    try {
      val list = mutableListOf<String>()
      for (index in 0 until senders.size()) {
        senders.getString(index)?.let { if (it.isNotBlank()) list.add(it.trim()) }
      }
      SmsStore.setSenders(reactContext, list)
    } catch (t: Throwable) {
      // Ignored if storing senders fails
    }
  }

  /**
   * Pending SMS messages queued by native receiver.
   * Queue is NOT cleared until JavaScript explicitly calls [clearQueue].
   * Format: `{"items": [...], "maxSeq": n}`
   */
  @ReactMethod
  fun readQueue(promise: Promise) {
    try {
      promise.resolve(SmsStore.read(reactContext))
    } catch (t: Throwable) {
      promise.resolve("{\"items\":[],\"maxSeq\":0}")
    }
  }

  /** Clear processed items up to maxSeq after SQLite transaction commit. */
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
   * Initial launch action from bank SMS notification tap.
   * Clears intent extras on read to ensure single consumption.
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
      // Activity might not be ready on cold start
      promise.resolve(null)
    }
  }

  /** Persists voice announcer settings into native SharedPreferences. */
  @ReactMethod
  fun syncVoiceConfig(configJson: String, promise: Promise) {
    try {
      val saved = VoiceConfigStore.save(reactContext, configJson)
      if (saved) {
        val config = VoiceConfigStore.read(reactContext)
        // Keep monitored bank senders in sync with voice config
        SmsStore.setSenders(reactContext, config.senders)

        // Start or stop persistent service based on enabled flag
        if (config.enabled) {
          if (!VoiceAnnouncerService.start(reactContext)) {
            VoiceGuardScheduler.scheduleRelaunch(reactContext, 1_000L)
          }
          VoiceGuardScheduler.ensure(reactContext)
        } else {
          VoiceAnnouncerService.stop(reactContext)
        }
      }
      promise.resolve(saved)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /**
   * Plays a live test announcement with the selected engine, voice and rate.
   * Runs asynchronously on a background thread and resolves with strict status.
   */
  @ReactMethod
  fun testVoiceAnnouncement(
    engine: String,
    gender: String,
    rate: Double,
    template: String,
    chimeEnabled: Boolean,
    amountToman: Double,
    promise: Promise
  ) {
    fun answer(result: VoicePlaybackResult) {
      try {
        val map = Arguments.createMap()
        map.putBoolean("ok", result.ok)
        map.putString("engine", result.engine)
        map.putString("message", result.message)
        promise.resolve(map)
      } catch (t: Throwable) {
        // Promise can only resolve once
      }
    }

    try {
      val context = reactContext.applicationContext
      // Synchronously commit parameters before playback
      if (!VoiceConfigStore.saveVoiceSelection(
          context, engine, gender, rate, template, chimeEnabled
        )) {
        answer(VoicePlaybackResult.failure(engine, "ذخیره‌ی تنظیمات صدا برای تست ممکن نشد."))
        return
      }

      Thread {
        val result = try {
          DepositVoiceAnnouncer.announceTest(
            context,
            template = template,
            service = engine,
            gender = gender,
            playChime = chimeEnabled,
            rate = rate.toFloat(),
            amountToman = amountToman.toLong()
          )
        } catch (t: Throwable) {
          VoicePlaybackResult.failure(engine, "اجرای موتور انتخاب‌شده ممکن نشد.")
        }
        answer(result)
      }.start()
    } catch (t: Throwable) {
      answer(VoicePlaybackResult.failure(engine, "اجرای تست صدا ممکن نشد."))
    }
  }

  /** Offline Sherpa-ONNX model status and diagnostics. */
  @ReactMethod
  fun getSherpaInfo(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val map = Arguments.createMap()
      map.putBoolean("bundled", LocalPiperTtsEngine.isBundled(context))
      map.putBoolean("ready", LocalPiperTtsEngine.isReady(context))
      map.putString("modelName", LocalPiperTtsEngine.getModelName(context))
      map.putDouble("modelBytes", LocalPiperTtsEngine.getModelBytes(context).toDouble())
      map.putInt("numSpeakers", LocalPiperTtsEngine.getNumSpeakers())
      promise.resolve(map)
    } catch (t: Throwable) {
      promise.reject("E_SHERPA_INFO", t.message ?: "دریافت اطلاعات موتور آفلاین ممکن نشد")
    }
  }

  /** Re-extracts bundled Sherpa-ONNX model files to app internal storage. */
  @ReactMethod
  fun resetSherpaModel(promise: Promise) {
    Thread {
      try {
        val ok = LocalPiperTtsEngine.resetModel(reactContext.applicationContext)
        promise.resolve(ok)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }.start()
  }

  /** Persists Sherpa-ONNX engine settings into native storage. */
  @ReactMethod
  fun saveSherpaConfig(
    pitch: Double,
    gain: Double,
    speakerId: Int,
    threads: Int,
    promise: Promise
  ) {
    try {
      val ok = VoiceConfigStore.saveSherpaTtsSettings(
        reactContext.applicationContext,
        pitch.toFloat(),
        gain.toFloat(),
        speakerId,
        threads
      )
      promise.resolve(ok)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Checks if the app is excluded from battery optimization. */
  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (power == null) {
        promise.resolve(false)
        return
      }
      promise.resolve(power.isIgnoringBatteryOptimizations(reactContext.packageName))
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Request prompt or settings screen to disable battery optimization. */
  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }

      val power = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (power != null && power.isIgnoringBatteryOptimizations(reactContext.packageName)) {
        promise.resolve(true)
        return
      }

      val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${reactContext.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

      try {
        reactContext.startActivity(direct)
      } catch (t: Throwable) {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(fallback)
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Voice guard persistent foreground service status for settings screen. */
  @ReactMethod
  fun getVoiceGuardStatus(promise: Promise) {
    try {
      val config = VoiceConfigStore.read(reactContext)
      val lastSeen = VoiceGuardScheduler.lastSeen(reactContext)
      val map = Arguments.createMap()
      map.putBoolean("enabled", config.enabled)
      map.putBoolean("running", config.enabled && VoiceGuardScheduler.isAlive(reactContext))
      map.putDouble("lastSeen", lastSeen.toDouble())
      promise.resolve(map)
    } catch (t: Throwable) {
      promise.resolve(null)
    }
  }

  /** Restarts background service on demand. */
  @ReactMethod
  fun restartVoiceGuard(promise: Promise) {
    try {
      if (!VoiceConfigStore.read(reactContext).enabled) {
        promise.resolve(false)
        return
      }
      val started = VoiceAnnouncerService.start(reactContext)
      if (!started) VoiceGuardScheduler.scheduleRelaunch(reactContext, 1_000L)
      // Ensure alarms and JobService guard are scheduled
      VoiceGuardScheduler.ensure(reactContext)
      promise.resolve(started)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Opens vendor-specific autostart or battery management settings. */
  @ReactMethod
  fun openAutoStartSettings(promise: Promise) {
    try {
      val candidates = listOf(
        // Xiaomi / HyperOS
        ComponentName(
          "com.miui.securitycenter",
          "com.miui.permcenter.autostart.AutoStartManagementActivity"
        ),
        // Huawei / Honor
        ComponentName(
          "com.huawei.systemmanager",
          "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
        ),
        ComponentName(
          "com.huawei.systemmanager",
          "com.huawei.systemmanager.optimize.process.ProtectActivity"
        ),
        // Oppo / Realme
        ComponentName(
          "com.coloros.safecenter",
          "com.coloros.safecenter.permission.startup.StartupAppListActivity"
        ),
        ComponentName(
          "com.coloros.safecenter",
          "com.coloros.safecenter.startupapp.StartupAppListActivity"
        ),
        ComponentName(
          "com.oppo.safe",
          "com.oppo.safe.permission.startup.StartupAppListActivity"
        ),
        // Vivo / iQOO
        ComponentName(
          "com.vivo.permissionmanager",
          "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
        ),
        ComponentName(
          "com.iqoo.secure",
          "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
        ),
        // Samsung Device Care
        ComponentName(
          "com.samsung.android.lool",
          "com.samsung.android.sm.ui.battery.BatteryActivity"
        )
      )

      // Direct startActivity inside try-catch to avoid package visibility restrictions
      for (component in candidates) {
        val intent = Intent().setComponent(component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          reactContext.startActivity(intent)
          promise.resolve(true)
          return
        } catch (t: Throwable) {
          // Candidate not supported on this ROM; continue
        }
      }

      val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:${reactContext.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(fallback)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  companion object {
    private const val REQUEST_CODE = 9124
  }
}
