// JVM-only Android/React Native API doubles for compiling the production Kotlin.
// No production behavior is replaced: the test compiles the real voice sources.
package android.content

import android.content.pm.ApplicationInfo
import android.content.res.AssetManager
import android.net.Uri
import android.os.Bundle
import java.io.File

open class Context {
  val applicationContext: Context get() = this
  val applicationInfo: ApplicationInfo = ApplicationInfo()
  val packageName: String = "com.darino.app"
  val cacheDir: File = File.createTempFile("darino-cache", "dir")
  val filesDir: File = cacheDir
  val assets: AssetManager = AssetManager()
  val contentResolver: android.content.ContentResolver = android.content.ContentResolver()
  open fun getSystemService(name: String): Any? = null
  open fun startActivity(intent: Intent) {}
  private val stores = mutableMapOf<String, MemoryPreferences>()
  open fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
    return stores.getOrPut(name) { MemoryPreferences() }
  }

  interface SharedPreferences {
    fun getString(key: String, defaultValue: String?): String?
    fun getLong(key: String, defaultValue: Long): Long
    fun edit(): Editor
  }
  interface Editor {
    fun putString(key: String, value: String?): Editor
    fun putLong(key: String, value: Long): Editor
    fun remove(key: String): Editor
    fun apply()
    fun commit(): Boolean
  }
  private class MemoryPreferences : SharedPreferences {
    val values = mutableMapOf<String, Any?>()
    override fun getString(key: String, defaultValue: String?): String? = values[key] as? String ?: defaultValue
    override fun getLong(key: String, defaultValue: Long) = values[key] as? Long ?: defaultValue
    override fun edit() = object : Editor {
      override fun putString(key: String, value: String?) = apply { values[key] = value }
      override fun putLong(key: String, value: Long) = apply { values[key] = value }
      override fun remove(key: String) = apply { values.remove(key) }
      override fun apply() {}
      override fun commit() = true
    }
  }

  companion object {
    const val MODE_PRIVATE = 0
    const val AUDIO_SERVICE = "audio"
    const val POWER_SERVICE = "power"
  }
}

class ComponentName(val packageName: String, val className: String)
open class Activity(var intent: Intent? = null)
open class Intent() {
  var data: Uri? = null
  var dataString: String? = null
  val extras: Bundle? = Bundle()
  constructor(intent: Intent) : this() { data = intent.data; dataString = intent.dataString }
  constructor(action: String) : this() {}
  fun setComponent(component: ComponentName) = this
  fun setData(uri: Uri) = apply { data = uri; dataString = uri.value }
  fun addFlags(flags: Int) = this
  fun removeExtra(key: String) = apply { extras?.remove(key) }
  companion object { const val FLAG_ACTIVITY_NEW_TASK = 0x10000000 }
}
