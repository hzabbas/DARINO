package com.darino.app.sms

/**
 * ساخت توکن امضای Microsoft Edge ReadAloud (`Sec-MS-GEC` نسخه‌ی ۲).
 *
 * مایکروسافت از سال ۲۰۲۵ امضای قدیمی (هش ساده‌ی SHA-256) را نمی‌پذیرد و هر
 * درخواست بدون این توکن با ۴۰۳ رد می‌شود. الگوریتم واقعی از `edge-tts`
 * (`edge_tts/drm.py`) گرفته شده و خروجی‌اش بایت‌به‌بایت با پایتون یکی است:
 * چند ثابت SHA-256 دست‌کاری‌شده، یک بسط پیام سفارشی و در آخر یک خلاصه‌ی
 * ۶۴ بیتی (CS64). قالب خروجی `<16 hex>-<64 hex>` است.
 *
 * ثانیه‌ها به «زمان فایل ویندوز» (۱۰۰ نانوثانیه از ۱۶۰۱) تبدیل و روی پنجره‌ی
 * ۵ دقیقه‌ای گرد می‌شوند؛ پس تا ۵ دقیقه یک توکن معتبر می‌ماند.
 *
 * این فایل هیچ وابستگی‌ای به اندروید ندارد و کاملاً قابل تست است.
 */
object EdgeToken {
  private const val TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
  private const val WINDOWS_EPOCH_SECONDS = 11_644_473_600L
  private const val GEC_WINDOW_SECONDS = 300L
  private const val TICKS_PER_SECOND = 10_000_000L

  // FIPS 180-4؛ مقادیر اولیه‌ی استاندارد SHA-256.
  private val INITIAL = intArrayOf(
    0x6A09E667, 0xBB67AE85.toInt(), 0x3C6EF372, 0xA54FF53A.toInt(),
    0x510E527F, 0x9B05688C.toInt(), 0x1F83D9AB, 0x5BE0CD19
  )

  private val STATE = intArrayOf(
    0xFD9FBEA2.toInt(), 0x91243CE7.toInt(), 0xBE499094.toInt(), 0xCD2E1E0A.toInt(),
    0x6C006F49, 0x04BD35AB, 0xFEB0A7E4.toInt(), 0x03EFFBD2
  )

  private val SCHEDULE = intArrayOf(
    0xEB24BF9E.toInt(), 0x1558691F, 0xA0C09EE2.toInt(), 0x0CFA32BA,
    0xA622EE8C.toInt(), 0xD1DD9491.toInt(), 0xC0DD25A0.toInt(), 0xF9E70AB6.toInt(),
    0xF0C31573.toInt(), 0x7058CE4E, 0x7188E606, 0x00E5AB33,
    0xD258B060.toInt(), 0x72766564
  )

  private val ROUND_CONSTANTS = intArrayOf(
    0x428A2F98, 0x71374491, 0xB5C0FBCF.toInt(), 0xE9B5DBA5.toInt(),
    0x3956C25B, 0x59F111F1, 0x923F82A4.toInt(), 0xAB1C5ED5.toInt(),
    0xD807AA98.toInt(), 0x12835B01, 0x243185BE, 0x550C7DC3,
    0x72BE5D74, 0x80DEB1FE.toInt(), 0x9BDC06A7.toInt(), 0xC19BF174.toInt(),
    0xE49B69C1.toInt(), 0xEFBE4786.toInt(), 0x0FC19DC6, 0x240CA1CC,
    0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152.toInt(), 0xA831C66D.toInt(), 0xB00327C8.toInt(), 0xBF597FC7.toInt(),
    0xC6E00BF3.toInt(), 0xD5A79147.toInt(), 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
    0x650A7354, 0x766A0ABB, 0x81C2C92E.toInt(), 0x92722C85.toInt(),
    0xA2BFE8A1.toInt(), 0xA81A664B.toInt(), 0xC24B8B70.toInt(), 0xC76C51A3.toInt(),
    0xD192E819.toInt(), 0xD6990624.toInt(), 0xF40E3585.toInt(), 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
    0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814.toInt(), 0x8CC70208.toInt(),
    0x90BEFFFA.toInt(), 0xA4506CEB.toInt(), 0xBEF9A3F7.toInt(), 0xC67178F2.toInt()
  )

  private val ADJUSTMENT = 0xC9DC06A7.toInt()
  private val BLOCK_CONSTANTS = ROUND_CONSTANTS.copyOf().also { it[14] = ADJUSTMENT }
  private val SIGMA0_ADJUSTMENT = 0x059C0B80
  private val SIGMA1_ADJUSTMENT = 0x000B92C0

  private val CS64_COEFFICIENTS = arrayOf(
    intArrayOf(0xE82E91B1.toInt(), 0xB32700D0.toInt()),
    intArrayOf(0x44DE24C6, 0x88DFF51D.toInt()),
    intArrayOf(0x3BEB65BC, 0x29514038),
    intArrayOf(0xC89C5933.toInt(), 0xB328CBDF.toInt()),
    intArrayOf(0x8D1EC211.toInt(), 0xD405B4D5.toInt()),
    intArrayOf(0x314EF5D5, 0x26E55F3C),
    intArrayOf(0xE92491B1.toInt(), 0x607801C6),
    intArrayOf(0xF0A5B9D5.toInt(), 0x82B2C1FB.toInt()),
    intArrayOf(0x06064CF3, 0xFA51A3DA.toInt()),
    intArrayOf(0xDA79FA60.toInt(), 0x207CC464),
    intArrayOf(0xBED20560.toInt(), 0x3C3C74F3),
    intArrayOf(0x89F9C9F8.toInt(), 0xD2D14B61.toInt()),
    intArrayOf(0x35FA38C6, 0xBB04A2C1.toInt()),
    intArrayOf(0xCB49E3C6.toInt(), 0xC5626167.toInt())
  )

  private val CS64_FACTOR = 0x82893933.toInt()
  private val CS64_ADJUSTMENT0 = 0xF2F90B1A.toInt()
  private val CS64_ADJUSTMENT1 = 0x0B1A0000

  /** توکن آماده برای کوئری `Sec-MS-GEC`؛ نمونه: `294C3D85CCDF27C0-5F54…`. */
  fun generate(nowMillis: Long = System.currentTimeMillis()): String {
    var ticks = nowMillis / 1000L + WINDOWS_EPOCH_SECONDS
    ticks -= ticks % GEC_WINDOW_SECONDS
    val ticks100ns = ticks * TICKS_PER_SECOND
    val data = (ticks100ns.toString() + TRUSTED_CLIENT_TOKEN).toByteArray(Charsets.US_ASCII)

    val digest = sha256Digest(data)
    val cs64 = cs64Digest(data, digest)
    return hex(cs64) + "-" + hex(digest)
  }

  // -------------------------------------------------------------------------
  // SHA-256 سفارشی
  // -------------------------------------------------------------------------

  private fun rotateRight(value: Int, bits: Int): Int {
    return (value ushr bits) or (value shl (32 - bits))
  }

  private fun sigma0(value: Int): Int {
    return (value ushr 7) xor (value shl 25) xor (value ushr 18) xor
      (value shl 14) xor (value ushr 3)
  }

  private fun sigma1(value: Int): Int {
    return (value ushr 17) xor (value shl 15) xor (value ushr 19) xor
      (value shl 13) xor (value ushr 10)
  }

  private fun rounds(state: IntArray, words: IntArray, firstRound: Int): IntArray {
    var a = state[0]
    var b = state[1]
    var c = state[2]
    var d = state[3]
    var e = state[4]
    var f = state[5]
    var g = state[6]
    var h = state[7]
    val constants = if (firstRound == 14) BLOCK_CONSTANTS else ROUND_CONSTANTS

    for (index in firstRound until 64) {
      val choose = g xor (e and (f xor g))
      val t1 = h + (rotateRight(e, 6) xor rotateRight(e, 11) xor rotateRight(e, 25)) +
        choose + constants[index] + words[index]
      val majority = (a and b) or (c and (a or b))
      val t2 = (rotateRight(a, 2) xor rotateRight(a, 13) xor rotateRight(a, 22)) + majority

      h = g
      g = f
      f = e
      e = d + t1
      d = c
      c = b
      b = a
      a = t1 + t2
    }

    return intArrayOf(a, b, c, d, e, f, g, h)
  }

  private fun expand(words: IntArray, firstWord: Int) {
    for (index in firstWord until 64) {
      words[index] = sigma1(words[index - 2]) + words[index - 7] +
        sigma0(words[index - 15]) + words[index - 16]
    }
  }

  private fun initialState(head: ByteArray): IntArray {
    val words = IntArray(64)
    words[14] = ((head[0].toInt() and 0xFF) shl 16) or
      ((head[1].toInt() and 0xFF) shl 8) or (head[2].toInt() and 0xFF)
    words[15] = ((head[3].toInt() and 0xFF) shl 24) or
      ((head[4].toInt() and 0xFF) shl 16) or
      ((head[5].toInt() and 0xFF) shl 8) or (head[6].toInt() and 0xFF)

    for (index in 16..29) {
      var value = SCHEDULE[index - 16]
      if (index - 2 >= 14) {
        value += if (index == 16) sigma1(words[index - 2]) xor SIGMA1_ADJUSTMENT
        else sigma1(words[index - 2])
      }
      if (index - 7 >= 14) value += words[index - 7]
      if (index - 15 >= 14) {
        value += if (index == 29) sigma0(words[index - 15]) xor SIGMA0_ADJUSTMENT
        else sigma0(words[index - 15])
      }
      words[index] = value
    }

    words[30] = sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] +
      ADJUSTMENT - ROUND_CONSTANTS[14]
    expand(words, 31)

    val working = rounds(STATE, words, 14)
    return IntArray(8) { INITIAL[it] + working[it] }
  }

  private fun sha256Digest(data: ByteArray): ByteArray {
    val length = 57 + data.size
    val padding = (((55 - length) % 64) + 64) % 64
    val padded = ByteArray(data.size - 7 + 1 + padding + 8)
    System.arraycopy(data, 7, padded, 0, data.size - 7)
    padded[data.size - 7] = 0x80.toByte()

    var bits = length.toLong() * 8L
    for (index in 0 until 8) {
      padded[padded.size - 1 - index] = (bits and 0xFFL).toByte()
      bits = bits ushr 8
    }

    var state = initialState(data.copyOfRange(0, 7))

    var offset = 0
    while (offset < padded.size) {
      val words = IntArray(64)
      for (index in 0 until 16) {
        val base = offset + index * 4
        words[index] = ((padded[base].toInt() and 0xFF) shl 24) or
          ((padded[base + 1].toInt() and 0xFF) shl 16) or
          ((padded[base + 2].toInt() and 0xFF) shl 8) or
          (padded[base + 3].toInt() and 0xFF)
      }
      expand(words, 16)
      val working = rounds(state, words, 0)
      state = IntArray(8) { state[it] + working[it] }
      offset += 64
    }

    val digest = ByteArray(32)
    for (index in 0 until 8) {
      digest[index * 4] = (state[index] ushr 24).toByte()
      digest[index * 4 + 1] = (state[index] ushr 16).toByte()
      digest[index * 4 + 2] = (state[index] ushr 8).toByte()
      digest[index * 4 + 3] = state[index].toByte()
    }
    return digest
  }

  // -------------------------------------------------------------------------
  // CS64
  // -------------------------------------------------------------------------

  private fun wordsLittleEndian(data: ByteArray): IntArray {
    val padding = (4 - (data.size % 4)) % 4
    val padded = ByteArray(data.size + padding)
    System.arraycopy(data, 0, padded, 0, data.size)

    val count = padded.size / 4
    val words = IntArray(if (count % 2 == 0) count else count + 1)
    for (index in 0 until count) {
      val base = index * 4
      words[index] = (padded[base].toInt() and 0xFF) or
        ((padded[base + 1].toInt() and 0xFF) shl 8) or
        ((padded[base + 2].toInt() and 0xFF) shl 16) or
        ((padded[base + 3].toInt() and 0xFF) shl 24)
    }
    return words
  }

  private fun rotateHalf(word: Int): Int {
    return (word shl 16) or (word ushr 16)
  }

  private fun cs64Digest(data: ByteArray, digest: ByteArray): ByteArray {
    var keyA = (digest[0].toInt() and 0xFF) or ((digest[1].toInt() and 0xFF) shl 8) or
      ((digest[2].toInt() and 0xFF) shl 16) or ((digest[3].toInt() and 0xFF) shl 24)
    var keyB = (digest[4].toInt() and 0xFF) or ((digest[5].toInt() and 0xFF) shl 8) or
      ((digest[6].toInt() and 0xFF) shl 16) or ((digest[7].toInt() and 0xFF) shl 24)
    keyA = keyA or 1
    keyB = keyB or 1

    val factors = intArrayOf(keyA * CS64_FACTOR, keyB * CS64_FACTOR)
    val terms = IntArray(CS64_COEFFICIENTS.size)
    val offsets = IntArray(CS64_COEFFICIENTS.size)
    for (index in CS64_COEFFICIENTS.indices) {
      terms[index] = CS64_COEFFICIENTS[index][0] * factors[index % 2]
      offsets[index] = CS64_COEFFICIENTS[index][1]
    }

    val salted = ByteArray(data.size + 1)
    System.arraycopy(data, 0, salted, 1, data.size)
    val words = wordsLittleEndian(salted)

    val allTerms = IntArray(terms.size + words.size)
    val allOffsets = IntArray(offsets.size + words.size)
    System.arraycopy(terms, 0, allTerms, 0, terms.size)
    System.arraycopy(offsets, 0, allOffsets, 0, offsets.size)

    for (index in words.indices) {
      val word = words[index]
      val even = index % 2 == 0
      var term = word * (if (even) keyA else keyB)
      var offset = rotateHalf(word) * (if (even) 0xEF0569FB.toInt() else 0xC31713DB.toInt())
      if (index == 0) {
        term += CS64_ADJUSTMENT0 * factors[0]
        offset += CS64_ADJUSTMENT1
      }
      allTerms[terms.size + index] = term
      allOffsets[offsets.size + index] = offset
    }

    var swapAcc = 0
    var swapLast = 0
    var state = 0
    var acc = 0
    var index = 0
    while (index < allTerms.size) {
      val x = allTerms[index]
      val y = allTerms[index + 1]

      var t = rotateHalf(allOffsets[index] + x)
      var q = t * 0x76F50F34
      swapAcc += rotateHalf(q) * 0xC3EFEA97.toInt() + q

      t = rotateHalf(allOffsets[index + 1] + y)
      q = t * 0x1881CE3C
      swapLast = rotateHalf(q) * 0x35BD1EC9 + q
      swapAcc += swapLast

      state = state * keyA + x
      state = rotateHalf(state) * 0xCF98B111.toInt()
      state = rotateHalf(state) * 0x87085B9F.toInt()
      state = rotateHalf(state) * 0x12CEB96D
      state = rotateHalf(state) * 0x257E1D83
      acc += state

      t = state * keyB + y
      t = rotateHalf(t) * 0xA27416F5.toInt()
      t = rotateHalf(t) * 0xD38396FF.toInt()
      state = rotateHalf(rotateHalf(t) * 0x7C932B89) * 0xBFA49F69.toInt()
      acc += state

      index += 2
    }

    val first = swapLast xor state
    val second = swapAcc xor acc
    val out = ByteArray(8)
    for (byteIndex in 0 until 4) {
      out[byteIndex] = (first ushr (byteIndex * 8)).toByte()
      out[byteIndex + 4] = (second ushr (byteIndex * 8)).toByte()
    }
    return out
  }

  private fun hex(bytes: ByteArray): String {
    val builder = StringBuilder(bytes.size * 2)
    for (byte in bytes) {
      val value = byte.toInt() and 0xFF
      builder.append(HEX_DIGITS[value ushr 4])
      builder.append(HEX_DIGITS[value and 0x0F])
    }
    return builder.toString()
  }

  private const val HEX_DIGITS = "0123456789ABCDEF"
}
