package com.darino.app.sms

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log

/**
 * نگه‌داشتن سرویس دائمی اعلام واریز زنده، حتی وقتی کاربر اپ را کامل می‌بندد.
 *
 * چرا فقط `START_STICKY` کافی نیست: در شیائومی/HyperOS و بعضی ROMها وقتی اپ از
 * «برنامه‌های اخیر» کنار زده می‌شود، کل فرایند کشته می‌شود؛ در آن حالت نه
 * `onDestroy` اجرا می‌شود و نه `onTaskRemoved`، پس هیچ آلارمی هم ست نمی‌شود و
 * اعلام تا باز شدن دستی اپ خاموش می‌ماند.
 *
 * دو نگهبان مستقل این‌جا ست می‌شوند:
 *  ۱. **آلارم زنجیره‌ای ۱۵ دقیقه‌ای** (`WakeReceiver`): فرایند را بیدار می‌کند،
 *     سرویس را بالا می‌آورد و اگر سرویس مرده باشد یک بررسی صندوق پیامک هم
 *     انجام می‌دهد. آلارم‌ها بعد از مرگ فرایند هم تحویل داده می‌شوند.
 *  ۲. **JobScheduler پایدار** (`VoiceGuardJobService`): با `setPersisted(true)`
 *     بعد از بوت هم زنده می‌ماند و مستقل از آلارم، سرویس را بیدار می‌کند.
 *
 * نکته‌ی اندروید ۱۲+: شروع سرویس پیش‌زمینه از پس‌زمینه ممنوع است، مگر با
 * «آلارم دقیق» یا وقتی کاربر بهینه‌سازی باتری اپ را خاموش کرده باشد. پس آلارم
 * تا جای ممکن دقیق ست می‌شود و اگر مجوز آلارم دقیق نبود، به آلارم معمولی
 * برمی‌گردیم.
 */
object VoiceGuardScheduler {
  private const val TAG = "DarinoVoice"
  const val ACTION_WAKE = "com.darino.app.sms.WAKE_VOICE_GUARD"

  /** فاصله‌ی نگهبان؛ کمتر از ۱۵ دقیقه هم JobScheduler اجازه نمی‌دهد. */
  const val WATCHDOG_INTERVAL_MS = 15 * 60 * 1000L

  private const val JOB_ID = 4129
  private const val ALARM_REQUEST = 4130
  private const val PREFS = "darino_voice_guard"
  private const val KEY_ALIVE = "alive_at"

  /** اگر تا این مدت ضربان نرسد، سرویس را مرده حساب می‌کنیم. */
  private const val ALIVE_TOLERANCE_MS = 30 * 60 * 1000L

  /** هر دو نگهبان را (دوباره) ست می‌کند؛ صدا زدن مکرر بی‌خطر است. */
  fun ensure(context: Context) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleJob(context)
    scheduleWatchdog(context, WATCHDOG_INTERVAL_MS)
  }

  /** آلارم بعدی نگهبان را ست می‌کند و زنجیره را زنده نگه می‌دارد. */
  fun scheduleWatchdog(context: Context, delayMs: Long) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleAlarm(context, delayMs)
  }

  /** تلاش دوباره‌ی سریع بعد از شکست شروع سرویس (مثلاً محدودیت اندروید ۱۲+). */
  fun scheduleRelaunch(context: Context, delayMs: Long) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleAlarm(context, delayMs.coerceAtLeast(1_000L))
  }

  fun cancel(context: Context) {
    try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler
      scheduler?.cancel(JOB_ID)
    } catch (t: Throwable) {
      // نادیده
    }
    try {
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
      alarm?.cancel(wakeIntent(context))
    } catch (t: Throwable) {
      // نادیده
    }
  }

  /** سرویس زنده است؟ (ضربان کمتر از نیم ساعت پیش) */
  fun isAlive(context: Context): Boolean {
    return System.currentTimeMillis() - lastSeen(context) < ALIVE_TOLERANCE_MS
  }

  fun markAlive(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putLong(KEY_ALIVE, System.currentTimeMillis()).commit()
    } catch (t: Throwable) {
      // نادیده: فقط وضعیت نمایشی است
    }
  }

  fun lastSeen(context: Context): Long {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_ALIVE, 0L)
    } catch (t: Throwable) {
      0L
    }
  }

  // -------------------------------------------------------------------------

  private fun scheduleJob(context: Context) {
    try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler
        ?: return
      val builder = JobInfo.Builder(
        JOB_ID,
        ComponentName(context, VoiceGuardJobService::class.java)
      )
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_NONE)
        .setPeriodic(WATCHDOG_INTERVAL_MS)

      val info = try {
        builder.setPersisted(true).build()
      } catch (t: Throwable) {
        // بدون RECEIVE_BOOT_COMPLETED یا روی ROM محدود: جاب غیرپایدار هم بهتر از هیچ است
        builder.setPersisted(false).build()
      }
      scheduler.schedule(info)
    } catch (t: Throwable) {
      Log.w(TAG, "guard job failed: ${t.message}")
    }
  }

  private fun scheduleAlarm(context: Context, delayMs: Long) {
    try {
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val pending = wakeIntent(context)
      val at = SystemClock.elapsedRealtime() + delayMs

      if (Build.VERSION.SDK_INT >= 31 && !alarm.canScheduleExactAlarms()) {
        // بدون مجوز «آلارم و یادآور»، آلارم دقیق ممنوع است؛ نسخه‌ی معمولی هم
        // کار می‌کند، فقط ممکن است در Doze چند دقیقه دیرتر برسد.
        alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending)
        return
      }

      try {
        if (Build.VERSION.SDK_INT >= 23) {
          alarm.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending)
        } else {
          alarm.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending)
        }
      } catch (t: SecurityException) {
        alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "guard alarm failed: ${t.message}")
    }
  }

  private fun wakeIntent(context: Context): PendingIntent {
    val intent = Intent(context, WakeReceiver::class.java).setAction(ACTION_WAKE)
    return PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
