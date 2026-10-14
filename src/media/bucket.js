// Sends a curator's file to the shared R2 bucket: the Worker checks the upload
// key and presigns an S3 PUT, then the file goes straight to R2.
const TOKEN_KEY = 'museum.uploadKey';

function storedKey() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function rememberKey(value) {
  try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/** PUT with upload progress (fetch can't report it). */
function xhrPut(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload to the bucket failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload to the bucket failed (network).'));
    xhr.send(file);
  });
}

/** Uploads `file`; resolves to { key, url } of the new public R2 object. */
export async function uploadToBucket(file, {
  fetcher = fetch, put = xhrPut, onProgress, ask = (msg) => globalThis.prompt?.(msg),
} = {}) {
  let key = storedKey();
  if (!key) key = ask('Upload key for the museum bucket:')?.trim();
  if (!key) throw new Error('Upload cancelled: no upload key.');

  const response = await fetcher('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) rememberKey(null);
  if (!response.ok) throw new Error(body.error ?? `Upload failed (${response.status}).`);
  rememberKey(key);

  await put(body.uploadUrl, file, body.contentType, onProgress);
  return { key: body.key, url: body.url };
}
