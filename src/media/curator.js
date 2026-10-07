import { createLimiter, loadMedia } from './loader.js';
import { getSlotMedia, saveSlotMedia, deleteSlotMedia } from '../storage/db.js';
import { kindOf } from './library.js';

/**
 * Decides what hangs in each frame and keeps it in sync with storage.
 * Priority per frame: user upload (IndexedDB) → random item from the frame's
 * period → fallback.
 *
 * Assigning is cheap; textures are only loaded while the visitor is within
 * `loadDistance` and freed again beyond `unloadDistance`, so a long hall
 * doesn't hold every photo in GPU memory at once.
 */
export class Curator {
  /**
   * @param {import('../world/frame.js').MediaFrame[]} frames
   * @param {import('./library.js').MediaLibrary} library
   */
  constructor(frames, library, { media, anisotropy, onProgress }) {
    this.frames = frames;
    this.library = library;
    this.options = { ...media, anisotropy };
    this.limit = createLimiter(media.loadConcurrency);
    this.onProgress = onProgress ?? (() => {});
    this.pending = 0;
    this.done = 0;
    this.disposed = false;
  }

  get fallbackItem() {
    return { id: 'fallback', kind: 'image', url: this.options.fallbackUrl, source: 'fallback', title: 'Untitled', subtitle: 'Photograph' };
  }

  /** Initial hang: restore uploads, fill the rest randomly. Textures stream in via update(). */
  async hangAll() {
    const saved = await Promise.all(this.frames.map((f) => getSlotMedia(f.slot.id).catch(() => null)));
    if (this.disposed) return;
    this.frames.forEach((frame, i) => {
      const record = saved[i];
      if (record?.blob) {
        frame.setFit(record.fit);
        frame.assign(uploadItem(frame.slot.id, record.blob, record.type, record.name));
      } else {
        frame.assign(this.drawFor(frame));
      }
    });
  }

  /** Swap every non-upload frame for a fresh random piece. */
  shuffleAll() {
    const frames = this.frames.filter(f => !f.slot.hero && f.item?.source !== 'upload');
    const items = frames.map(f => f.item ?? this.drawFor(f));
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    frames.forEach((f, i) => f.assign(items[i]));
    for (const f of this.frames.filter(f => f.slot.hero && f.item?.source !== 'upload')) {
      f.assign(this.library.draw(i => i.period === f.slot.period) ?? this.fallbackItem);
    }
  }

  /** Swap one frame and load it straight away (the visitor is looking at it). */
  shuffle(frame) {
    const peers = this.frames.filter(f => f !== frame && !f.slot.hero
      && f.item?.source === 'collection' && f.item.id !== frame.item?.id);
    const peer = peers[Math.floor(Math.random() * peers.length)];
    if (peer && !frame.slot.hero && frame.item?.source === 'collection') {
      const previous = frame.item;
      frame.assign(peer.item);
      peer.assign(previous);
    } else if (frame.slot.hero) {
      frame.assign(this.library.draw(i => i.period === frame.slot.period && i.id !== frame.item?.id)
        ?? this.drawFor(frame));
    } else frame.assign(this.drawFor(frame));
    return this.load(frame);
  }

  async upload(frame, file) {
    const kind = kindOf(file.type);
    if (!kind) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
    await saveSlotMedia({ slotId: frame.slot.id, blob: file, type: file.type, fit: frame.fit, name: file.name });
    frame.assign(uploadItem(frame.slot.id, file, file.type, file.name));
    return this.load(frame);
  }

  /** Forget the upload and return the frame to the random collection. */
  async reset(frame) {
    await deleteSlotMedia(frame.slot.id);
    frame.setFit('auto');
    return this.shuffle(frame);
  }

  async setFit(frame, fit) {
    frame.setFit(fit);
    if (frame.item?.source !== 'upload') return;
    const saved = await getSlotMedia(frame.slot.id);
    if (saved) await saveSlotMedia({ ...saved, fit: frame.fit });
  }

  /**
   * Pick a collection item from the frame's period that isn't already hanging
   * and respects the video budget. Slots without a period draw from everything.
   */
  drawFor(frame) {
    const assigned = this.library.byId(frame.slot.itemId);
    if (assigned) return assigned;
    const { period, hero } = frame.slot;
    const hanging = new Set(this.frames.filter((f) => f !== frame).map((f) => f.item?.id));
    const videos = this.frames.filter((f) => f !== frame && f.item?.kind === 'video').length;
    const fits = (c) => (!period || c.period === period)
      && (c.kind !== 'video' || (videos < this.options.maxVideos && !hero));
    return this.library.draw((c) => fits(c) && !hanging.has(c.id))
      // Small periods may have fewer items than frames: allow a repeat rather than a placeholder.
      ?? this.library.draw(fits)
      ?? this.fallbackItem;
  }

  /** Load the frame's current item into a texture. */
  async load(frame, priority = true) {
    if (this.disposed) return;
    const item = frame.item;
    if (!item) return;
    if (item.kind === 'video') {
      if (this.options.maxVideos <= 0) return;
      const active = this.frames.filter(f => f !== frame && f.item?.kind === 'video'
        && (f.state === 'loaded' || f.state === 'loading'));
      if (active.length >= this.options.maxVideos) {
        if (!priority) return;
        if (this.cameraPosition) active.sort((a, b) => b.center.distanceTo(this.cameraPosition) - a.center.distanceTo(this.cameraPosition));
        active[0].unload();
      }
      if (priority) this.preferredFrame = frame;
    }
    const token = frame.beginLoad();
    this.track(+1);
    try {
      const loaded = await this.limit(() => {
        // Skip work that became stale while queued (visitor walked off, item swapped).
        if (this.disposed || token !== frame.loadToken) return null;
        return loadMedia(item, { ...this.options, signal: frame.loadController.signal });
      });
      if (loaded) frame.finishLoad(token, loaded);
    } catch (err) {
      if (this.disposed || token !== frame.loadToken) return;
      console.warn(`[curator] ${item.id} failed to load`, err);
      frame.failLoad(token);
      frame.retryAt = Date.now() + 5000;
    } finally {
      this.track(-1);
    }
  }

  track(delta) {
    if (delta > 0) this.pending++;
    else { this.pending--; this.done++; }
    if (!this.disposed) this.onProgress({ pending: this.pending, done: this.done });
  }

  dispose() {
    this.disposed = true;
    for (const frame of this.frames) frame.unload();
  }

  update(dt, app) {
    if (this.disposed) return;
    const pos = app.camera.position;
    this.cameraPosition = pos;
    const { loadDistance, unloadDistance } = this.options;
    // Nearest frames first so the queue fills in the order the visitor sees things.
    const byDistance = this.frames
      .map((frame) => ({ frame, d: frame.center.distanceTo(pos) }))
      .sort((a, b) => (a.frame === this.preferredFrame ? -1 : b.frame === this.preferredFrame ? 1 : a.d - b.d));
    let videos = 0;
    for (const { frame, d } of byDistance) {
      const allowed = frame.item?.kind !== 'video' || (d < loadDistance && videos++ < this.options.maxVideos);
      if (!allowed) { if (frame.state !== 'idle') frame.unload(); continue; }
      if ((frame.state === 'idle' || (frame.state === 'failed' && Date.now() >= frame.retryAt))
        && frame.item && d < loadDistance) this.load(frame, false);
      else if (frame.state !== 'idle' && d > unloadDistance) frame.unload();
      frame.update(dt, pos, this.options);
    }
  }
}

function uploadItem(slotId, blob, type, name = 'Upload') {
  return {
    id: `upload:${slotId}`, kind: kindOf(type) ?? 'image', blob, source: 'upload',
    title: name.replace(/\.[^.]+$/, ''), subtitle: 'From your collection',
  };
}
