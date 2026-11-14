package com.darino.app.sms

/** واحد پولی که پیامک با آن نوشته شده است. */
enum class CurrencyUnit { RIAL, TOMAN }

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
 *
 * قاعده‌ی واحد پول (با `detectSmsUnit` در `smsParser.ts` یکی است):
 *  ۱. اگر کنار خود عدد واحد نوشته شده باشد، همان ملاک است.
 *  ۲. وگرنه واحد کل متن: «تومان/تومن/Toman» → تومان، «ریال/ريال/Rial/IRR» → ریال.
 *  ۳. اگر هیچ واحدی نبود — یا هر دو بود — **ریال** فرض می‌شود؛ پیامک بانکی
 *     ایران استاندارد ریال است. فرض تومان مبلغ را ده برابر بزرگ می‌کرد.
 */
object DepositSmsParser {

  private val OTP_MARKERS = listOf("@ib.", "رمز", "کد تایید", "کد تأیید", "otp")

  private val PROMO_MARKERS = listOf(
    "تخفیف", "جشنواره", "کد تخفیف", "بسته اینترنت", "وام", "اعتبار خرید", "قرعه‌کشی"
  )

  private val TOMAN_MARKERS = listOf("تومان", "تومن", "تومنی", "toman")
  private val RIAL_MARKERS = listOf("ریال", "ريال", "ریالی", "rial", "irr")

  /** جلوه‌های واحدی که ممکن است کنار عدد بیاید (فارسی، عربی و لاتین). */
  private const val UNIT = "(ریال|ريال|تومان|تومن|rial|irr|toman)"

  /** یک عدد با جداکننده‌ی هزارگان یا رشته‌ی پیوسته‌ی چهاررقمی به بالا. */
  private const val AMOUNT = "([0-9][0-9,]{3,})"

  /**
   * الگوها به ترتیب اولویت؛ اول مبلغ‌هایی که کنار کلمه‌ی واریز/نشست آمده‌اند و
   * بعد علامت + بانک‌های پاسارگاد/مهر. مانده و شماره کارت با محدوده‌ی مبلغ حذف
   * می‌شوند.
   */
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

  /** فاصله‌های هزارگان: «1 500 000» یا «۱۲ ۵۰۰ ۰۰۰». */
  private val SPACED_GROUPS = Regex("\\b\\d{1,3}(?:[ \\u00a0]\\d{3}){1,}\\b")

  /** اسلش به‌جای جداکننده: «1/500/000» (اما تاریخ «1405/08/20» نیست). */
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

    // اگر متن بوی برداشت می‌دهد و هیچ نشانه‌ی قوی واریز ندارد، صدا نده.
    val strongIncome =
      text.contains("نشست") ||
        text.contains("بستانکار") ||
        text.contains("واریز")
    if (text.contains("برداشت") && !strongIncome) return null

    val amount = extractAmountToman(text) ?: return null
    return ParsedDeposit(amount, DepositSpeech.extractPayerName(body))
  }

  /**
   * یکدست‌سازی متن برای خواندن مبلغ:
   *  - ارقام فارسی/عربی → لاتین
   *  - همه‌ی جداکننده‌های هزارگان (`٬` `،` `٫` `'` `’`) → `,`
   *  - گروه‌های سه‌رقمی که با فاصله یا اسلش جدا شده‌اند → با `,`
   *
   * نقطه عمداً جداکننده گرفته نمی‌شود؛ در پیامک پاسارگاد خط اول
   * «777.888.27923610.1» شماره کارت/حساب است، نه مبلغ.
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

  /** واحد کل پیامک؛ پیش‌فرض ریال. */
  fun detectMessageUnit(text: String): CurrencyUnit {
    val lower = text.lowercase()
    val hasToman = TOMAN_MARKERS.any { lower.contains(it) }
    val hasRial = RIAL_MARKERS.any { lower.contains(it) }

    // «هم ریال هم تومان» یعنی نمی‌توان به واحد کل متن تکیه کرد؛ ریال امن‌تر است.
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

        // مبالغ غیرواقعی (شماره کارت ۱۶ رقمی، شماره حساب و …) رد می‌شوند.
        if (toman in 1_000L..5_000_000_000L) return toman
      }
    }

    return null
  }

  /** «تومن» و «Toman» و «IRR» هم به همان واحد اصلی نگاشت می‌شوند. */
  private fun unitFrom(raw: String): CurrencyUnit? {
    val value = raw.trim().lowercase()
    if (value.isEmpty()) return null
    return when (value) {
      "تومان", "تومن", "toman" -> CurrencyUnit.TOMAN
      "ریال", "ريال", "rial", "irr" -> CurrencyUnit.RIAL
      else -> null
    }
  }

  /** مثل `Math.round(rial / 10)` در جاوااسکریپت: ۱٬۲۰۰٬۰۰۵ ریال → ۱۲۰٬۰۰۱ تومان. */
  private fun roundRialToToman(rial: Long): Long = (rial + 5L) / 10L
}
