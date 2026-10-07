import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageCache } from '../src/media/cache.js';
import { loadManifest } from '../src/media/cache.js';

class TestCache {
  entries = new Map();
  async match(url) { return this.entries.get(typeof url === 'string' ? url : url.url)?.clone(); }
  async put(url, response) { this.entries.set(typeof url === 'string' ? url : url.url, response.clone()); }
  async delete(url) { return this.entries.delete(typeof url === 'string' ? url : url.url); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}
const url = name => `https://images.example/${name}?cors=1`;
function fixture(overrides = {}) {
  const disk = new TestCache();
  let requests = 0, time = 10;
  const options = { maxBytes: 12, maxEntries: 3, maxObjectBytes: 8, maxAgeMs: 100,
    open: async () => disk, now: () => time,
    fetcher: async () => { requests++; return new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }); }, ...overrides };
  return { disk, options, create: () => new ImageCache(options), get requests() { return requests; }, advance(n) { time += n; } };
}

test('images survive cache instance recreation and avoid a second network request', async () => {
  const f = fixture();
  const cache = f.create();
  assert.equal(await (await cache.getBlob(url('a'))).text(), 'photo');
  await cache.flush();
  assert.equal(await (await f.create().getBlob(url('a'))).text(), 'photo');
  assert.equal(f.requests, 1);
});

test('cache evicts least recently used images within byte and count limits', async () => {
  const f = fixture(), cache = f.create();
  await cache.getBlob(url('a')); await cache.flush(); f.advance(1);
  await cache.getBlob(url('b')); await cache.flush(); f.advance(1);
  await cache.getBlob(url('a')); await cache.flush(); f.advance(1);
  await cache.getBlob(url('c'));
  await cache.flush();
  assert.deepEqual([...f.disk.entries.keys()].sort(), [url('a'), url('c')].sort());
  await cache.getBlob(url('b'));
  assert.equal(f.requests, 4);
});

test('expired photos refresh online and remain usable when offline', async () => {
  const f = fixture();
  await f.create().getBlob(url('a'));
  f.advance(101);
  await f.create().getBlob(url('a'));
  assert.equal(f.requests, 2);
  f.advance(101);
  const offline = new ImageCache({ ...f.options, fetcher: async () => { throw new TypeError('offline'); } });
  assert.equal(await (await offline.getBlob(url('a'))).text(), 'photo');
});

test('storage errors and oversized objects never prevent image loading', async () => {
  const f = fixture({ maxObjectBytes: 2 });
  assert.equal((await f.create().getBlob(url('a'))).size, 5);
  assert.equal(f.disk.entries.size, 0);
  const broken = fixture({ open: async () => { throw new Error('storage denied'); } });
  assert.equal((await broken.create().getBlob(url('a'))).size, 5);
});

test('cancelled loads do not silently return a cached photo', async () => {
  const f = fixture();
  await f.create().getBlob(url('a'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.create().getBlob(url('a'), { signal: controller.signal }), { name: 'AbortError' });
});

test('concurrent downloads stay bounded and clear cancels pending cache writes', async () => {
  const f = fixture(), cache = f.create();
  await Promise.all(['a', 'b', 'c', 'd'].map(name => cache.getBlob(url(name))));
  await cache.flush();
  assert.ok(f.disk.entries.size <= 2);
  let finish;
  cache.fetcher = () => new Promise(resolve => { finish = resolve; });
  const pending = cache.getBlob(url('later'));
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await cache.clear(), true);
  finish(new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }));
  await pending;
  await cache.flush();
  assert.equal(f.disk.entries.size, 0);
});

test('expired missing photos are not served from stale cache', async () => {
  const f = fixture();
  await f.create().getBlob(url('a')); f.advance(101);
  const cache = new ImageCache({ ...f.options, fetcher: async () => new Response('', { status: 404 }) });
  await assert.rejects(cache.getBlob(url('a')), /404/);
  await cache.flush();
  assert.equal(f.disk.entries.size, 0);
});

test('confirmed removals stay removed even while optional cache writes are busy', async () => {
  const f = fixture(), cache = f.create();
  await cache.getBlob(url('a')); await cache.flush(); f.advance(101);
  let release;
  const busy = new Promise(resolve => { release = resolve; });
  for (let i = 0; i < 4; i++) cache.mutate(() => busy);
  try {
    cache.fetcher = async () => new Response('', { status: 404 });
    await assert.rejects(cache.getBlob(url('a')), /404/);
    cache.fetcher = async () => { throw new TypeError('offline'); };
    await assert.rejects(cache.getBlob(url('a')), /offline/);
  } finally { release(); await cache.flush(); }
  assert.equal(f.disk.entries.size, 0);
});

test('decoder invalidation forces a fresh download instead of retrying corrupt cached data', async () => {
  const f = fixture(), cache = f.create();
  await cache.getBlob(url('a')); await cache.flush();
  await cache.invalidate(url('a'));
  await cache.getBlob(url('a')); await cache.flush();
  assert.equal(f.requests, 2);
});

test('pending cache writes cannot block image loads or manifest startup', async () => {
  const disk = new TestCache();
  let finishWrite;
  disk.put = () => new Promise(resolve => { finishWrite = resolve; });
  const cache = fixture({ open: async () => disk }).create();
  const result = await Promise.race([cache.getBlob(url('a')), new Promise(resolve => setTimeout(() => resolve(null), 100))]);
  assert.equal(result?.size, 5, 'image returns without waiting for disk write');
  while (!finishWrite) await new Promise(resolve => setTimeout(resolve, 0));
  finishWrite(); await cache.flush();
  const previousFetch = globalThis.fetch, previousCaches = globalThis.caches;
  globalThis.caches = { open: () => new Promise(() => {}) };
  globalThis.fetch = async () => Response.json({ assets: [] });
  try {
    const manifest = await Promise.race([loadManifest('https://museum.example/manifest.json'), new Promise(resolve => setTimeout(() => resolve(null), 100))]);
    assert.deepEqual(manifest, { assets: [] }, 'manifest returns without waiting for storage readiness');
  } finally { globalThis.fetch = previousFetch; globalThis.caches = previousCaches; }
});

test('manifest stays fresh online and falls back to last valid collection offline', async () => {
  const disk = new TestCache(), previousFetch = globalThis.fetch, previousCaches = globalThis.caches;
  const address = 'https://museum.example/media-manifest.json';
  const manifest = { assets: [{ key: 'photo.jpg' }] };
  globalThis.caches = { open: async () => disk };
  try {
    globalThis.fetch = async () => Response.json(manifest);
    assert.deepEqual(await loadManifest(address), manifest);
    manifest.assets.push({ key: 'new.jpg' });
    assert.equal((await loadManifest(address)).assets.length, 2);
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    assert.equal((await loadManifest(address)).assets.length, 2);
    globalThis.fetch = async () => new Response('broken json');
    assert.equal((await loadManifest(address)).assets.length, 2);
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(loadManifest(address), /404/);
  } finally { globalThis.fetch = previousFetch; globalThis.caches = previousCaches; }
});
