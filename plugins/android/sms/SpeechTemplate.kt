package com.darino.app.sms

import kotlin.math.abs

/**
 * Renders custom voice announcement templates with supported tokens.
 * Parallels src/utils/voiceTemplate.ts logic.
 */
object SpeechTemplate {
  const val DEFAULT = "{نام}، {مبلغ} تومن برات واریز کرد"
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

  private const val SPACE_CHARS = " \\t\\n\\r\\f\\v\\u00A0\\u2000-\\u200B\\u202F"
  private const val PUNCT_CHARS = "،,؛:.!؟?\\-–—"

  private val SPACE_RUN = Regex("[$SPACE_CHARS]+")
  private val SPACE_BEFORE_PUNCT = Regex("[$SPACE_CHARS]+([$PUNCT_CHARS])")
  private val REPEATED_SEPARATORS = Regex("([،,؛:])(?:[$SPACE_CHARS]*[،,؛:])+")
  private val EDGE_PUNCT = Regex("^[$SPACE_CHARS$PUNCT_CHARS]+|[$SPACE_CHARS$PUNCT_CHARS]+$")

  /** Migrates legacy latin placeholders to Persian tokens. */
  fun migrate(template: String?): String {
    return LEGACY_TOKEN_REGEX.replace(template.orEmpty()) { match ->
      val token = match.groupValues[1]
      "{${LEGACY_TOKENS[token] ?: token}}"
    }
  }

  /** Normalizes template string and enforces length bounds. */
  fun normalize(template: String?): String {
    val trimmed = migrate(template).trim()
    if (trimmed.isEmpty()) return DEFAULT
    if (trimmed.length > MAX_LENGTH) return trimmed.take(MAX_LENGTH).trim()
    return trimmed
  }

  fun isValid(template: String?): Boolean {
    val value = template?.trim().orEmpty()
    return value.isNotEmpty() && value.length <= MAX_LENGTH
  }

  fun sanitize(template: String?): String {
    return if (isValid(template)) normalize(template) else DEFAULT
  }

  /** Renders template into spoken Persian sentence with clean punctuation. */
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

    val rendered = TOKEN_REGEX.replace(source) { match ->
      replacements[match.groupValues[1]] ?: match.value
    }

    if (!TOKEN_REGEX.containsMatchIn(source)) return source
    val cleaned = clean(rendered)
    return if (cleaned.isNotEmpty()) {
      cleaned
    } else {
      DepositSpeech.buildColloquialDepositSpeech(amountToman, name)
    }
  }

  private fun lastFourDigits(cardNumber: String?): String {
    val digits = SmsSender.toLatinDigits(cardNumber.orEmpty()).replace(Regex("[^0-9]"), "")
    return if (digits.length >= 4) digits.takeLast(4) else ""
  }

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
