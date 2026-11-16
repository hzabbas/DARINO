package com.darino.app.sms

/**
 * Maps Toman deposit amounts to an ordered sequence of bundled MP3 audio clip keys.
 */
object VoiceClipStitcher {
  const val ENDING_CLIP = "toman_variz_shod"

  private const val MAX_SUPPORTED_AMOUNT = 1_000_000_000L

  private val ONES = arrayOf("", "1", "2", "3", "4", "5", "6", "7", "8", "9")

  private val TEENS = arrayOf(
    "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"
  )

  private val TENS = arrayOf("", "", "20", "30", "40", "50", "60", "70", "80", "90")

  private val HUNDREDS = arrayOf("", "100", "200", "300", "400", "500", "600", "700", "800", "900")

  private val SCALES = arrayOf("", "hezar", "milyoon")

  /** Generates clip keys for given amount terminated with ENDING_CLIP. */
  fun clipsFor(amountToman: Long): List<String>? {
    if (amountToman == Long.MIN_VALUE) return null
    val amount = if (amountToman < 0L) -amountToman else amountToman
    if (amount <= 0L || amount >= MAX_SUPPORTED_AMOUNT) return null

    val clips = ArrayList<String>(12)

    when {
      amount == 1_000L -> clips.add("hezar")

      amount in 1_000L..999_999L && amount % 1_000L == 0L ->
        clips.addAll(decomposeThreeDigits((amount / 1_000L).toInt(), false))

      else -> {
        val groups = groupsOf(amount) ?: return null
        if (groups.isEmpty()) return null

        for (position in groups.indices) {
          val index = groups[position].first
          val value = groups[position].second
          val hasLaterGroup = position < groups.size - 1

          if (!(index == 1 && value == 1)) {
            clips.addAll(decomposeThreeDigits(value, false))
          }

          if (index > 0) {
            val scale = SCALES.getOrNull(index) ?: return null
            clips.add(if (hasLaterGroup) "${scale}_o" else scale)
          }
        }
      }
    }

    if (clips.isEmpty()) return null
    clips.add(ENDING_CLIP)
    return clips
  }

  /** Decomposes 3-digit number (1-999) into audio clip keys. */
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
