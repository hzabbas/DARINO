package com.darino.app.sms

/**
 * Builds colloquial Persian speech sentences for bank deposits.
 * Matches logic in src/utils/numberToWords.ts.
 */
object DepositSpeech {

  private val ONES = arrayOf("", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه")

  private val TENS = arrayOf("", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود")

  // Colloquial teen numbers
  private val TEENS = arrayOf(
    "ده", "یازده", "دوازده", "سیزده", "چهارده",
    "پونزده", "شونزده", "هیفده", "هیجده", "نوزده"
  )

  // Hundreds
  private val HUNDREDS = arrayOf(
    "", "صد", "دویست", "سیصد", "چهارصد",
    "پونصد", "ششصد", "هفتصد", "هشتصد", "نهصد"
  )

  private val SCALES = arrayOf("", "هزار", "میلیون", "میلیارد", "هزار میلیارد")

  private fun threeDigits(value: Int): String {
    val parts = mutableListOf<String>()
    val hundreds = value / 100
    val rest = value % 100

    if (hundreds > 0) parts.add(HUNDREDS[hundreds])

    if (rest in 10..19) {
      parts.add(TEENS[rest - 10])
    } else {
      val tens = rest / 10
      val ones = rest % 10
      if (tens > 0) parts.add(TENS[tens])
      if (ones > 0) parts.add(ONES[ones])
    }

    return parts.joinToString(" و ")
  }

  private fun numberToWords(value: Long): String {
    if (value == 0L) return "صفر"

    val groups = mutableListOf<Int>()
    var remaining = value
    while (remaining > 0) {
      groups.add((remaining % 1000L).toInt())
      remaining /= 1000L
    }

    if (groups.size > SCALES.size) return "عدد بسیار بزرگ"

    val parts = mutableListOf<String>()
    for (index in groups.indices.reversed()) {
      val group = groups[index]
      if (group == 0) continue

      val words = threeDigits(group)
      when {
        index == 0 -> parts.add(words)
        index == 1 && group == 1 -> parts.add(SCALES[1])
        else -> parts.add("$words ${SCALES[index]}")
      }
    }

    return parts.joinToString(" و ")
  }

  /** Formats Toman amount into colloquial spoken Persian words. */
  fun formatColloquialSpeechAmount(amountToman: Long): String {
    val amount = kotlin.math.abs(amountToman)

    if (amount == 1_000L) return "هزار"

    if (amount in 1_000L..999_999L && amount % 1_000L == 0L) {
      return numberToWords(amount / 1_000L)
    }

    return numberToWords(amount)
  }

  /** Builds casual Persian speech with or without payer name. */
  fun buildColloquialDepositSpeech(amountToman: Long, payerName: String?): String {
    val amountText = formatColloquialSpeechAmount(amountToman)
    val name = payerName?.trim().orEmpty()
    return if (name.isNotEmpty()) {
      "$name، $amountText تومن برات واریز کرد"
    } else {
      "$amountText تومن برات واریز شد"
    }
  }

  // -------------------------------------------------------------------------
  // Payer Name Extraction
  // -------------------------------------------------------------------------

  private val PAYER_PATTERNS = listOf(
    Regex("از\\s*طرف\\s*[:：]?\\s*([^0-9\\n,:;]{2,40})"),
    Regex("توسط\\s*[:：]?\\s*([^0-9\\n,:;]{2,40})"),
    Regex("(?:نام\\s*)?واریز\\s*کننده\\s*[:：]?\\s*([^0-9\\n,:;]{2,40})"),
    Regex("(?:نام\\s*)?واريز\\s*كننده\\s*[:：]?\\s*([^0-9\\n,:;]{2,40})"),
    Regex("بنام\\s*[:：]?\\s*([^0-9\\n,:;]{2,40})"),
    Regex("به\\s*نام\\s+([^0-9\\n,:;]{2,40})"),
    Regex("واریز\\s*(?:وجه)?\\s*از\\s+([^0-9\\n,:;]{2,40})"),
    Regex("دریافت\\s*از\\s+([^0-9\\n,:;]{2,40})")
  )

  private val PAYER_FROM_TO = Regex(
    "(?:^|\\n|,)\\s*از\\s+([\\u0600-\\u06ff][\\u0600-\\u06ff\\s]{1,30}?)\\s+به\\s"
  )

  private val STOP_WORDS = setOf(
    "حساب", "کارت", "شماره", "بانک", "مبلغ", "موجودی", "مانده", "تراکنش",
    "برداشت", "واریز", "انتقال", "خرید", "پرداخت", "موفق", "انجام", "شد",
    "شده", "از", "به", "طرف", "توسط", "نام", "کننده", "شما", "حسابتان",
    "کارتتان", "خودپرداز", "عابر"
  )

  private val TRAILING_TOKENS = listOf(
    "به حساب شما", "به حساب", "به کارت شما", "به کارت", "به شماره", "به",
    "طی", "مستند", "مانده", "موجودی", "حساب", "کارت", "شماره", "واریز",
    "انتقال", "بانک", "از", "و"
  )

  /** Normalizes text for regex: digits to Latin and commas. */
  private fun normalize(text: String): String {
    return SmsSender.toLatinDigits(text)
      .replace('\u200c', ' ')
      .replace('\u200e', ' ')
      .replace('\u200f', ' ')
      .replace('\u066b', ',')
      .replace('\u060c', ',')
      .replace("\r", "")
  }

  fun cleanPayerName(raw: String?): String? {
    if (raw.isNullOrBlank()) return null

    var value = raw
      .replace(Regex("[0-9]+"), " ")
      .replace(Regex("[«»\"'()\\[\\]{}|_\\\\/*#+]"), " ")
      .replace(Regex("[,:;.…\\-–_]+"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()

    var changed = true
    while (changed) {
      changed = false
      for (token in TRAILING_TOKENS) {
        if (value == token) {
          value = ""
          changed = true
        } else if (value.endsWith(" $token")) {
          value = value.dropLast(token.length + 1).trim()
          changed = true
        }
      }
    }

    if (value.length < 2) return null

    if (!Regex("^[\\u0600-\\u06ff\\s]+$").matches(value)) return null

    val words = value.split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (words.isEmpty() || words.size > 5) return null
    if (words.any { STOP_WORDS.contains(it) }) return null

    return words.joinToString(" ")
  }

  /** Extracts payer name from deposit SMS body, or null. */
  fun extractPayerName(body: String): String? {
    if (body.isBlank()) return null
    val text = normalize(body)

    for (pattern in PAYER_PATTERNS) {
      val match = pattern.find(text)
      val name = cleanPayerName(match?.groupValues?.getOrNull(1))
      if (name != null) return name
    }

    val fromTo = PAYER_FROM_TO.find(text)
    return cleanPayerName(fromTo?.groupValues?.getOrNull(1))
  }
}
