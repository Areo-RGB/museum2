package uk.h03.gallery.upload

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.Toast

/**
 * Entry points for native uploads: "Share → Museum upload" from the photo
 * gallery, or the "Museum upload" launcher icon, which opens the system picker.
 * Asks for the upload key once, then hands the files to [UploadService].
 */
class UploadActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
    }
    val shared = sharedUris(intent)
    if (shared.isNotEmpty()) withKey { send(shared) } else pick()
  }

  private fun sharedUris(intent: Intent): List<Uri> = when (intent.action) {
    Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
    Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
    else -> emptyList()
  }

  private fun pick() {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("*/*")
      .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
      .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    startActivityForResult(intent, PICK)
  }

  @Deprecated("Activity result API needs AndroidX")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != PICK || resultCode != RESULT_OK || data == null) return finish()
    val uris = data.clipData?.let { clip -> (0 until clip.itemCount).map { clip.getItemAt(it).uri } }
      ?: listOfNotNull(data.data)
    for (uri in uris) runCatching { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    withKey { send(uris) }
  }

  private fun withKey(then: () -> Unit) {
    if (Settings.uploadKey(this) != null) return then()
    val field = EditText(this).apply {
      hint = "Upload key"
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
    }
    AlertDialog.Builder(this)
      .setTitle("Museum upload key")
      .setMessage("Needed once on this tablet to upload to the museum bucket.")
      .setView(field)
      .setPositiveButton("Upload") { _, _ ->
        val key = field.text.toString().trim()
        if (key.isEmpty()) finish() else { Settings.saveUploadKey(this, key); then() }
      }
      .setNegativeButton("Cancel") { _, _ -> finish() }
      .setOnCancelListener { finish() }
      .show()
  }

  private fun send(uris: List<Uri>) {
    if (uris.isEmpty()) return finish()
    val message = try {
      UploadService.start(this, uris)
      "Uploading ${uris.size} file(s) to the museum…"
    } catch (e: SecurityException) {
      "The sharing app didn't allow reading these files. Use the Museum upload icon instead."
    }
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    finish()
  }

  companion object { private const val PICK = 1 }
}
