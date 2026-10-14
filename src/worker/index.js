// Edge entry: the gallery is static assets plus upload endpoints, all behind
// the upload key. Files never pass through the Worker (100 MB body limit):
//   POST /api/upload               presigned single PUT (browser curate panel, up to 5 GB)
//   POST /api/multipart/create     multipart upload + presigned part URLs (tablet app)
//   POST /api/multipart/complete   stitch the uploaded parts into the object
//   POST /api/multipart/abort      drop an unfinished multipart upload
import { AwsClient } from 'aws4fetch';
import { publicUrl, targetKey } from '../../scripts/bucket-layout.js';
import { MEDIA_BASE } from '../fame/programme.js';
import { kindOf } from '../media/library.js';

const MAX_BYTES = 5 * 1024 ** 3; // R2's single-PUT limit.
const URL_TTL_SECONDS = 3600;
const PART_BYTES = 16 * 1024 * 1024; // R2 wants equal parts (except the last), 5 MiB minimum.
const PART_URL_TTL_SECONDS = 12 * 3600;
const MAX_PARTS = 10000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = request.method === 'POST' && ROUTES[url.pathname];
    if (!route) return url.pathname.startsWith('/api/') ? json({ error: 'Not found.' }, 404) : env.ASSETS.fetch(request);
    if (!env.UPLOAD_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.UPLOAD_TOKEN}`) {
      return json({ error: 'Wrong or missing upload key.' }, 401);
    }
    const body = await request.json().catch(() => ({}));
    return route(body, env);
  },
};

const ROUTES = {
  '/api/upload': sign,
  '/api/multipart/create': createMultipart,
  '/api/multipart/complete': completeMultipart,
  '/api/multipart/abort': abortMultipart,
};

/** Validates the file and picks a free key, or returns an error Response. */
async function newKey(env, { name: rawName = '', type = '', size = 0 }, maxBytes) {
  if (!kindOf(type)) return json({ error: `Unsupported file type: ${type || 'unknown'}` }, 415);
  if (!(size > 0) || size > maxBytes) return json({ error: 'File is too large.' }, 413);
  const name = safeName(rawName);
  let key = targetKey(name, type);
  // Never replace an existing object: R2 media is treated as immutable per key.
  for (let n = 1; await env.MEDIA.head(key); n++) {
    key = targetKey(name.replace(/(\.[^.]+)?$/, `-${n}$1`), type);
  }
  return key;
}

async function presign(env, key, params, ttl, headers = {}) {
  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto',
  });
  const target = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  target.searchParams.set('X-Amz-Expires', String(ttl));
  const signed = await r2.sign(new Request(target, { method: 'PUT', headers }), { aws: { signQuery: true } });
  return signed.url;
}

async function sign(body, env) {
  const key = await newKey(env, body, MAX_BYTES);
  if (key instanceof Response) return key;
  const uploadUrl = await presign(env, key, {}, URL_TTL_SECONDS, { 'Content-Type': body.type });
  return json({ key, url: publicUrl(MEDIA_BASE, key), uploadUrl, contentType: body.type }, 201);
}

async function createMultipart(body, env) {
  const key = await newKey(env, body, PART_BYTES * MAX_PARTS);
  if (key instanceof Response) return key;
  const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: body.type } });
  const count = Math.ceil(body.size / PART_BYTES);
  const parts = [];
  for (let partNumber = 1; partNumber <= count; partNumber++) {
    parts.push({ partNumber, url: await presign(env, key, { partNumber: String(partNumber), uploadId: upload.uploadId }, PART_URL_TTL_SECONDS) });
  }
  return json({ key, url: publicUrl(MEDIA_BASE, key), uploadId: upload.uploadId, partSize: PART_BYTES, parts }, 201);
}

async function completeMultipart({ key, uploadId, parts }, env) {
  if (!key || !uploadId || !Array.isArray(parts) || !parts.length) return json({ error: 'Missing key, uploadId or parts.' }, 400);
  const object = await env.MEDIA.resumeMultipartUpload(key, uploadId)
    .complete(parts.map(({ partNumber, etag }) => ({ partNumber: Number(partNumber), etag: String(etag).replaceAll('"', '') })));
  return json({ key, url: publicUrl(MEDIA_BASE, key), size: object.size }, 200);
}

async function abortMultipart({ key, uploadId }, env) {
  if (!key || !uploadId) return json({ error: 'Missing key or uploadId.' }, 400);
  await env.MEDIA.resumeMultipartUpload(key, uploadId).abort();
  return json({ aborted: key }, 200);
}

function safeName(name) {
  const base = String(name).split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').slice(-120);
  return base && base !== '.' && base !== '..' ? base : `upload-${Date.now()}`;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
