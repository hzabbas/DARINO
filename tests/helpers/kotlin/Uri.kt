package android.net
class Uri private constructor(val value: String) {
  companion object { @JvmStatic fun parse(value: String) = Uri(value) }
}
