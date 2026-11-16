package com.darino.app.sms

/**
 * Standard phone/bank sender normalization utilities matching TypeScript logic.
 */
object SmsSender {

  private val NOISE = Regex(
    "[\\s\\-_\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u00ad\\u00a0\\ufeff]"
  )

  private val DIGITS_ONLY = Regex("^\\d+$")
  private val NATIONAL = Regex("^0(\\d{10})$")
  private val WITHOUT_ZERO = Regex("^98(\\d{10})$")

  /** Normalizes sender format, converting Iranian prefixes (+98, 0098, 98) to 0. */
  fun normalize(raw: String?): String {
    val base = (raw ?: "").replace(NOISE, "").trim().lowercase()
    if (base.isEmpty()) return ""

    if (base.startsWith("+98")) return "0" + base.substring(3)
    if (base.startsWith("0098")) return "0" + base.substring(4)
    if (WITHOUT_ZERO.matches(base)) return "0" + base.substring(2)
    return base
  }

  /** Checks if two sender strings match the same bank account or entity. */
  fun matches(first: String?, second: String?): Boolean {
    val left = normalize(first)
    val right = normalize(second)
    if (left.isEmpty() || right.isEmpty()) return false
    if (left == right) return true

    if (DIGITS_ONLY.matches(left) || DIGITS_ONLY.matches(right)) return false

    if (left.length >= 5 && right.contains(left)) return true
    if (right.length >= 5 && left.contains(right)) return true
    return false
  }

  /** Generates possible sender variations for SQLite / content provider queries. */
  fun variants(raw: String?): List<String> {
    val value = (raw ?: "").replace(NOISE, "").trim()
    if (value.isEmpty()) return emptyList()

    val result = LinkedHashSet<String>()
    result.add(value)

    val normalized = normalize(value)
    if (normalized.isNotEmpty()) result.add(normalized)

    val national = NATIONAL.matchEntire(normalized)
    if (national != null) {
      val digits = national.groupValues[1]
      result.add("+98$digits")
      result.add("98$digits")
      result.add("0098$digits")
    }

    return result.toList()
  }

  // -------------------------------------------------------------------------
  // Bank SMS detection & fingerprinting
  // -------------------------------------------------------------------------

  private val BANK_SENDER_HINTS = listOf(
    "pasargad", "blu", "bankmellat", "mellat", "bankmelli", "melli", "saderat",
    "tejarat", "sepah", "keshavarzi", "maskan", "saman", "parsian", "enovin",
    "enbank", "resalat", "ayandeh", "shahr", "refah", "sina", "gardeshgari",
    "khavarm", "middleeast", "karafarin", "daybank", "postbank", "wipad",
    "trabank", "bankino", "qmehriran", "mehriran"
  )

  private val BANK_BODY_HINTS = listOf("برداشت", "واریز", "مانده", "موجودی", "حساب", "کارت")

  /** Converts Persian and Arabic digits to Latin 0-9. */
  fun toLatinDigits(raw: String): String {
    val builder = StringBuilder(raw.length)
    for (character in raw) {
      when (character) {
        in '۰'..'۹' -> builder.append('0' + (character - '۰'))
        in '٠'..'٩' -> builder.append('0' + (character - '٠'))
        else -> builder.append(character)
      }
    }
    return builder.toString()
  }

  /** Normalizes whitespace and digit characters in SMS text. */
  fun normalizeBody(raw: String?): String {
    return toLatinDigits(raw ?: "")
      .replace(Regex("[\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u00ad\\ufeff]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  /** Extracts first 4+ digit numeric value for notification summary and deduplication. */
  fun amountOf(body: String): Long {
    val normalized = DepositSmsParser.normalizeAmountText(body).replace(",", "")
    return Regex("([0-9]{4,})").find(normalized)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
  }

  /** Checks if sender or body matches bank patterns to exclude personal SMS. */
  fun looksBank(sender: String?, body: String?): Boolean {
    val normalized = normalize(sender)
    if (normalized.isNotEmpty() && BANK_SENDER_HINTS.any { normalized.contains(it) }) return true

    val text = normalizeBody(body)
    return BANK_BODY_HINTS.any { text.contains(it) }
  }
}
