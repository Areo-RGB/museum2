package uk.h03.gallery.upload

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import java.util.concurrent.Executors

/**
 * Foreground service that uploads picked or shared files to the bucket one at a
 * time, with a progress notification, so uploads keep going if the visitor
 * returns to the gallery or the screen turns off.
 */
class UploadService : Service() {

  private val worker = Executors.newSingleThreadExecutor()
  private var queued = 0
  private var finished = 0
  private var failed = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val uris = intent?.getParcelableArrayListExtra(EXTRA_URIS, Uri::class.java).orEmpty()
    startForeground(NOTIFY_ID, progress("Preparing upload…", 0, 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    queued += uris.size
    for (uri in uris) worker.execute { uploadOne(uri) }
    worker.execute { if (finished + failed >= queued) finish() }
    return START_NOT_STICKY
  }

  private fun uploadOne(uri: Uri) {
    val key = Settings.uploadKey(this) ?: run { failed++; return }
    val (name, size) = describe(uri)
    val type = contentResolver.getType(uri)
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
      ?: "application/octet-stream"
    val label = "${finished + failed + 1} of $queued · $name"
    try {
      val client = BucketClient(Settings.SITE, key)
      val result = contentResolver.openInputStream(uri)!!.use { input ->
        client.upload(name, type, size, input) { sent -> notify(progress(label, sent, size)) }
      }
      Log.i(TAG, "uploaded ${result.key}")
      finished++
    } catch (e: BucketClient.AuthException) {
      Settings.forgetUploadKey(this)
      lastError = e.message
      failed++
    } catch (e: Exception) {
      Log.w(TAG, "upload failed for $name", e)
      lastError = "$name: ${e.message}"
      failed++
    }
  }

  private var lastError: String? = null

  private fun finish() {
    val text = buildString {
      append("$finished uploaded to the museum bucket")
      if (failed > 0) append(", $failed failed${lastError?.let { " ($it)" } ?: ""}")
      append(".")
    }
    stopForeground(STOP_FOREGROUND_DETACH)
    notify(builder().setContentTitle("Museum upload finished").setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text)).setOngoing(false).build(), DONE_ID)
    stopSelf()
  }

  private fun describe(uri: Uri): Pair<String, Long> {
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val name = c.getString(0) ?: uri.lastPathSegment ?: "upload"
        val size = if (c.isNull(1)) -1L else c.getLong(1)
        if (size > 0) return name to size
      }
    }
    val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    return (uri.lastPathSegment ?: "upload") to size
  }

  private fun builder(): Notification.Builder {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Uploads", NotificationManager.IMPORTANCE_LOW))
    return Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload)
  }

  private fun progress(text: String, sent: Long, size: Long): Notification {
    val percent = if (size > 0) (sent * 100 / size).toInt() else 0
    return builder().setContentTitle("Uploading to the museum").setContentText(text)
      .setProgress(100, percent, size <= 0).setOngoing(true).build()
  }

  private fun notify(n: Notification, id: Int = NOTIFY_ID) = getSystemService(NotificationManager::class.java).notify(id, n)

  override fun onDestroy() { worker.shutdownNow(); super.onDestroy() }

  companion object {
    private const val TAG = "MuseumUpload"
    private const val CHANNEL = "uploads"
    private const val NOTIFY_ID = 1
    private const val DONE_ID = 2
    private const val EXTRA_URIS = "uris"

    fun start(context: Context, uris: List<Uri>) {
      val intent = Intent(context, UploadService::class.java)
        .putParcelableArrayListExtra(EXTRA_URIS, ArrayList(uris))
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      // Carry the read grants for shared content:// URIs over to the service.
      if (uris.isNotEmpty()) {
        intent.clipData = android.content.ClipData.newRawUri(null, uris[0]).apply { uris.drop(1).forEach { addItem(android.content.ClipData.Item(it)) } }
      }
      context.startForegroundService(intent)
    }
  }
}
