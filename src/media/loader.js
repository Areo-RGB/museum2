import * as THREE from 'three';
import { photoCache } from './cache.js';

/**
 * @typedef {Object} LoadedMedia
 * @property {THREE.Texture} texture
 * @property {number} width
 * @property {number} height
 * @property {HTMLVideoElement|null} video
 * @property {() => void} dispose
 */

/** Run at most `n` async tasks at a time. */
export function createLimiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

/**
 * Load an image or video into a GPU-ready texture.
 * @param {import('./library.js').MediaItem} item
 * @returns {Promise<LoadedMedia>}
 */
export function loadMedia(item, { maxTextureSize, anisotropy, signal }) {
  return item.kind === 'video'
    ? loadVideo(item, signal)
    : loadImage(item, maxTextureSize, anisotropy, signal);
}

async function loadImage(item, maxSize, anisotropy, signal) {
  const blob = item.blob ?? await photoCache.getBlob(item.url, { signal });
  // createImageBitmap decodes off the main thread and honours EXIF orientation.
  let bitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch (error) {
    // A truncated/corrupt download must retry the network instead of staying cached.
    if (!item.blob) photoCache.invalidate(item.url);
    throw error;
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return {
    texture, video: null, width: canvas.width, height: canvas.height,
    dispose() { texture.dispose(); canvas.width = canvas.height = 0; },
  };
}

function loadVideo(item, signal) {
  const video = document.createElement('video');
  const objectUrl = item.blob ? URL.createObjectURL(item.blob) : null;
  if (!objectUrl) video.crossOrigin = 'anonymous';
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' });
  video.src = objectUrl ?? item.url;

  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Media load cancelled', 'AbortError')); };
    const fail = () => { cleanup(); reject(new Error(`video failed: ${item.id}`)); };
    const ready = () => {
      video.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort);
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      // VideoTexture only refreshes while playing; distant videos stay paused, so
      // upload a poster frame now (a moment in, past any black lead-in).
      texture.needsUpdate = true;
      video.addEventListener('seeked', () => { texture.needsUpdate = true; }, { once: true });
      video.currentTime = Math.min(1, (video.duration || 0) / 10);
      resolve({
        texture, video, width: video.videoWidth, height: video.videoHeight,
        dispose() { texture.dispose(); cleanup(); },
      });
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', fail);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
