package com.darino.app.sms

/**
 * خواندن فینگلیسی جمله‌ی فارسی؛ آخرین سنگر گوینده.
 *
 * اگر اینترنت نبود و کلیپ آفلاین هم برای آن مبلغ وجود نداشت، TTS خود اندروید
 * با زبان فارسی صدای هیچ‌چیز تولید نمی‌کند (حرف‌های فارسی را رد می‌کند و فقط
 * سکوت می‌ماند). در آن حالت جمله به حروف لاتین نوشته می‌شود و با
 * `Locale.US` خوانده می‌شود تا کاربر دست‌کم مبلغ را بشنود.
 *
 * کلمه‌های ثابت جمله (اعداد، «تومن»، «واریز»، …) دیکشنری دارند و بقیه
 * (اسم واریزکننده) حرف‌به‌حرف آوانویسی می‌شود.
 */
object PersianFinglish {
  private val WORDS = mapOf(
    // اعداد
    "یک" to "yek",
    "دو" to "do",
    "سه" to "se",
    "چهار" to "chahar",
    "پنج" to "panj",
    "شش" to "shesh",
    "هفت" to "haft",
    "هشت" to "hasht",
    "نه" to "noh",
    "ده" to "dah",
    "یازده" to "yazdah",
    "دوازده" to "davazdah",
    "سیزده" to "sizdah",
    "چهارده" to "chahardah",
    "پونزده" to "poondah",
    "شونزده" to "shoondah",
    "هیفده" to "hifdah",
    "هیجده" to "hijdah",
    "نوزده" to "noozdah",
    "بیست" to "beest",
    "سی" to "see",
    "چهل" to "chehel",
    "پنجاه" to "panjah",
    "شصت" to "shast",
    "هفتاد" to "haftaad",
    "هشتاد" to "hashtaad",
    "نود" to "navad",
    "صد" to "sad",
    "دویست" to "devist",
    "سیصد" to "sisad",
    "چهارصد" to "chaharsad",
    "پونصد" to "poonsad",
    "ششصد" to "sheshsad",
    "هفتصد" to "haftsad",
    "هشتصد" to "hashtsad",
    "نهصد" to "nohsad",
    "هزار" to "hezaar",
    "میلیون" to "milyoon",
    "میلیارد" to "milyard",
    "صفر" to "sefr",
    // اجزای جمله
    "و" to "o",
    "تومن" to "toman",
    "تومان" to "toman",
    "برات" to "baraat",
    "واریز" to "vaariz",
    "کرد" to "kard",
    "شد" to "shod",
    "عدد" to "adad",
    "بسیار" to "besyaar",
    "بزرگ" to "bozorg",
    // نام‌های رایج پیامک‌های بانکی
    "علی" to "Ali",
    "محمدی" to "Mohammadi",
    "رضایی" to "Rezaei",
    "حسینی" to "Hosseini",
    "احمدی" to "Ahmadi",
    "کریمی" to "Karimi",
    "مریم" to "Maryam",
    "فاطمه" to "Fatemeh",
    "زهرا" to "Zahra",
    "محمد" to "Mohammad",
    "حسین" to "Hossein",
    "رضا" to "Reza",
    "امیر" to "Amir",
    "سعید" to "Saeed",
    "مهدی" to "Mahdi"
  )

  /** جمله‌ی فارسی → فینگلیسی خوانا. */
  fun transliterate(text: String): String {
    val builder = StringBuilder(text.length * 2)
    val word = StringBuilder()

    fun flushWord() {
      if (word.isEmpty()) return
      val latin = translateWord(word.toString())
      if (latin.isNotEmpty()) {
        if (builder.isNotEmpty() && builder.last() != ' ') builder.append(' ')
        builder.append(latin)
      }
      word.setLength(0)
    }

    for (char in text) {
      if (char == '\u200c' || char == '\u200f' || char == '\u200e') continue
      if (char.isWhitespace()) {
        flushWord()
        continue
      }
      if (char == '،' || char == ',' || char == '؛' || char == ';' || char == '.' ||
        char == '!' || char == '?' || char == ':'
      ) {
        flushWord()
        if (char == '،' || char == ',' || char == '؛' || char == ';') {
          builder.append(',')
        } else {
          builder.append(char)
        }
        continue
      }
      word.append(char)
    }
    flushWord()

    return builder.toString().trim()
  }

  private fun translateWord(raw: String): String {
    val lower = raw.lowercase()
    WORDS[lower]?.let { return it }

    val builder = StringBuilder(lower.length * 2)
    for (char in lower) {
      builder.append(translateChar(char))
    }
    return builder.toString()
  }

  private fun translateChar(char: Char): String {
    return when (char) {
      'آ', 'ا', 'أ', 'إ' -> "a"
      'ب' -> "b"
      'پ' -> "p"
      'ت' -> "t"
      'ث' -> "s"
      'ج' -> "j"
      'چ' -> "ch"
      'ح' -> "h"
      'خ' -> "kh"
      'د' -> "d"
      'ذ' -> "z"
      'ر' -> "r"
      'ز' -> "z"
      'ژ' -> "zh"
      'س' -> "s"
      'ش' -> "sh"
      'ص' -> "s"
      'ض' -> "z"
      'ط' -> "t"
      'ظ' -> "z"
      'ع' -> ""
      'غ' -> "gh"
      'ف' -> "f"
      'ق' -> "gh"
      'ک', 'ك' -> "k"
      'گ' -> "g"
      'ل' -> "l"
      'م' -> "m"
      'ن' -> "n"
      'و', 'ؤ' -> "o"
      'ه', 'ة', 'ۀ' -> "h"
      'ی', 'ي', 'ئ', 'ى' -> "i"
      'ء' -> ""
      '۰', '٠' -> "0"
      '۱', '١' -> "1"
      '۲', '٢' -> "2"
      '۳', '٣' -> "3"
      '۴', '٤' -> "4"
      '۵', '٥' -> "5"
      '۶', '٦' -> "6"
      '۷', '٧' -> "7"
      '۸', '٨' -> "8"
      '۹', '٩' -> "9"
      else -> char.toString()
    }
  }
}
