package com.darino.app.sms

/**
 * تبدیل مبلغ تومانی به لیست کلیپ‌های صوتی آفلاین.
 *
 * هر کلیپ یک فایل MP3 کوتاه است که کنار اپ بسته‌بندی می‌شود
 * (`assets/voice/{female,male}/…`) و با چسباندن پشت‌سرهم، جمله‌ی کامل را
 * می‌سازد. قواعد عددنویسی **باید مو‌به‌مو** با
 * `DepositSpeech.formatColloquialSpeechAmount` یکی باشد، وگرنه پخش آفلاین با
 * پخش آنلاین فرق می‌کند.
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

  /** یک قطعه‌ی جمله: کلید فایل و این‌که آیا کلمه‌ی مقیاس است. */
  private data class Atom(val key: String, val isScale: Boolean)

  /**
   * کلید کلیپ‌ها برای این مبلغ، همیشه با [ENDING_CLIP] در آخر.
   * `null` یعنی این مبلغ با کلیپ‌های موجود قابل بیان نیست.
   */
  fun clipsFor(amountToman: Long): List<String>? {
    val atoms = atomsFor(amountToman) ?: return null
    if (atoms.isEmpty()) return null

    val clips = ArrayList<String>(atoms.size + 1)
    for (index in atoms.indices) {
      val atom = atoms[index]
      val next = if (index + 1 < atoms.size) atoms[index + 1] else null
      // «و» بین دو کلمه می‌آید، ولی بین عدد و «هزار/میلیون» نمی‌آید:
      // «دویست هزار»، «یک میلیون و دویست هزار»، «یک میلیون و هزار».
      val needsConnector = next != null && (atom.isScale || !next.isScale)
      clips.add(if (needsConnector) "${atom.key}_o" else atom.key)
    }
    clips.add(ENDING_CLIP)
    return clips
  }

  // -------------------------------------------------------------------------
  // عدد به قطعه
  // -------------------------------------------------------------------------

  private fun atomsFor(amountToman: Long): List<Atom>? {
    if (amountToman == Long.MIN_VALUE) return null
    val amount = if (amountToman < 0L) -amountToman else amountToman
    if (amount == 0L) return null
    if (amount >= MAX_SUPPORTED_AMOUNT) return null

    // همان استثنای DepositSpeech: «هفتاد هزار» در گفتار محاوره «هفتاد» است و
    // «هفتاد و پونصد هزار» «هفتاد و پونصد».
    if (amount in 1_000L..999_999L) {
      val remainder = amount % 1_000L
      if (remainder == 0L) return threeDigitAtoms((amount / 1_000L).toInt())
      if (remainder == 500L) {
        val atoms = ArrayList<Atom>(4)
        atoms.addAll(threeDigitAtoms((amount / 1_000L).toInt()))
        atoms.addAll(threeDigitAtoms(500))
        return atoms
      }
    }

    return fullAtoms(amount)
  }

  private fun fullAtoms(amount: Long): List<Atom>? {
    val groups = ArrayList<Int>(4)
    var remaining = amount
    while (remaining > 0L) {
      groups.add((remaining % 1_000L).toInt())
      remaining /= 1_000L
    }
    if (groups.size > SCALES.size) return null

    val atoms = ArrayList<Atom>(8)
    for (index in groups.indices.reversed()) {
      val group = groups[index]
      if (group == 0) continue

      // «هزار» تنها، بدون «یک»؛ مثل DepositSpeech.
      if (!(index == 1 && group == 1)) {
        atoms.addAll(threeDigitAtoms(group))
      }
      if (index > 0) atoms.add(Atom(SCALES[index], true))
    }
    return atoms
  }

  private fun threeDigitAtoms(value: Int): List<Atom> {
    val atoms = ArrayList<Atom>(3)
    val hundreds = value / 100
    val rest = value % 100

    if (hundreds > 0) atoms.add(Atom(HUNDREDS[hundreds], false))

    if (rest in 10..19) {
      atoms.add(Atom(TEENS[rest - 10], false))
    } else {
      val tens = rest / 10
      val ones = rest % 10
      if (tens > 0) atoms.add(Atom(TENS[tens], false))
      if (ones > 0) atoms.add(Atom(ONES[ones], false))
    }

    return atoms
  }
}
