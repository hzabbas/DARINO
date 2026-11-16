package com.darino.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts voice service and guard schedulers after device reboot or app update.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        "android.intent.action.QUICKBOOT_POWERON",
        "com.htc.intent.action.QUICKBOOT_POWERON" -> {
          val app = context.applicationContext
          VoiceAnnouncerService.start(app)
          VoiceGuardScheduler.ensure(app)
        }
      }
    } catch (t: Throwable) {
      Log.w("DarinoVoice", "boot restart failed: ${t.message}")
    }
  }
}
