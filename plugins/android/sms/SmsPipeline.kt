package com.darino.app.sms

import android.content.Context
import android.util.Log

/**
 * خط لوله‌ی مشترک پیامک‌های بانکی: ثبت در صف + بررسی واریز + پخش جمله.
 *
 * سه مسیر تشخیص (گیرنده‌ی manifest، گیرنده‌ی پویای سرویس و ContentObserver)
 * همه به همین‌جا می‌رسند تا قاعده‌ی پذیرش پیامک، کلید ضدتکرار و صف **یکی** باشد.
 * اگر هر مسیر قاعده‌ی خودش را داشت، یک واریز می‌توانست دو صدا یا دو ردیف صف
 * بسازد.
 *
 * ثبت در صف مستقل از روشن‌بودن اعلام صوتی انجام می‌شود؛ اعلام صوتی یک قابلیت
 * جدا از پیامک‌خوان است و خاموش‌کردنش نباید صف تایید یا نوتیفیکیشن را قطع کند.
 */
object SmsPipeline {
  private const val TAG = "DarinoVoice"

  /**
   * `true` یعنی این پیامک پذیرفته شد (در صف ثبت یا اعلام شد).
   *
   * @param dedupeKey کلید ضدتکرار اعلام؛ عمداً **بدون میلی‌ثانیه** است
   *   (`فرستنده|مبلغ|دقیقه`) تا گیرنده‌ی broadcast و صندوق پیامک که مهرهای
   *   چند ثانیه‌ای متفاوت دارند، یک واریز را یک‌بار اعلام کنند.
   * @param onQueued بعد از ثبت موفق ردیف تازه صدا زده می‌شود؛ گیرنده‌ی پیامک با
   *   همین امضا نوتیفیکیشن را می‌سازد تا ردیف و نوتیفیکیشن همیشه یکی باشند.
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

      // صندوق ورودی همه‌ی پیامک‌ها را دارد؛ پیامک شخصی نباید وارد صف بانکی یا
      // اعلام صوتی شود. قاعده: سرشماره‌ی شناخته‌شده، یا پیامک بانکی‌نما با
      // عددی در حد مبلغ وقتی اعلام صوتی روشن است.
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
          // نوتیفیکیشن نباید مانع ثبت یا اعلام شود
        }
      }

      if (!config.enabled) return added

      // اعلام حتی وقتی همین پیامک قبلاً در صف بوده بررسی می‌شود؛ ضدتکرار اعلام
      // با `key` (بدون میلی‌ثانیه) انجام می‌شود، پس مسیر دوم صدا نمی‌دهد.
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
