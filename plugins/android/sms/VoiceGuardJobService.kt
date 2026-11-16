package com.darino.app.sms

import android.app.job.JobParameters
import android.app.job.JobService
import android.util.Log

/**
 * Periodic JobScheduler task to keep voice service alive across aggressive OEM kills.
 */
class VoiceGuardJobService : JobService() {

  override fun onStartJob(params: JobParameters?): Boolean {
    val app = applicationContext
    Thread {
      try {
        if (VoiceConfigStore.read(app).enabled) {
          VoiceAnnouncerService.start(app)
          VoiceGuardScheduler.ensure(app)
          SmsInboxChecker.request(app)
        }
      } catch (t: Throwable) {
        Log.w(TAG, "guard job failed: ${t.message}")
      } finally {
        try {
          jobFinished(params, false)
        } catch (t: Throwable) {
          // Ignore
        }
      }
    }.start()
    return true
  }

  override fun onStopJob(params: JobParameters?): Boolean = true

  private companion object {
    const val TAG = "DarinoVoice"
  }
}
