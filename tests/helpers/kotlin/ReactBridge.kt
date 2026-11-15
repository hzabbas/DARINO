package com.facebook.react.bridge

import android.content.Context

@Target(AnnotationTarget.FUNCTION)
annotation class ReactMethod
interface Promise {
  fun resolve(value: Any?)
  fun reject(code: String, message: String)
}
interface ReadableArray {
  fun size(): Int
  fun getString(index: Int): String?
}
interface WritableArray {
  fun pushMap(map: WritableMap)
}
interface WritableMap {
  fun putString(key: String, value: String?)
  fun putDouble(key: String, value: Double)
  fun putInt(key: String, value: Int)
  fun putBoolean(key: String, value: Boolean)
}
private class ArrayDouble : ReadableArray, WritableArray {
  override fun size() = 0
  override fun getString(index: Int): String? = null
  override fun pushMap(map: WritableMap) {}
}
private class MapDouble : WritableMap {
  val values = mutableMapOf<String, Any?>()
  override fun putString(key: String, value: String?) { values[key] = value }
  override fun putDouble(key: String, value: Double) { values[key] = value }
  override fun putInt(key: String, value: Int) { values[key] = value }
  override fun putBoolean(key: String, value: Boolean) { values[key] = value }
}
object Arguments {
  @JvmStatic fun createArray(): WritableArray = ArrayDouble()
  @JvmStatic fun createMap(): WritableMap = MapDouble()
}
open class ReactApplicationContext : Context() {
  fun getCurrentActivity(): android.content.Activity? = null
}
open class ReactContextBaseJavaModule(val reactApplicationContext: ReactApplicationContext) {
  open fun getName(): String = ""
}
