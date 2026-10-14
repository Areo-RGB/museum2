package uk.h03.gallery.upload

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Multipart S3 upload to the museum's R2 bucket. The gallery's Worker checks the
 * upload key and presigns each part, so no bucket credentials live in the app;
 * the bytes go straight from the tablet to R2.
 */
class BucketClient(private val site: String, private val uploadKey: String) {

  class AuthException(message: String) : IOException(message)

  data class Uploaded(val key: String, val url: String)

  /** Streams [input] ([size] bytes) to the bucket; [onProgress] gets bytes sent so far. */
  fun upload(name: String, type: String, size: Long, input: InputStream, onProgress: (Long) -> Unit): Uploaded {
    val created = api("/api/multipart/create", JSONObject().put("name", name).put("type", type).put("size", size))
    val key = created.getString("key")
    val uploadId = created.getString("uploadId")
    val partSize = created.getInt("partSize")
    val partUrls = created.getJSONArray("parts")
    val done = JSONArray()
    try {
      val buffer = ByteArray(partSize)
      var sent = 0L
      for (i in 0 until partUrls.length()) {
        val part = partUrls.getJSONObject(i)
        val length = readFully(input, buffer)
        if (length <= 0) throw IOException("File ended early at part ${i + 1}.")
        val etag = retry { putPart(part.getString("url"), buffer, length) }
        done.put(JSONObject().put("partNumber", part.getInt("partNumber")).put("etag", etag))
        sent += length
        onProgress(sent)
      }
      val finished = api("/api/multipart/complete", JSONObject().put("key", key).put("uploadId", uploadId).put("parts", done))
      return Uploaded(key, finished.getString("url"))
    } catch (e: Exception) {
      runCatching { api("/api/multipart/abort", JSONObject().put("key", key).put("uploadId", uploadId)) }
      throw e
    }
  }

  private fun putPart(url: String, bytes: ByteArray, length: Int): String {
    val c = URL(url).openConnection() as HttpURLConnection
    try {
      c.requestMethod = "PUT"
      c.doOutput = true
      c.connectTimeout = 20_000
      c.readTimeout = 120_000
      c.setFixedLengthStreamingMode(length)
      c.outputStream.use { it.write(bytes, 0, length) }
      if (c.responseCode !in 200..299) throw IOException("Part upload failed (${c.responseCode}).")
      return c.getHeaderField("ETag") ?: throw IOException("R2 sent no ETag for a part.")
    } finally {
      c.disconnect()
    }
  }

  private fun api(path: String, body: JSONObject): JSONObject {
    val c = URL(site.trimEnd('/') + path).openConnection() as HttpURLConnection
    try {
      c.requestMethod = "POST"
      c.doOutput = true
      c.connectTimeout = 20_000
      c.readTimeout = 60_000
      c.setRequestProperty("Authorization", "Bearer $uploadKey")
      c.setRequestProperty("Content-Type", "application/json")
      c.outputStream.use { it.write(body.toString().toByteArray()) }
      val code = c.responseCode
      val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
      val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
      if (code == 401) throw AuthException(json.optString("error", "Wrong upload key."))
      if (code !in 200..299) throw IOException(json.optString("error", "Server error ($code)."))
      return json
    } finally {
      c.disconnect()
    }
  }

  private fun <T> retry(attempts: Int = 4, block: () -> T): T {
    var last: Exception? = null
    repeat(attempts) { n ->
      try { return block() } catch (e: IOException) { last = e; Thread.sleep(1000L shl n) }
    }
    throw last!!
  }

  private fun readFully(input: InputStream, buffer: ByteArray): Int {
    var total = 0
    while (total < buffer.size) {
      val n = input.read(buffer, total, buffer.size - total)
      if (n < 0) break
      total += n
    }
    return total
  }
}
