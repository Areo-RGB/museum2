import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadToBucket } from '../src/media/bucket.js';

const file = { name: 'IMG_20240501_120000.jpg', type: 'image/jpeg' };
const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test('uploads with the entered key and returns the R2 url', async () => {
  let seen;
  const fetcher = async (url, init) => { seen = { url, init }; return reply(201, { key: 'k', url: 'https://r2/k' })(); };
  const result = await uploadToBucket(file, { fetcher, ask: () => 'secret' });
  assert.equal(result.url, 'https://r2/k');
  assert.equal(seen.url, '/api/upload?name=IMG_20240501_120000.jpg');
  assert.equal(seen.init.headers.Authorization, 'Bearer secret');
});

test('rejects with the server message and without a key', async () => {
  await assert.rejects(uploadToBucket(file, { fetcher: reply(401, { error: 'Wrong or missing upload key.' }), ask: () => 'bad' }), /Wrong/);
  await assert.rejects(uploadToBucket(file, { fetcher: reply(201, {}), ask: () => null }), /no upload key/);
});
