package android.content

import android.database.Cursor
import android.net.Uri

class ContentResolver {
  fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null
}
