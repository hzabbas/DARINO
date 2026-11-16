package com.darino.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Watchdog alarm receiver to wake process and ensure background voice service is running.
 */
class WakeReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != VoiceGuardScheduler.ACTION_WAKE) return

    val app = context.applicationContext
    var alive = false

    try {
      alive = VoiceGuardScheduler.isAlive(app)
      VoiceAnnouncerService.start(app)
      VoiceGuardScheduler.scheduleWatchdog(app, VoiceGuardScheduler.WATCHDOG_INTERVAL_MS)
      if (alive) return
    } catch (t: Throwable) {
      Log.w(TAG, "guard wake failed: ${t.message}")
    }

    // If service was killed, perform a catch-up inbox scan
    val pending = goAsync()
    Thread {
      try {
        SmsInboxChecker.request(app)
      } catch (t: Throwable) {
        Log.w(TAG, "guard catch-up failed: ${t.message}")
      } finally {
        try {
          pending.finish()
        } catch (t: Throwable) {
          // Ignore
        }
      }
    }.start()
  }

  private companion object {
    const val TAG = "DarinoVoice"
  }
}
