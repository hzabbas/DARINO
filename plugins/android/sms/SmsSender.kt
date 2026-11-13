package com.darino.app.sms

/**
 * قاعده‌ی یکدست سرشماره‌ها در لایه‌ی بومی اندروید.
 *
 * این فایل عمداً هیچ وابستگی‌ای به کلاس‌های اندروید ندارد تا هم مستقل کامپایل شود
 * و هم بتوان رفتارش را تست کرد. قاعده باید با `normalizeSender` و `sendersMatch`
 * در `src/utils/iranianBanks.ts` یکی بماند؛ اگر یکی تغییر کرد، آن یکی هم باید
 * عوض شود.
 */
object SmsSender {

  /** فاصله‌ها، خط تیره‌ها و کاراکترهای نامرئی جهت‌دهی که در مقایسه مهم نیستند. */
  private val NOISE = Regex(
    "[\\s\\-_\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u00ad\\u00a0\\ufeff]"
  )

  private val DIGITS_ONLY = Regex("^\\d+$")
  private val NATIONAL = Regex("^0(\\d{10})$")
  private val WITHOUT_ZERO = Regex("^98(\\d{10})$")

  /**
   * سرشماره را برای مقایسه یکدست می‌کند:
   *
   *   «B.Pasargad» → «b.pasargad»
   *   «0999 998 7641» → «0999987641»
   *   «+98 999 998 7641» → «09999987641»
   *   «00989999987641» → «09999987641»
   *   «989999987641» → «099999987641»
   *
   * پیشوندهای ایران (+98، 0098، 98) همیشه به «0» تبدیل می‌شوند تا یک شماره با
   * هر شکلی که ذخیره شده باشد با پیامک رسیده مطابقت کند.
   */
  fun normalize(raw: String?): String {
    val base = (raw ?: "").replace(NOISE, "").trim().lowercase()
    if (base.isEmpty()) return ""

    if (base.startsWith("+98")) return "0" + base.substring(3)
    if (base.startsWith("0098")) return "0" + base.substring(4)
    if (WITHOUT_ZERO.matches(base)) return "0" + base.substring(2)
    return base
  }

  /**
   * آیا این دو سرشماره به یک حساب تعلق دارند؟
   *
   * شماره‌ها فقط بعد از نرمال‌سازی دقیق مقایسه می‌شوند (تا دو شماره‌ی مختلف با
   * پسوند مشترک قاطی نشوند)، ولی سرشماره‌های متنی می‌توانند هم‌پوشانی داشته باشند
   * («B.Pasargad» با «Pasargad»).
   */
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

  /**
   * همه‌ی شکل‌های ممکن یک سرشماره در دفتر پیامک گوشی.
   *
   * کاربر ممکن است «09999987641» را ذخیره کرده باشد ولی بانک پیامک را از
   * «+989999987641» فرستاده باشد؛ برای کوئری `address IN (…)` هر شکل لازم است.
   */
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
}
