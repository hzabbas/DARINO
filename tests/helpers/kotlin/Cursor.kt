package android.database
import java.io.Closeable
class Cursor : Closeable {
  fun getColumnIndex(name: String): Int = 0
  fun moveToNext(): Boolean = false
  fun getString(index: Int): String? = ""
  fun getLong(index: Int): Long = 0
  override fun close() {}
}
