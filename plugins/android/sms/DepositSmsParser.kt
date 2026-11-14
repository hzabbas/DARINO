package com.darino.app.sms

/** نتیجه‌ی تحلیل یک پیامک واریز برای اعلام صوتی. */
data class ParsedDeposit(
  val amountToman: Long,
  val payerName: String?
)

/**
 * تحلیل سبک پیامک واریز، فقط برای اعلام صوتی.
 *
 * عمداً از تحلیل کامل جاوااسکریپت (`smsParser.ts`) جدا است: این‌جا فقط باید مطمئن
 * شویم پیامک یک **واریز واقعی** است و مبلغش را درست بخوانیم؛ سپس جمله گفته می‌شود.
 * پیامک برداشت، رمز پویا و تبلیغاتی هرگز نباید صدا بدهد.
 */
object DepositSmsParser {

  private val OTP_MARKERS = listOf("@ib.", "رمز", "کد تایید", "کد تأیید", "otp")

  private val PROMO_MARKERS = listOf(
    "تخفیف", "جشنواره", "کد تخفیف", "بسته اینترنت", "وام", "اعتبار خرید", "قرعه‌کشی"
  )

  /**
   * الگوها به ترتیب اولویت؛ اول مبلغ‌هایی که کنار کلمه‌ی واریز/نشست آمده‌اند و
   * بعد علامت + بانک‌های پاسارگاد/مهر. مانده و شماره کارت با محدوده‌ی مبلغ حذف
   * می‌شوند.
   */
  private val AMOUNT_PATTERNS = listOf(
    Regex("([0-9,]{4,})\\s*(ریال|تومان)\\s*(?:به حساب شما|به حسابتان)\\s*نشست"),
    Regex("(?:واریز|دریافت|بستانکار)[^0-9\\n]{0,40}?([0-9,]{4,})\\s*(ریال|تومان)?"),
    Regex("([0-9,]{4,})\\s*(ریال|تومان)?\\s*(?:واریز|بستانکار)"),
    Regex("مبلغ\\s*[:：]?\\s*([0-9,]{4,})\\s*(ریال|تومان)?"),
    Regex("\\+\\s*([0-9,]{4,})\\s*(ریال|تومان)?"),
    Regex("([0-9,]{4,})\\s*(ریال|تومان)?\\s*\\+")
  )

  fun parse(body: String): ParsedDeposit? {
    if (body.isBlank()) return null

    val text = SmsSender.toLatinDigits(body)
      .replace('\u200c', ' ')
      .replace('\u066b', ',')
      .replace('\u060c', ',')

    val lower = text.lowercase()
    if (OTP_MARKERS.any { lower.contains(it) }) return null
    if (PROMO_MARKERS.any { text.contains(it) }) return null

    val hasIncome =
      text.contains("واریز") ||
        text.contains("بستانکار") ||
        text.contains("به حساب شما نشست") ||
        text.contains("به حسابتان نشست") ||
        text.contains("دریافت")
    if (!hasIncome) return null

    // اگر متن بوی برداشت می‌دهد و هیچ نشانه‌ی قوی واریز ندارد، صدا نده.
    val strongIncome =
      text.contains("نشست") ||
        text.contains("بستانکار") ||
        text.contains("واریز")
    if (text.contains("برداشت") && !strongIncome) return null

    val amount = extractAmountToman(text) ?: return null
    return ParsedDeposit(amount, DepositSpeech.extractPayerName(body))
  }

  private fun extractAmountToman(text: String): Long? {
    val messageInToman = text.contains("تومان") && !text.contains("ریال")

    for (pattern in AMOUNT_PATTERNS) {
      for (match in pattern.findAll(text)) {
        val rawValue = match.groupValues.getOrNull(1) ?: continue
        val value = rawValue.replace(",", "").toLongOrNull() ?: continue
        if (value <= 0L) continue

        val unit = match.groupValues.getOrNull(2)?.trim().orEmpty()
        val toman = when {
          unit == "تومان" -> value
          unit == "ریال" -> value / 10L
          messageInToman -> value
          else -> value / 10L
        }

        // مبالغ غیرواقعی (شماره کارت ۱۶ رقمی، شماره حساب و …) رد می‌شوند.
        if (toman in 1_000L..5_000_000_000L) return toman
      }
    }

    return null
  }
}
