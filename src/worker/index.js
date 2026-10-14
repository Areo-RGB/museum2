// Edge entry: the gallery is static assets; this only adds the curator's
// upload endpoint. It checks the upload key and hands back a presigned R2 (S3)
// PUT URL, so the browser sends the file straight to the bucket and large
// videos never pass through the Worker's 100 MB request limit.
import { AwsClient } from 'aws4fetch';
import { publicUrl, targetKey } from '../../scripts/bucket-layout.js';
import { MEDIA_BASE } from '../fame/programme.js';
import { kindOf } from '../media/library.js';

const MAX_BYTES = 5 * 1024 ** 3; // R2's single-PUT limit.
const URL_TTL_SECONDS = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/upload') return sign(request, env);
    return env.ASSETS.fetch(request);
  },
};

async function sign(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!env.UPLOAD_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) {
    return json({ error: 'Wrong or missing upload key.' }, 401);
  }
  const { name: rawName = '', type = '', size = 0 } = await request.json().catch(() => ({}));
  if (!kindOf(type)) return json({ error: `Unsupported file type: ${type || 'unknown'}` }, 415);
  if (!(size > 0) || size > MAX_BYTES) return json({ error: 'Files must be under 5 GB.' }, 413);

  const name = safeName(rawName);
  let key = targetKey(name, type);
  // Never replace an existing object: R2 media is treated as immutable per key.
  for (let n = 1; await env.MEDIA.head(key); n++) {
    key = targetKey(name.replace(/(\.[^.]+)?$/, `-${n}$1`), type);
  }

  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto',
  });
  const target = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`);
  target.searchParams.set('X-Amz-Expires', String(URL_TTL_SECONDS));
  const signed = await r2.sign(new Request(target, { method: 'PUT', headers: { 'Content-Type': type } }), { aws: { signQuery: true } });
  return json({ key, url: publicUrl(MEDIA_BASE, key), uploadUrl: signed.url, contentType: type }, 201);
}

function safeName(name) {
  const base = String(name).split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').slice(-120);
  return base && base !== '.' && base !== '..' ? base : `upload-${Date.now()}`;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
