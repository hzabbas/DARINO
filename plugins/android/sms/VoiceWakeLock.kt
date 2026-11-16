package com.darino.app.sms

import android.content.Context
import android.os.PowerManager

/**
 * Short-lived wake lock for background SMS processing and speech playback.
 */
object VoiceWakeLock {
  private const val NAME = "darino:voice-pipeline"
  private const val TIMEOUT_MS = 90_000L

  fun acquire(context: Context): PowerManager.WakeLock? {
    return try {
      val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return null
      val lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, NAME)
      lock.setReferenceCounted(false)
      lock.acquire(TIMEOUT_MS)
      lock
    } catch (t: Throwable) {
      null
    }
  }

  fun release(lock: PowerManager.WakeLock?) {
    try {
      if (lock != null && lock.isHeld) lock.release()
    } catch (t: Throwable) {
      // Ignore
    }
  }
}
