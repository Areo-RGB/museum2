import * as THREE from 'three';

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
    task().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

/**
 * Load an image or video into a GPU-ready texture.
 * @param {import('./library.js').MediaItem} item
 * @returns {Promise<LoadedMedia>}
 */
export function loadMedia(item, { maxTextureSize, anisotropy }) {
  return item.kind === 'video'
    ? loadVideo(item)
    : loadImage(item, maxTextureSize, anisotropy);
}

async function loadImage(item, maxSize, anisotropy) {
  const blob = item.blob ?? await fetch(item.url, { mode: 'cors' }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} for ${item.url}`);
    return r.blob();
  });
  // createImageBitmap decodes off the main thread and honours EXIF orientation.
  const bitmap = await createImageBitmap(blob);
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

function loadVideo(item) {
  const video = document.createElement('video');
  const objectUrl = item.blob ? URL.createObjectURL(item.blob) : null;
  if (!objectUrl) video.crossOrigin = 'anonymous';
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' });
  video.src = objectUrl ?? item.url;

  return new Promise((resolve, reject) => {
    const fail = () => { cleanup(); reject(new Error(`video failed: ${item.id}`)); };
    const ready = () => {
      video.removeEventListener('error', fail);
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      resolve({
        texture, video, width: video.videoWidth, height: video.videoHeight,
        dispose() { texture.dispose(); cleanup(); },
      });
    };
    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}
