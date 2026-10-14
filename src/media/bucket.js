// Sends a curator's file to the shared R2 bucket through the site's Worker.
const TOKEN_KEY = 'museum.uploadKey';

function storedKey() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function rememberKey(value) {
  try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/** Uploads `file`; resolves to { key, url } of the new public R2 object. */
export async function uploadToBucket(file, { fetcher = fetch, ask = (msg) => globalThis.prompt?.(msg) } = {}) {
  let key = storedKey();
  if (!key) key = ask('Upload key for the museum bucket:')?.trim();
  if (!key) throw new Error('Upload cancelled: no upload key.');

  const response = await fetcher(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': file.type },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) rememberKey(null);
  if (!response.ok) throw new Error(body.error ?? `Upload failed (${response.status}).`);
  rememberKey(key);
  return body;
}
