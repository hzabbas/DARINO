package com.darino.app.sms

/**
 * تبدیل مبلغ تومانی به لیست کلیپ‌های صوتی آفلاین.
 *
 * هر کلیپ یک فایل MP3 کوتاه است که کنار اپ بسته‌بندی می‌شود
 * (`assets/voice/{female,male}/…`) و با چسباندن پشت‌سرهم، جمله‌ی کامل را
 * می‌سازد. قواعد عددنویسی **باید مو‌به‌مو** با
 * `DepositSpeech.formatColloquialSpeechAmount` و `src/utils/numberToWords.ts`
 * یکی باشد، وگرنه پخش آفلاین با پخش آنلاین فرق می‌کند.
 *
 * دو نکته‌ی ظریف:
 *  - «و» آخر هر کلمه در خود کلیپ است؛ برای همین برای کلمه‌ای که بعدش «و»
 *    می‌آید نسخه‌ی `_o` انتخاب می‌شود (`70_o` = «هفتاد و»).
 *  - «هزار» و «میلیون» بدون «و» به عدد قبل می‌چسبند («دویست هزار»)، پس
 *    کلیپ مقیاس هیچ‌وقت `_o` نمی‌خواهد مگر بعدش گروه دیگری بیاید
 *    («یک میلیون و دویست هزار»).
 *
 * مبالغ یک میلیارد به بالا کلیپ ندارند (`null` برمی‌گردد) تا لایه‌ی بالاتر
 * از گوینده‌ی آنلاین/TTS استفاده کند.
 */
object VoiceClipStitcher {
  /** کلیپ پایانی که همیشه به آخر مبلغ می‌چسبد. */
  const val ENDING_CLIP = "toman_variz_shod"

  private const val MAX_SUPPORTED_AMOUNT = 1_000_000_000L

  private val ONES = arrayOf("", "1", "2", "3", "4", "5", "6", "7", "8", "9")

  private val TEENS = arrayOf(
    "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"
  )

  private val TENS = arrayOf("", "", "20", "30", "40", "50", "60", "70", "80", "90")

  private val HUNDREDS = arrayOf("", "100", "200", "300", "400", "500", "600", "700", "800", "900")

  private val SCALES = arrayOf("", "hezar", "milyoon")

  /**
   * کلید کلیپ‌ها برای این مبلغ، همیشه با [ENDING_CLIP] در آخر.
   *
   * `null` فقط برای صفر، منفیِ سرریز و مبالغ یک میلیارد به بالا برمی‌گردد؛
   * هر مبلغ ۱٬۰۰۰ تا ۹۹۹٬۹۹۹٬۰۰۰ تومان همیشه لیست غیرخالی می‌دهد.
   */
  fun clipsFor(amountToman: Long): List<String>? {
    if (amountToman == Long.MIN_VALUE) return null
    val amount = if (amountToman < 0L) -amountToman else amountToman
    if (amount <= 0L || amount >= MAX_SUPPORTED_AMOUNT) return null

    val clips = ArrayList<String>(12)

    when {
      // «هزار» تنها، نه «یک هزار»: «هزار تومن» طبیعی‌تر از «یک تومن» است.
      amount == 1_000L -> clips.add("hezar")

      // گفتار محاوره برای هزارهای کامل، «هزار» را حذف می‌کند: «صد و پنجاه».
      amount in 1_000L..999_999L && amount % 1_000L == 0L ->
        clips.addAll(decomposeThreeDigits((amount / 1_000L).toInt(), false))

      else -> {
        val groups = groupsOf(amount) ?: return null
        if (groups.isEmpty()) return null

        for (position in groups.indices) {
          val index = groups[position].first
          val value = groups[position].second
          val hasLaterGroup = position < groups.size - 1

          // «هزار» تنها بدون «یک»؛ مثل DepositSpeech.
          if (!(index == 1 && value == 1)) {
            clips.addAll(decomposeThreeDigits(value, false))
          }

          if (index > 0) {
            val scale = SCALES.getOrNull(index) ?: return null
            // «و» بین گروه‌ها بعد از خود کلمه‌ی مقیاس می‌نشیند:
            // «یک میلیون و دویست هزار»، ولی «دویست هزار» بدون «و».
            clips.add(if (hasLaterGroup) "${scale}_o" else scale)
          }
        }
      }
    }

    if (clips.isEmpty()) return null
    clips.add(ENDING_CLIP)
    return clips
  }

  /**
   * شکستن هر گروه سه‌رقمی (۱ تا ۹۹۹) به کلیدهای کلیپ.
   *
   * [hasMoreAfter] یعنی بعد از آخرین کلمه‌ی این گروه، «و» و کلمه‌ی دیگری
   * می‌آید؛ در آن حالت نسخه‌ی `_o` آخرین کلمه انتخاب می‌شود. این تابع برای
   * **هر** عدد ۱ تا ۹۹۹ خروجی غیرخالی می‌دهد و هیچ‌وقت `null` نمی‌سازد.
   */
  fun decomposeThreeDigits(n: Int, hasMoreAfter: Boolean): List<String> {
    val value = n.coerceIn(0, 999)
    if (value == 0) return emptyList()

    val keys = ArrayList<String>(3)
    val hundreds = value / 100
    val tensUnits = value % 100

    if (hundreds > 0) {
      val key = HUNDREDS[hundreds]
      keys.add(if (tensUnits > 0 || hasMoreAfter) "${key}_o" else key)
    }

    when {
      tensUnits in 1..19 -> {
        val key = if (tensUnits < 10) ONES[tensUnits] else TEENS[tensUnits - 10]
        keys.add(if (hasMoreAfter) "${key}_o" else key)
      }

      tensUnits >= 20 -> {
        val tens = (tensUnits / 10) * 10
        val units = tensUnits % 10
        if (units > 0) {
          keys.add("${TENS[tens / 10]}_o")
          keys.add(if (hasMoreAfter) "${ONES[units]}_o" else ONES[units])
        } else {
          keys.add(if (hasMoreAfter) "${TENS[tens / 10]}_o" else TENS[tens / 10])
        }
      }
    }

    return keys
  }

  /** گروه‌های سه‌رقمی غیرصفر از بالا به پایین؛ مثلاً ۱٬۲۵۰٬۰۰۰ → [(2,1), (1,250)]. */
  private fun groupsOf(amount: Long): List<Pair<Int, Int>>? {
    val groups = ArrayList<Pair<Int, Int>>(3)
    var remaining = amount
    var index = 0

    while (remaining > 0L) {
      val value = (remaining % 1_000L).toInt()
      if (value > 0) groups.add(index to value)
      remaining /= 1_000L
      index += 1
      if (index > SCALES.size) return null
    }

    return groups.reversed()
  }
}
