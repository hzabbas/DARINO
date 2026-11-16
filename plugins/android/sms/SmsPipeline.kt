package com.darino.app.sms

import android.content.Context
import android.util.Log

/**
 * Common pipeline for bank SMS: enqueues for review, checks deposit, and plays voice announcement.
 */
object SmsPipeline {
  private const val TAG = "DarinoVoice"

  /**
   * Processes bank SMS from receivers or inbox observer.
   * Uses minute-level deduplication key (sender|amount|minute) to avoid duplicate voice alerts.
   */
  fun handle(
    context: Context,
    sender: String,
    body: String,
    timestamp: Long,
    dedupeKey: String? = null,
    onQueued: ((fingerprint: String) -> Unit)? = null
  ): Boolean {
    return try {
      val normalized = SmsSender.normalize(sender)
      if (normalized.isEmpty()) return false

      val config = VoiceConfigStore.read(context)
      val amount = SmsSender.amountOf(body)
      val hasVoiceAccounts = config.enabled && config.accounts.any { it.announceVoice }
      val senders = SmsStore.getSenders(context)
      val isKnown = senders.any { saved -> SmsSender.matches(saved, sender) }

      if (!isKnown && !(hasVoiceAccounts && SmsSender.looksBank(normalized, body) && amount > 0L)) {
        return false
      }

      val minute = timestamp / 60_000L
      val key = dedupeKey ?: "$normalized|$amount|$minute"
      val fingerprint = "$key|$timestamp"

      val added = SmsStore.enqueue(context, sender.trim(), body, timestamp, fingerprint)
      if (added && onQueued != null) {
        try {
          onQueued(fingerprint)
        } catch (t: Throwable) {
          // Notification delivery failure should not abort pipeline
        }
      }

      if (!config.enabled) return added

      val announcement = DepositVoiceAnnouncer.prepare(
        context,
        sender.trim(),
        body,
        key
      ) ?: return added

      DepositVoiceAnnouncer.play(context, announcement)
      true
    } catch (t: Throwable) {
      Log.w(TAG, "sms pipeline failed: ${t.message}")
      false
    }
  }
}
