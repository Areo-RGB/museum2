// Edge entry: the gallery is static assets; this only adds the curator's
// upload endpoint, which files a visitor's media into the R2 bucket.
import { publicUrl, targetKey } from '../../scripts/bucket-layout.js';
import { MEDIA_BASE } from '../fame/programme.js';
import { kindOf } from '../media/library.js';

const MAX_BYTES = 95 * 1024 * 1024; // Workers cap request bodies at 100 MB.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/upload') return upload(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function upload(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!env.UPLOAD_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) {
    return json({ error: 'Wrong or missing upload key.' }, 401);
  }
  const type = request.headers.get('Content-Type') ?? '';
  if (!kindOf(type)) return json({ error: `Unsupported file type: ${type || 'unknown'}` }, 415);
  const size = Number(request.headers.get('Content-Length'));
  if (!size || size > MAX_BYTES) return json({ error: 'Files must be under 95 MB.' }, 413);

  const name = safeName(url.searchParams.get('name') ?? '');
  let key = targetKey(name, type);
  // Never replace an existing object: R2 media is treated as immutable per key.
  for (let n = 1; await env.MEDIA.head(key); n++) {
    key = targetKey(name.replace(/(\.[^.]+)?$/, `-${n}$1`), type);
  }
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
  return json({ key, url: publicUrl(MEDIA_BASE, key) }, 201);
}

function safeName(name) {
  const base = name.split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').slice(-120);
  return base && base !== '.' && base !== '..' ? base : `upload-${Date.now()}`;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
