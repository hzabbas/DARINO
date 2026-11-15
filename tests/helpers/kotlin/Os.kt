package android.os

class Bundle {
  private val values = mutableMapOf<String, Any?>()
  fun getBoolean(key: String, defaultValue: Boolean): Boolean = values[key] as? Boolean ?: defaultValue
  fun getString(key: String): String? = values[key] as? String
  fun remove(key: String) { values.remove(key) }
}
object Build {
  object VERSION { const val SDK_INT = 35 }
  object VERSION_CODES { const val M = 23; const val O = 26; const val TIRAMISU = 33 }
}
object SystemClock { fun elapsedRealtime(): Long = System.currentTimeMillis() }
class PowerManager {
  fun isIgnoringBatteryOptimizations(packageName: String): Boolean = true
  fun newWakeLock(level: Int, tag: String) = WakeLock()
  class WakeLock {
    var isHeld: Boolean = false
    fun setReferenceCounted(value: Boolean) {}
    fun acquire(timeout: Long) { isHeld = true }
    fun release() { isHeld = false }
  }
  companion object { const val PARTIAL_WAKE_LOCK = 1 }
}
