package com.darino.app.sms

import kotlin.math.abs

/**
 * ساخت جمله‌ی اعلام واریز از قالب دلخواه کاربر.
 *
 * کاربر جای هر بخش جمله را با یک توکن مشخص می‌کند و بقیه‌ی متن آزاد است؛ مثلاً
 *   «{name}، {amount} تومن زد به کارتت»
 *   «{name} {amount} تومن واریز کرد برات»
 *
 * این فایل و `src/utils/voiceTemplate.ts` باید **مو‌به‌مو** یکی باشند: پیش‌نمایش
 * در تنظیمات از نسخه‌ی TypeScript ساخته می‌شود و همان جمله این‌جا روی گوشی خوانده
 * می‌شود. هر تغییر در قاعده‌ها باید در هر دو طرف انجام شود.
 *
 * این فایل هیچ وابستگی‌ای به کلاس‌های اندروید ندارد تا ساده و قابل تست بماند.
 */
object SpeechTemplate {
  const val DEFAULT = "{name}، {amount} تومن برات واریز کرد"

  /** سقف طول جمله؛ همان عدد `VOICE_TEMPLATE_MAX_LENGTH` در TypeScript. */
  const val MAX_LENGTH = 160

  private val TOKEN_REGEX = Regex("\\{(name|amount|amountNumber|bank|card)\\}")

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

  /** قالب خالی یعنی پیش‌فرض؛ قالب بلندتر از سقف هم بریده می‌شود. */
  fun normalize(template: String?): String {
    val trimmed = template?.trim().orEmpty()
    if (trimmed.isEmpty()) return DEFAULT
    if (trimmed.length > MAX_LENGTH) return trimmed.take(MAX_LENGTH).trim()
    return trimmed
  }

  /** قالب وقتی معتبر است که جای مبلغ را مشخص کرده باشد. */
  fun isValid(template: String?): Boolean {
    val value = template?.trim().orEmpty()
    if (value.isEmpty() || value.length > MAX_LENGTH) return false
    return value.contains("{amount}") || value.contains("{amountNumber}")
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

    val replacements = mapOf(
      "name" to name,
      "amount" to DepositSpeech.formatColloquialSpeechAmount(amountToman),
      "amountNumber" to persianDigits(groupThousands(amountToman)),
      "bank" to bankName?.trim().orEmpty(),
      "card" to persianDigits(lastFourDigits(cardNumber))
    )

    // یک‌جا جایگزین می‌شود تا متنی که خودش شبیه توکن است (مثلاً نامی با «{amount}»)
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
