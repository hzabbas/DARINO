package com.facebook.react.modules.core

fun interface PermissionListener { fun onRequestPermissionsResult(code: Int, permissions: Array<String>, grantResults: IntArray): Boolean }
interface PermissionAwareActivity {
  fun requestPermissions(permissions: Array<String>, requestCode: Int, listener: PermissionListener)
}
