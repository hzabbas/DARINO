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
 * Ensures background voice announcer service remains active using AlarmManager and JobScheduler.
 */
object VoiceGuardScheduler {
  private const val TAG = "DarinoVoice"
  const val ACTION_WAKE = "com.darino.app.sms.WAKE_VOICE_GUARD"

  const val WATCHDOG_INTERVAL_MS = 15 * 60 * 1000L

  private const val JOB_ID = 4129
  private const val ALARM_REQUEST = 4130
  private const val PREFS = "darino_voice_guard"
  private const val KEY_ALIVE = "alive_at"
  private const val ALIVE_TOLERANCE_MS = 30 * 60 * 1000L

  /** Schedules both persistent job and watchdog alarm. */
  fun ensure(context: Context) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleJob(context)
    scheduleWatchdog(context, WATCHDOG_INTERVAL_MS)
  }

  /** Schedules next watchdog alarm. */
  fun scheduleWatchdog(context: Context, delayMs: Long) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleAlarm(context, delayMs)
  }

  /** Schedules immediate restart attempt after service failure. */
  fun scheduleRelaunch(context: Context, delayMs: Long) {
    if (!VoiceConfigStore.read(context).enabled) return
    scheduleAlarm(context, delayMs.coerceAtLeast(1_000L))
  }

  fun cancel(context: Context) {
    try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler
      scheduler?.cancel(JOB_ID)
    } catch (t: Throwable) {
      // Ignore
    }
    try {
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
      alarm?.cancel(wakeIntent(context))
    } catch (t: Throwable) {
      // Ignore
    }
  }

  /** Checks if background service reported a heartbeat within tolerance window. */
  fun isAlive(context: Context): Boolean {
    return System.currentTimeMillis() - lastSeen(context) < ALIVE_TOLERANCE_MS
  }

  fun markAlive(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putLong(KEY_ALIVE, System.currentTimeMillis()).commit()
    } catch (t: Throwable) {
      // Ignore
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
  // Schedulers
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
