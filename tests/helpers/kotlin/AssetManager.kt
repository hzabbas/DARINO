package android.content.res
class AssetManager {
  fun open(path: String): java.io.InputStream = throw java.io.FileNotFoundException(path)
  fun list(path: String): Array<String>? = emptyArray()
}
