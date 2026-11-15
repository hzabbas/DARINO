package org.json

/** Minimal JSON DOM for the JVM tests; production uses Android's org.json. */
class JSONArray {
  val items = mutableListOf<Any?>()
  constructor()
  constructor(values: Collection<*>?) { if (values != null) items.addAll(values) }
  constructor(raw: String) {
    if (raw.trim().startsWith("[")) {
      if (raw.contains("{")) {
        Regex("\\{[^{}]*\\}").findAll(raw).forEach { items.add(JSONObject(it.value)) }
      } else {
        Regex("\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"").findAll(raw).forEach { items.add(unescape(it.groupValues[1])) }
      }
    }
  }
  fun length() = items.size
  fun put(value: Any?) = apply { items.add(value) }
  fun optJSONObject(index: Int): JSONObject? = items.getOrNull(index) as? JSONObject
  fun optString(index: Int, fallback: String = ""): String = items.getOrNull(index)?.toString() ?: fallback
  override fun toString() = items.joinToString(",", "[", "]") { render(it) }
}

class JSONObject {
  val values = linkedMapOf<String, Any?>()
  constructor()
  constructor(raw: String) {
    val pattern = Regex("\\\"([^\\\"]+)\\\"\\s*:\\s*(\\\"(?:\\\\.|[^\\\"\\\\])*\\\"|true|false|-?[0-9.]+|\\[[^\\]]*\\])")
    for (match in pattern.findAll(raw)) {
      val token = match.groupValues[2]
      values[match.groupValues[1]] = when {
        token.startsWith("[") -> JSONArray(token)
        token == "true" || token == "false" -> token.toBoolean()
        token.startsWith("\"") -> unescape(token.drop(1).dropLast(1))
        else -> token.toDoubleOrNull() ?: token.toLongOrNull() ?: token
      }
    }
  }
  fun put(key: String, value: Any?) = apply { values[key] = value }
  fun optString(key: String, fallback: String): String = values[key]?.toString() ?: fallback
  fun optInt(key: String, fallback: Int): Int = (values[key] as? Number)?.toInt() ?: fallback
  fun optBoolean(key: String, fallback: Boolean): Boolean = values[key] as? Boolean ?: fallback
  fun optDouble(key: String, fallback: Double): Double = (values[key] as? Number)?.toDouble() ?: fallback
  fun optJSONArray(key: String): JSONArray? = values[key] as? JSONArray
  override fun toString() = values.entries.joinToString(",", "{", "}") { "\"${it.key}\":${render(it.value)}" }
}

private fun render(value: Any?): String = when (value) {
  null -> "null"
  is String -> "\"${value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")}\""
  is JSONArray, is JSONObject -> value.toString()
  else -> value.toString()
}
private fun unescape(value: String): String = value
  .replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
  .replace("\\\"", "\"").replace("\\\\", "\\")
