package com.darino.app.sms

/** Currency unit parsed from SMS body. */
enum class CurrencyUnit { RIAL, TOMAN }

/** Result of SMS deposit parsing for voice announcer. */
data class ParsedDeposit(
  val amountToman: Long,
  val payerName: String?
)

/**
 * Fast SMS parser dedicated to bank deposit voice announcements.
 * Validates real deposit messages and extracts Toman amount and payer name.
 */
object DepositSmsParser {

  private val OTP_MARKERS = listOf("@ib.", "رمز", "کد تایید", "کد تأیید", "otp")

  private val PROMO_MARKERS = listOf(
    "تخفیف", "جشنواره", "کد تخفیف", "بسته اینترنت", "وام", "اعتبار خرید", "قرعه‌کشی"
  )

  private val TOMAN_MARKERS = listOf("تومان", "تومن", "تومنی", "toman")
  private val RIAL_MARKERS = listOf("ریال", "ريال", "ریالی", "rial", "irr")

  private const val UNIT = "(ریال|ريال|تومان|تومن|rial|irr|toman)"
  private const val AMOUNT = "([0-9][0-9,]{3,})"

  /** Ordered regex patterns prioritizing explicit deposit/transfer phrases. */
  private val AMOUNT_PATTERNS = listOf(
    Regex(
      "$AMOUNT\\s*${UNIT}?\\s*(?:به حساب شما|به حسابتان)\\s*نشست",
      RegexOption.IGNORE_CASE
    ),
    Regex(
      "(?:واریز|دریافت|بستانکار)[^0-9\\n]{0,40}?$AMOUNT\\s*${UNIT}?",
      RegexOption.IGNORE_CASE
    ),
    Regex("$AMOUNT\\s*${UNIT}?\\s*(?:واریز|بستانکار)", RegexOption.IGNORE_CASE),
    Regex("مبلغ\\s*[:：]?\\s*$AMOUNT\\s*${UNIT}?", RegexOption.IGNORE_CASE),
    Regex("\\+\\s*$AMOUNT\\s*${UNIT}?", RegexOption.IGNORE_CASE),
    Regex("$AMOUNT\\s*${UNIT}?\\s*\\+", RegexOption.IGNORE_CASE)
  )

  /** Spaced thousands: "1 500 000" or Persian digits. */
  private val SPACED_GROUPS = Regex("\\b\\d{1,3}(?:[ \\u00a0]\\d{3}){1,}\\b")

  /** Slash as thousands separator: "1/500/000" (excluding dates). */
  private val SLASH_GROUPS = Regex("\\b\\d{1,3}(?:/\\d{3}){1,}\\b")

  fun parse(body: String): ParsedDeposit? {
    if (body.isBlank()) return null

    val text = normalizeAmountText(body)

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

    // Reject if message looks like expense without strong deposit markers
    val strongIncome =
      text.contains("نشست") ||
        text.contains("بستانکار") ||
        text.contains("واریز")
    if (text.contains("برداشت") && !strongIncome) return null

    val amount = extractAmountToman(text) ?: return null
    return ParsedDeposit(amount, DepositSpeech.extractPayerName(body))
  }

  /**
   * Normalizes Persian/Arabic digits, thousands grouping, and spacing.
   */
  fun normalizeAmountText(raw: String): String {
    var text = SmsSender.toLatinDigits(raw)
      .replace('\u200c', ' ')
      .replace('\u066c', ',')
      .replace('\u066b', ',')
      .replace('\u060c', ',')
      .replace('\u2019', ',')
      .replace('\u2018', ',')
      .replace('\'', ',')

    text = SPACED_GROUPS.replace(text) { match -> match.value.replace(' ', ',').replace('\u00a0', ',') }
    text = SLASH_GROUPS.replace(text) { match -> match.value.replace('/', ',') }
    return text
  }

  /** Detects default currency unit for message; defaults to Rials. */
  fun detectMessageUnit(text: String): CurrencyUnit {
    val lower = text.lowercase()
    val hasToman = TOMAN_MARKERS.any { lower.contains(it) }
    val hasRial = RIAL_MARKERS.any { lower.contains(it) }

    return if (hasToman && !hasRial) CurrencyUnit.TOMAN else CurrencyUnit.RIAL
  }

  private fun extractAmountToman(text: String): Long? {
    val messageUnit = detectMessageUnit(text)

    for (pattern in AMOUNT_PATTERNS) {
      for (match in pattern.findAll(text)) {
        val rawValue = match.groupValues.getOrNull(1) ?: continue
        val value = rawValue.replace(",", "").toLongOrNull() ?: continue
        if (value <= 0L) continue

        val unit = unitFrom(match.groupValues.getOrNull(2).orEmpty()) ?: messageUnit
        val toman = if (unit == CurrencyUnit.TOMAN) value else roundRialToToman(value)

        // Reject out-of-range numbers (card numbers, account numbers, etc.)
        if (toman in 1_000L..5_000_000_000L) return toman
      }
    }

    return null
  }

  private fun unitFrom(raw: String): CurrencyUnit? {
    val value = raw.trim().lowercase()
    if (value.isEmpty()) return null
    return when (value) {
      "تومان", "تومن", "toman" -> CurrencyUnit.TOMAN
      "ریال", "ريال", "rial", "irr" -> CurrencyUnit.RIAL
      else -> null
    }
  }

  /** Converts Rials to Toman with standard rounding. */
  private fun roundRialToToman(rial: Long): Long = (rial + 5L) / 10L
}
