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
  if (item.kind === 'text') return loadText(item, anisotropy);
  return item.kind === 'video'
    ? loadVideo(item, signal)
    : loadImage(item, maxTextureSize, anisotropy, signal);
}

/** A name lettered in gold on navy, drawn once the display serif has loaded. */
async function loadText(item, anisotropy) {
  const font = `italic 600 300px "Cormorant Garamond", Georgia, serif`;
  await document.fonts?.load(font).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = 1500;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
  glow.addColorStop(0, '#1d3a66');
  glow.addColorStop(1, '#0b1a33');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d8b56a';
  ctx.font = font;
  ctx.fillText(item.text, w / 2, h * 0.47);
  ctx.fillRect(w * 0.32, h * 0.7, w * 0.36, 5);
  ctx.font = '60px Georgia, serif';
  for (const x of [w * 0.26, w * 0.74]) ctx.fillText('★', x, h * 0.7);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return {
    texture, video: null, width: w, height: h,
    dispose() { texture.dispose(); canvas.width = canvas.height = 0; },
  };
}

async function loadImage(item, maxSize, anisotropy, signal) {
  const blob = item.blob ?? await photoCache.getBlob(item.url, { signal });
  // Probe the container header for the decoded dimensions first, so a 12+ MP
  // phone photo can be downscaled during decode instead of materialising as a
  // full-size bitmap and only then shrinking to `maxSize` on a canvas.
  const probed = await probeImageSize(blob).catch(() => null);
  const downscale = probed && Math.max(probed.width, probed.height) > maxSize
    ? {
        width: Math.max(1, Math.round(probed.width * maxSize / Math.max(probed.width, probed.height))),
        height: Math.max(1, Math.round(probed.height * maxSize / Math.max(probed.width, probed.height))),
      }
    : null;
  // createImageBitmap decodes off the main thread and honours EXIF orientation.
  let bitmap;
  try {
    if (downscale) {
      try {
        bitmap = await createImageBitmap(blob, {
          resizeWidth: downscale.width,
          resizeHeight: downscale.height,
          resizeQuality: 'high',
          imageOrientation: 'from-image',
        });
      } catch {
        // Older browsers throw on the resize options; fall back to a full
        // decode and shrink on the canvas below.
        bitmap = await createImageBitmap(blob);
      }
    } else {
      bitmap = await createImageBitmap(blob);
    }
  }
  catch (error) {
    // A truncated/corrupt download must retry the network instead of staying cached.
    if (!item.blob) photoCache.invalidate(item.url);
    throw error;
  }
  // The resize decode is exact on supporting browsers, but keep the canvas
  // step: it covers the fallback path and any rounding the decoder applied.
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

/**
 * Read the decoded pixel dimensions from the first bytes of an image blob,
 * without decoding the pixels. Returns `{ width, height }` as
 * `createImageBitmap` would report them (i.e. EXIF orientation applied), or
 * `null` when the format is unrecognised — callers then fall back to a full
 * decode. Covers the phone-camera formats: JPEG, PNG, GIF, WebP and BMP.
 * Long-term fix: serve pre-sized variants from R2 so the client never
 * downloads 12 MP to display 1024 px.
 * @param {Blob} blob
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export async function probeImageSize(blob) {
  if (!blob || blob.size < 12) return null;
  const buffer = await blob.slice(0, 131072).arrayBuffer();
  const view = new DataView(buffer);
  const ascii = (at, len) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
    return s;
  };
  const need = (n) => view.byteLength >= n;
  // PNG: 8-byte signature, then IHDR width/height as big-endian uint32.
  if (need(24) && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    const width = view.getUint32(16), height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // GIF: "GIF87a"/"GIF89a", then width/height as little-endian uint16.
  if (need(10) && ascii(0, 3) === 'GIF') {
    const width = view.getUint16(6, true), height = view.getUint16(8, true);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // BMP: "BM", then width/height as little-endian int32.
  if (need(26) && ascii(0, 2) === 'BM') {
    const width = view.getInt32(18, true), height = Math.abs(view.getInt32(22, true));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // WebP: "RIFF" … "WEBP", then a VP8 / VP8L / VP8X chunk.
  if (need(12) && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const size = probeWebP(view, ascii);
    if (size) return size;
    return null;
  }
  // JPEG: SOI marker, then segment scan for a start-of-frame marker.
  if (need(2) && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
    return probeJpeg(view);
  }
  return null;
}

function probeWebP(view, ascii) {
  if (view.byteLength < 20) return null;
  const fourCC = ascii(12, 4);
  const u16 = (at) => view.byteLength >= at + 2 ? view.getUint16(at, true) : 0;
  const u24 = (at) => view.byteLength >= at + 3
    ? view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16)
    : 0;
  if (fourCC === 'VP8X') {
    const width = u24(24) + 1, height = u24(27) + 1;
    return width > 1 && height > 1 ? { width, height } : null;
  }
  if (fourCC === 'VP8 ') {
    // Lossy bitstream: 3-byte frame tag + 0x9d012a start code, then 14-bit dims.
    if (view.byteLength < 30) return null;
    const width = u16(26) & 0x3fff, height = u16(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourCC === 'VP8L') {
    if (view.byteLength < 25 || view.getUint8(20) !== 0x2f) return null;
    const b0 = view.getUint8(21), b1 = view.getUint8(22), b2 = view.getUint8(23), b3 = view.getUint8(24);
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function probeJpeg(view) {
  const end = view.byteLength;
  const isSOF = (m) => (m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf);
  const segments = [];
  let offset = 2;
  while (offset + 4 <= end) {
    if (view.getUint8(offset) !== 0xff) { offset++; continue; }
    const marker = view.getUint8(offset + 1);
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > end) break;
    segments.push({ marker, at: offset + 2, length });
    offset += 2 + length;
    // Headers fit in the 128 KB probe; stop once both APP1 and SOF are seen.
    if (segments.some((s) => s.marker === 0xe1) && segments.some((s) => isSOF(s.marker))) break;
  }
  let swap = false;
  for (const { marker, at, length } of segments) {
    // APP1 data starts after the 2-byte length field.
    if (marker === 0xe1 && exifNeedsSwap(view, at + 2, length - 2)) { swap = true; break; }
  }
  for (const { marker, at } of segments) {
    if (!isSOF(marker)) continue;
    if (view.byteLength < at + 7) return null;
    const height = view.getUint16(at + 3), width = view.getUint16(at + 5);
    if (!width || !height) return null;
    // The decoder applies EXIF orientation, so report the output dims.
    return swap ? { width: height, height: width } : { width, height };
  }
  return null;
}

/** True when the JPEG APP1 EXIF orientation rotates the image 90° (values 5-8). */
function exifNeedsSwap(view, at, length) {
  // Minimal EXIF parse: "Exif\0\0" + TIFF header + IFD0 tag 0x0112.
  if (length < 14 || view.byteLength < at + 14) return false;
  if (view.getUint32(at) !== 0x45786966 || view.getUint16(at + 4) !== 0x0000) return false;
  const tiff = at + 6;
  const order = view.byteLength >= tiff + 2 ? (view.getUint16(tiff) === 0x4949 ? true : view.getUint16(tiff) === 0x4d4d ? false : null) : null;
  if (order === null) return false;
  const get16 = (p) => view.byteLength >= p + 2
    ? (order ? view.getUint16(p, true) : view.getUint16(p, false)) : 0;
  const get32 = (p) => view.byteLength >= p + 4
    ? (order ? view.getUint32(p, true) : view.getUint32(p, false)) : 0;
  const ifdOffset = get32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifdOffset < 8 || view.byteLength < ifd + 2) return false;
  const entries = get16(ifd);
  if (entries <= 0 || entries > 64 || view.byteLength < ifd + 2 + entries * 12) return false;
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (get16(entry) === 0x0112) {
      const orientation = get16(entry + 8);
      return orientation >= 5 && orientation <= 8;
    }
  }
  return false;
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
