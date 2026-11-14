package com.darino.app.sms

import kotlin.math.abs

/**
 * ساخت جمله‌ی اعلام واریز از قالب دلخواه کاربر.
 *
 * کاربر جای هر بخش جمله را با یک توکن فارسی مشخص می‌کند و بقیه‌ی متن آزاد است؛
 * مثلاً «{نام}، {مبلغ} تومن زد به کارتت».
 *
 * توکن‌های قدیمی لاتین (`{name}`، `{amount}`، …) هنوز پذیرفته می‌شوند تا
 * قالب‌های ذخیره‌شده‌ی نسخه‌های قبل بی‌صدا نشوند؛ ولی هنگام ذخیره/خواندن
 * خودکار به شکل فارسی مهاجرت می‌کنند.
 *
 * این فایل و `src/utils/voiceTemplate.ts` باید **مو‌به‌مو** یکی باشند:
 * پیش‌نمایش در تنظیمات از نسخه‌ی TypeScript ساخته می‌شود و همان جمله این‌جا
 * روی گوشی خوانده می‌شود. هر تغییر در قاعده‌ها باید در هر دو طرف انجام شود.
 *
 * این فایل هیچ وابستگی‌ای به کلاس‌های اندروید ندارد تا ساده و قابل تست بماند.
 */
object SpeechTemplate {
  const val DEFAULT = "{نام}، {مبلغ} تومن برات واریز کرد"

  /** سقف طول جمله؛ همان عدد `VOICE_TEMPLATE_MAX_LENGTH` در TypeScript. */
  const val MAX_LENGTH = 160

  private val TOKEN_REGEX = Regex(
    "\\{(مبلغ_رقمی|مبلغ|نام|بانک|کارت|amountNumber|amount|name|bank|card)\\}"
  )

  private val LEGACY_TOKEN_REGEX = Regex("\\{(name|amountNumber|amount|bank|card)\\}")

  private val LEGACY_TOKENS = mapOf(
    "name" to "نام",
    "amount" to "مبلغ",
    "amountNumber" to "مبلغ_رقمی",
    "bank" to "بانک",
    "card" to "کارت"
  )

  /**
   * کلاس فاصله‌های قابل حذف. عمداً ZWNJ (نیم‌فاصله) جزو آن نیست؛ وگرنه
   * «می‌شود» به «می شود» تبدیل می‌شد و گوینده اشتباه می‌خواند.
   */
  private const val SPACE_CHARS = " \\t\\n\\r\\f\\v\\u00A0\\u2000-\\u200B\\u202F"
  private const val PUNCT_CHARS = "،,؛:.!؟?\\-–—"

  private val SPACE_RUN = Regex("[$SPACE_CHARS]+")
  private val SPACE_BEFORE_PUNCT = Regex("[$SPACE_CHARS]+([$PUNCT_CHARS])")
  private val REPEATED_SEPARATORS = Regex("([،,؛:])(?:[$SPACE_CHARS]*[،,؛:])+")
  private val EDGE_PUNCT = Regex("^[$SPACE_CHARS$PUNCT_CHARS]+|[$SPACE_CHARS$PUNCT_CHARS]+$")

  /** قالب‌های نسخه‌های قبل را به توکن‌های فارسی تبدیل می‌کند. */
  fun migrate(template: String?): String {
    return LEGACY_TOKEN_REGEX.replace(template.orEmpty()) { match ->
      val token = match.groupValues[1]
      "{${LEGACY_TOKENS[token] ?: token}}"
    }
  }

  /** قالب خالی یعنی پیش‌فرض؛ قالب بلندتر از سقف هم بریده می‌شود. */
  fun normalize(template: String?): String {
    val trimmed = migrate(template).trim()
    if (trimmed.isEmpty()) return DEFAULT
    if (trimmed.length > MAX_LENGTH) return trimmed.take(MAX_LENGTH).trim()
    return trimmed
  }

  /** قالب وقتی معتبر است که جای مبلغ را مشخص کرده باشد. */
  fun isValid(template: String?): Boolean {
    val value = template?.trim().orEmpty()
    if (value.isEmpty() || value.length > MAX_LENGTH) return false
    return value.contains("{مبلغ}") ||
      value.contains("{مبلغ_رقمی}") ||
      value.contains("{amount}") ||
      value.contains("{amountNumber}")
  }

  /**
   * قالبی که واقعاً ذخیره/خوانده می‌شود: نامعتبر → پیش‌فرض.
   *
   * عیناً همان قاعده‌ی `parseVoiceAnnouncerSettings` در TypeScript، تا اگر تنظیمات
   * خراب یا از نسخه‌ی قدیمی وارد شد، جمله‌ی گفته‌شده با پیش‌نمایش یکی بماند.
   */
  fun sanitize(template: String?): String {
    return if (isValid(template)) normalize(template) else DEFAULT
  }

  /**
   * جمله‌ی نهایی برای گفتن.
   *
   * جای توکن‌ها پر می‌شود، بعد فاصله/نقطه‌گذاری‌های جامانده مرتب می‌شوند: اگر نام
   * واریزکننده در پیامک نبود، «،» اول جمله و فاصله‌های تکراری پاک می‌شوند تا
   * جمله‌ای مثل «، هفتاد تومن …» گفته نشود. اگر بعد از پاک‌سازی چیزی نماند، به
   * جمله‌ی استاندارد برمی‌گردیم تا هیچ واریزی بی‌صدا نماند.
   */
  fun render(
    template: String?,
    payerName: String?,
    amountToman: Long,
    bankName: String?,
    cardNumber: String?
  ): String {
    val source = normalize(template)
    val name = payerName?.trim().orEmpty()
    val amount = DepositSpeech.formatColloquialSpeechAmount(amountToman)
    val amountNumber = persianDigits(groupThousands(amountToman))
    val bank = bankName?.trim().orEmpty()
    val card = persianDigits(lastFourDigits(cardNumber))

    val replacements = mapOf(
      "نام" to name,
      "name" to name,
      "مبلغ" to amount,
      "amount" to amount,
      "مبلغ_رقمی" to amountNumber,
      "amountNumber" to amountNumber,
      "بانک" to bank,
      "bank" to bank,
      "کارت" to card,
      "card" to card
    )

    // یک‌جا جایگزین می‌شود تا متنی که خودش شبیه توکن است (مثلاً نامی با «{مبلغ}»)
    // دوباره تفسیر نشود.
    val rendered = TOKEN_REGEX.replace(source) { match ->
      replacements[match.groupValues[1]] ?: match.value
    }

    val cleaned = clean(rendered)
    return if (cleaned.isNotEmpty()) {
      cleaned
    } else {
      DepositSpeech.buildColloquialDepositSpeech(amountToman, name)
    }
  }

  /** چهار رقم آخر کارت با ارقام فارسی؛ برای گفتن کافی است و کل شماره را لو نمی‌دهد. */
  private fun lastFourDigits(cardNumber: String?): String {
    val digits = SmsSender.toLatinDigits(cardNumber.orEmpty()).replace(Regex("[^0-9]"), "")
    return if (digits.length >= 4) digits.takeLast(4) else ""
  }

  /** همان `formatAmount` در `src/utils/currency.ts`: «۷۰,۰۰۰». */
  private fun groupThousands(amountToman: Long): String {
    val digits = abs(amountToman).toString()
    val grouped = StringBuilder(digits.length + digits.length / 3)
    for (index in digits.indices) {
      if (index > 0 && (digits.length - index) % 3 == 0) grouped.append(',')
      grouped.append(digits[index])
    }
    return grouped.toString()
  }

  private fun persianDigits(value: String): String {
    val builder = StringBuilder(value.length)
    for (character in value) {
      if (character in '0'..'9') {
        builder.append('۰' + (character - '0'))
      } else {
        builder.append(character)
      }
    }
    return builder.toString()
  }

  /** مرتب‌کردن فاصله و نقطه‌گذاری جمله؛ عیناً همان `cleanVoiceSpeech` در TypeScript. */
  private fun clean(text: String): String {
    var value = text
    value = SPACE_RUN.replace(value, " ")
    value = SPACE_BEFORE_PUNCT.replace(value) { match -> match.groupValues[1] }
    value = REPEATED_SEPARATORS.replace(value) { match -> match.groupValues[1] }
    value = EDGE_PUNCT.replace(value, "")
    value = SPACE_RUN.replace(value, " ")
    return value.trim()
  }
}
