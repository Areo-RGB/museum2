import { CONFIG } from '../config.js';

/** Disk cache for source blobs; decoded canvases and GPU textures remain disposable. */
export class ImageCache {
  constructor({ open, fetcher = (...args) => fetch(...args), now = () => Date.now(), ...limits }) {
    this.open = open;
    this.fetcher = fetcher;
    this.now = now;
    this.limits = limits;
    this.writes = Promise.resolve();
    this.generation = 0;
    this.pendingWrites = 0;
    this.invalidated = new Set();
  }

  async getBlob(url, { signal } = {}) {
    signal?.throwIfAborted();
    url = new URL(url, globalThis.location?.href).href;
    const generation = this.generation;
    const cache = await optionalRead(() => this.open());
    const cached = this.invalidated.has(url) || !cache ? null : await optionalRead(() => cache.match(url));
    signal?.throwIfAborted();
    const cachedAt = Number(cached?.headers.get('x-museum-cached-at') ?? 0);
    if (cached && this.now() - cachedAt < this.limits.maxAgeMs) {
      const blob = await optionalRead(() => cached.clone().blob(), 1000);
      signal?.throwIfAborted();
      if (blob) {
        this.mutate(async () => {
          if (generation !== this.generation || !await cache.match(url)) return;
          const headers = new Headers(cached.headers);
          headers.set('x-museum-used-at', String(this.now()));
          await cache.put(url, new Response(blob, { headers }));
        });
        return blob;
      }
    }
    try {
      const response = await this.fetcher(url, { mode: 'cors', signal, cache: cached ? 'no-cache' : 'default' });
      if (!response.ok) throw Object.assign(new Error(`${response.status} for ${url}`), { status: response.status });
      const blob = await response.blob();
      signal?.throwIfAborted();
      this.invalidated.delete(url);
      if (cache && blob.type.startsWith('image/')) this.store(cache, url, blob, this.now(), generation);
      return blob;
    } catch (error) {
      signal?.throwIfAborted();
      if (error.name === 'AbortError') throw error;
      // Offline/server outages can use stale photos; removals and auth failures cannot.
      if (cached && (!error.status || error.status >= 500)) {
        const blob = await optionalRead(() => cached.blob(), 1000);
        signal?.throwIfAborted();
        if (blob) return blob;
      }
      if (error.status && error.status < 500) {
        this.invalidated.add(url);
        if (cache) this.mutate(() => cache.delete(url), true);
      }
      throw error;
    }
  }

  mutate(task, required = false) {
    // Keep optional disk writes from retaining an unbounded queue of image blobs.
    if (!required && this.pendingWrites >= 4) return Promise.resolve(null);
    this.pendingWrites++;
    const locked = () => globalThis.navigator?.locks
      ? navigator.locks.request('museum-image-cache', { ifAvailable: !required }, lock => lock ? task() : null) : task();
    const next = this.writes.then(() => bestEffort(locked)).finally(() => this.pendingWrites--);
    this.writes = next;
    return next;
  }

  flush() { return this.writes; }

  async invalidate(url) {
    url = new URL(url, globalThis.location?.href).href;
    this.invalidated.add(url);
    const cache = await optionalRead(() => this.open());
    if (cache) return this.mutate(() => cache.delete(url), true);
  }

  store(cache, url, blob, cachedAt, generation) {
    if (blob.size > Math.min(this.limits.maxObjectBytes, this.limits.maxBytes)) return;
    return this.mutate(async () => {
      if (generation !== this.generation) return;
      const headers = { 'Content-Type': blob.type, 'x-museum-bytes': String(blob.size),
        'x-museum-cached-at': String(cachedAt), 'x-museum-used-at': String(this.now()) };
      // Evict first so even a nearly-full browser quota can accept the new photo.
      const entries = [];
      for (const key of await cache.keys()) {
        if (key.url === url) continue;
        const response = await cache.match(key);
        entries.push({ key, bytes: Number(response?.headers.get('x-museum-bytes') ?? 0),
          used: Number(response?.headers.get('x-museum-used-at') ?? 0) });
      }
      entries.sort((a, b) => a.used - b.used);
      let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0) + blob.size;
      while (entries.length && (bytes > this.limits.maxBytes || entries.length + 1 > this.limits.maxEntries)) {
        const entry = entries.shift();
        await cache.delete(entry.key);
        bytes -= entry.bytes;
      }
      if (this.limits.maxEntries > 0) await cache.put(url, new Response(blob, { headers }));
    });
  }

  async clear() {
    this.generation++;
    const cache = await optionalRead(() => this.open());
    if (!cache) return false;
    return this.mutate(async () => { for (const key of await cache.keys()) await cache.delete(key); return true; }, true);
  }
}

async function bestEffort(task) {
  try { return await task(); } catch { return null; }
}

async function optionalRead(task, ms = 150) {
  let timer;
  try { return await Promise.race([bestEffort(task), new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]); }
  finally { clearTimeout(timer); }
}

export const PHOTO_CACHE_NAME = 'museum-photos-v1';
export const photoCache = new ImageCache({ ...CONFIG.cache, open: () => globalThis.caches?.open(PHOTO_CACHE_NAME) });

/** Always revalidate the collection online; only use saved JSON when the network fails. */
export async function loadManifest(url) {
  const cachePromise = bestEffort(() => globalThis.caches?.open('museum-manifest-v1'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(`${response.status} for ${url}`), { status: response.status });
    const manifest = await response.json();
    if (!Array.isArray(manifest.assets)) throw new Error('Invalid media manifest');
    const saved = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    if (saved.size <= 1024 * 1024) cachePromise.then(cache => cache && bestEffort(() => cache.put(url, new Response(saved))));
    return manifest;
  } catch (error) {
    if (!error.status || error.status >= 500) {
      const cache = await optionalRead(() => cachePromise);
      const saved = cache && await optionalRead(async () => (await cache.match(url))?.json(), 1000);
      if (Array.isArray(saved?.assets)) return saved;
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
