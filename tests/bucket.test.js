import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadToBucket } from '../src/media/bucket.js';

const file = { name: 'IMG_20240501_120000.jpg', type: 'image/jpeg', size: 3 };
const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test('asks the Worker to presign, then PUTs the file to R2', async () => {
  let asked, putTo;
  const fetcher = async (url, init) => {
    asked = { url, init };
    return reply(201, { key: 'k', url: 'https://r2/k', uploadUrl: 'https://s3/k?sig', contentType: 'image/jpeg' })();
  };
  const put = async (url, body, type) => { putTo = { url, body, type }; };
  const result = await uploadToBucket(file, { fetcher, put, ask: () => 'secret' });
  assert.deepEqual(result, { key: 'k', url: 'https://r2/k' });
  assert.equal(asked.init.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(asked.init.body), { name: file.name, type: 'image/jpeg', size: 3 });
  assert.deepEqual(putTo, { url: 'https://s3/k?sig', body: file, type: 'image/jpeg' });
});

test('rejects with the server message and without a key', async () => {
  const put = async () => assert.fail('must not upload');
  await assert.rejects(uploadToBucket(file, { fetcher: reply(401, { error: 'Wrong or missing upload key.' }), put, ask: () => 'bad' }), /Wrong/);
  await assert.rejects(uploadToBucket(file, { fetcher: reply(201, {}), put, ask: () => null }), /no upload key/);
});
