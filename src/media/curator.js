import { createLimiter, loadMedia } from './loader.js';
import { getSlotMedia, saveSlotMedia, deleteSlotMedia } from '../storage/db.js';
import { kindOf } from './library.js';

/**
 * Decides what hangs in each frame and keeps it in sync with storage.
 * Priority per frame: user upload (IndexedDB) → random collection item → fallback.
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
  }

  get fallbackItem() {
    return { id: 'fallback', kind: 'image', url: this.options.fallbackUrl, source: 'fallback', title: 'Untitled', subtitle: 'Photograph' };
  }

  /** Initial hang: restore uploads, fill the rest randomly. */
  async hangAll() {
    await Promise.all(this.frames.map(async (frame) => {
      const saved = await getSlotMedia(frame.slot.id).catch(() => null);
      if (saved?.blob) {
        frame.setFit(saved.fit);
        return this.show(frame, uploadItem(frame.slot.id, saved.blob, saved.type, saved.name));
      }
      return this.show(frame, this.drawFor(frame));
    }));
  }

  /** Swap every non-upload frame for a fresh random piece. */
  shuffleAll() {
    return Promise.all(this.frames.filter((f) => f.item?.source !== 'upload').map((f) => this.shuffle(f)));
  }

  shuffle(frame) {
    return this.show(frame, this.drawFor(frame));
  }

  async upload(frame, file) {
    const kind = kindOf(file.type);
    if (!kind) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
    await saveSlotMedia({ slotId: frame.slot.id, blob: file, type: file.type, fit: frame.fit, name: file.name });
    return this.show(frame, uploadItem(frame.slot.id, file, file.type, file.name));
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

  /** Pick a collection item that isn't already hanging and respects the video budget. */
  drawFor(frame) {
    const hanging = new Set(this.frames.filter((f) => f !== frame).map((f) => f.item?.id));
    const videos = this.frames.filter((f) => f !== frame && f.item?.kind === 'video').length;
    const item = this.library.draw((candidate) => !hanging.has(candidate.id)
      && (candidate.kind !== 'video' || videos < this.options.maxVideos)
      // Keep the hero wall for stills — it's the first thing visitors see.
      && !(frame.slot.hero && candidate.kind === 'video'));
    return item ?? this.fallbackItem;
  }

  async show(frame, item) {
    const token = frame.beginLoad(item);
    this.track(+1);
    try {
      const loaded = await this.limit(() => loadMedia(item, this.options));
      frame.finishLoad(token, loaded);
    } catch (err) {
      console.warn(`[curator] ${item.id} failed to load`, err);
      if (item.source !== 'fallback' && frame.loadToken === token) {
        // Try once more with something else so no frame stays dark.
        const retry = item.source === 'collection' ? this.drawFor(frame) : this.fallbackItem;
        await this.show(frame, retry.id === item.id ? this.fallbackItem : retry);
      }
    } finally {
      this.track(-1);
    }
  }

  track(delta) {
    if (delta > 0) this.pending++;
    else { this.pending--; this.done++; }
    this.onProgress({ pending: this.pending, done: this.done });
  }

  update(dt, app) {
    for (const frame of this.frames) frame.update(dt, app.camera.position, this.options);
  }
}

function uploadItem(slotId, blob, type, name = 'Upload') {
  return {
    id: `upload:${slotId}`, kind: kindOf(type) ?? 'image', blob, source: 'upload',
    title: name.replace(/\.[^.]+$/, ''), subtitle: 'From your collection',
  };
}
