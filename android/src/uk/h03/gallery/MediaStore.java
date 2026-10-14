package uk.h03.gallery;

import android.content.Context;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Persistent on-device copy of the gallery's media. R2 objects are immutable per
 * key, so once a file is on disk it is served locally (with Range support for
 * video seeking) and never fetched again. preloadAll() mirrors the manifest in
 * the background so later visits never wait on the network.
 */
final class MediaStore {
  private static final String TAG = "MuseumMedia";
  private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");

  private final File dir;
  private final ExecutorService pool = Executors.newFixedThreadPool(3);
  private final Map<String, Object> locks = new ConcurrentHashMap<>();
  private volatile boolean stopped;

  MediaStore(Context ctx) {
    dir = new File(ctx.getFilesDir(), "media");
    dir.mkdirs();
  }

  static boolean cacheable(String url) {
    return (url.startsWith("https://pub-") && url.contains(".r2.dev/"))
        || url.startsWith(MainActivity.SITE + "assets/");
  }

  /** The page and manifest change on deploy: network first, last copy when offline. */
  static boolean revalidated(String url) {
    return url.equals(MainActivity.SITE) || url.equals(MainActivity.SITE + "index.html")
        || url.startsWith(MainActivity.SITE + "media-manifest.json");
  }

  WebResourceResponse intercept(WebResourceRequest req) {
    String url = req.getUrl().toString();
    if (!"GET".equals(req.getMethod())) return null;
    if (revalidated(url)) return networkFirst(url, req.isForMainFrame() ? "text/html" : "application/json");
    if (!cacheable(url)) return null;
    File f = fileFor(url);
    if (!f.exists()) {
      // Videos stream from the network on first view (the preloader fills them in);
      // everything else is small enough to fetch whole and serve from disk.
      if (isVideo(url)) { pool.submit(() -> download(url)); return null; }
      if (!download(url)) return null;
    }
    try {
      return serve(f, mime(url), req.getRequestHeaders());
    } catch (IOException e) {
      Log.w(TAG, "serve failed " + url, e);
      return null;
    }
  }

  void preloadAll(String manifestUrl) {
    pool.submit(() -> {
      // Hashed build output (three.js chunk, app JS/CSS) referenced by the page.
      try {
        Matcher m = Pattern.compile("[\"'](/assets/[^\"']+)").matcher(readUrl(MainActivity.SITE));
        while (m.find()) download(MainActivity.SITE + m.group(1).substring(1));
      } catch (Exception e) {
        Log.w(TAG, "preload shell failed", e);
      }
    });
    pool.submit(() -> {
      try {
        JSONObject manifest = new JSONObject(readUrl(manifestUrl));
        JSONArray assets = manifest.getJSONArray("assets");
        int have = 0;
        for (int i = 0; i < assets.length() && !stopped; i++) {
          JSONObject a = assets.getJSONObject(i);
          String url = a.getString("url");
          long size = a.optLong("sizeBytes", -1);
          File f = fileFor(url);
          if (f.exists() && (size < 0 || f.length() == size)) { have++; continue; }
          if (f.exists()) f.delete();
          pool.submit(() -> download(url));
        }
        Log.i(TAG, "preload: " + have + "/" + assets.length() + " already on disk");
      } catch (Exception e) {
        Log.w(TAG, "preload manifest failed", e);
      }
    });
  }

  private WebResourceResponse networkFirst(String url, String mime) {
    File f = fileFor(url);
    File tmp = new File(dir, f.getName() + ".part");
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(url).openConnection();
      c.setConnectTimeout(6000);
      c.setReadTimeout(15000);
      c.setUseCaches(false);
      if (c.getResponseCode() == 200) {
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
          byte[] buf = new byte[16384];
          for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        }
        tmp.renameTo(f);
      }
    } catch (IOException e) {
      Log.i(TAG, "offline, using stored " + url);
      tmp.delete();
    } finally {
      if (c != null) c.disconnect();
    }
    if (!f.exists()) return null;
    try {
      Map<String, String> h = new HashMap<>();
      h.put("Cache-Control", "no-cache");
      h.put("Access-Control-Allow-Origin", "*");
      return new WebResourceResponse(mime, "UTF-8", 200, "OK", h, new FileInputStream(f));
    } catch (IOException e) {
      return null;
    }
  }

  void shutdown() { stopped = true; pool.shutdownNow(); }

  private boolean download(String url) {
    Object lock = locks.computeIfAbsent(url, k -> new Object());
    synchronized (lock) {
      File f = fileFor(url);
      if (f.exists()) return true;
      File tmp = new File(dir, f.getName() + ".part");
      HttpURLConnection c = null;
      try {
        c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        if (c.getResponseCode() != 200) return false;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
          byte[] buf = new byte[64 * 1024];
          for (int n; (n = in.read(buf)) > 0; ) {
            if (stopped) return false;
            out.write(buf, 0, n);
          }
        }
        long expected = c.getContentLengthLong();
        if (expected >= 0 && tmp.length() != expected) { tmp.delete(); return false; }
        boolean ok = tmp.renameTo(f);
        if (ok) Log.i(TAG, "cached " + f.length() + " B " + url);
        return ok;
      } catch (IOException e) {
        Log.w(TAG, "download failed " + url + ": " + e);
        tmp.delete();
        return false;
      } finally {
        if (c != null) c.disconnect();
      }
    }
  }

  private WebResourceResponse serve(File f, String mime, Map<String, String> reqHeaders) throws IOException {
    long len = f.length();
    Map<String, String> h = new HashMap<>();
    h.put("Access-Control-Allow-Origin", "*");
    h.put("Accept-Ranges", "bytes");
    h.put("Cache-Control", "public, max-age=31536000, immutable");
    String range = null;
    for (Map.Entry<String, String> e : reqHeaders.entrySet()) {
      if (e.getKey().equalsIgnoreCase("Range")) range = e.getValue();
    }
    Matcher m = range == null ? null : RANGE.matcher(range.trim());
    if (m != null && m.matches() && !(m.group(1).isEmpty() && m.group(2).isEmpty())) {
      long start, end;
      if (m.group(1).isEmpty()) { start = Math.max(0, len - Long.parseLong(m.group(2))); end = len - 1; }
      else { start = Long.parseLong(m.group(1)); end = m.group(2).isEmpty() ? len - 1 : Math.min(len - 1, Long.parseLong(m.group(2))); }
      if (start >= len) start = Math.max(0, len - 1);
      RandomAccessFile raf = new RandomAccessFile(f, "r");
      raf.seek(start);
      InputStream body = new BoundedStream(new FileInputStream(raf.getFD()), end - start + 1, raf);
      h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
      h.put("Content-Length", String.valueOf(end - start + 1));
      return new WebResourceResponse(mime, null, 206, "Partial Content", h, body);
    }
    h.put("Content-Length", String.valueOf(len));
    return new WebResourceResponse(mime, null, 200, "OK", h, new BufferedInputStream(new FileInputStream(f), 64 * 1024));
  }

  private File fileFor(String url) {
    try {
      byte[] d = MessageDigest.getInstance("SHA-1").digest(url.getBytes("UTF-8"));
      StringBuilder sb = new StringBuilder();
      for (byte b : d) sb.append(String.format("%02x", b));
      return new File(dir, sb.toString());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static boolean isVideo(String url) { return mime(url).startsWith("video/"); }

  private static String mime(String url) {
    String u = url.toLowerCase();
    int q = u.indexOf('?');
    if (q >= 0) u = u.substring(0, q);
    if (u.endsWith(".mp4") || u.endsWith(".m4v")) return "video/mp4";
    if (u.endsWith(".webm")) return "video/webm";
    if (u.endsWith(".mov")) return "video/quicktime";
    if (u.endsWith(".png")) return "image/png";
    if (u.endsWith(".webp")) return "image/webp";
    if (u.endsWith(".gif")) return "image/gif";
    if (u.endsWith(".svg")) return "image/svg+xml";
    if (u.endsWith(".mp3")) return "audio/mpeg";
    if (u.endsWith(".m4a") || u.endsWith(".aac")) return "audio/mp4";
    if (u.endsWith(".ogg") || u.endsWith(".opus")) return "audio/ogg";
    if (u.endsWith(".json")) return "application/json";
    if (u.endsWith(".js") || u.endsWith(".mjs")) return "text/javascript";
    if (u.endsWith(".css")) return "text/css";
    if (u.endsWith(".woff2")) return "font/woff2";
    if (u.endsWith(".wasm")) return "application/wasm";
    if (u.endsWith(".hdr") || u.endsWith(".bin")) return "application/octet-stream";
    return "image/jpeg";
  }

  private static String readUrl(String url) throws IOException {
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    c.setConnectTimeout(15000);
    try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[16384];
      for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
      return out.toString("UTF-8");
    } finally {
      c.disconnect();
    }
  }

  private static final class BoundedStream extends FilterInputStream {
    private long left;
    private final Closeable owner;
    BoundedStream(InputStream in, long left, Closeable owner) { super(in); this.left = left; this.owner = owner; }
    @Override public int read() throws IOException { if (left <= 0) return -1; int b = super.read(); if (b >= 0) left--; return b; }
    @Override public int read(byte[] b, int off, int len) throws IOException {
      if (left <= 0) return -1;
      int n = super.read(b, off, (int) Math.min(len, left));
      if (n > 0) left -= n;
      return n;
    }
    @Override public void close() throws IOException { super.close(); owner.close(); }
  }
}
