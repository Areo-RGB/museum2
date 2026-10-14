/** Named GPU/media budgets for the Museum2 tablet. High is the default. */
export const QUALITY_PRESETS = {
  high: {
    render: { maxPixelRatio: 2, maxPixels: 4_500_000, antialias: true },
    media: { maxTextureSize: 2048, loadConcurrency: 3, maxVideos: 2, loadDistance: 26, unloadDistance: 38, videoPlayDistance: 11 },
    anisotropy: 8,
  },
  balanced: {
    render: { maxPixelRatio: 1.5, maxPixels: 3_000_000, antialias: true },
    media: { maxTextureSize: 2048, loadConcurrency: 3, maxVideos: 2, loadDistance: 24, unloadDistance: 34, videoPlayDistance: 11 },
    anisotropy: 8,
  },
  performance: {
    render: { maxPixelRatio: 1.25, maxPixels: 1_500_000, antialias: false },
    media: { maxTextureSize: 1024, loadConcurrency: 2, maxVideos: 2, loadDistance: 18, unloadDistance: 28, videoPlayDistance: 9 },
    anisotropy: 4,
  },
};

export const QUALITY_ORDER = ['performance', 'balanced', 'high'];
export const DEFAULT_QUALITY = 'high';
const STORAGE_KEY = 'museum2.quality';

/** Unknown names fall back to the default instead of throwing. */
export function normalizeQuality(name) {
  return QUALITY_PRESETS[name] ? name : DEFAULT_QUALITY;
}

/**
 * Active quality: a `?quality=` URL override wins (and is remembered, so a
 * shared link carries the setting), otherwise the stored choice, else high.
 */
export function getQuality() {
  try {
    const param = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
    if (param && QUALITY_PRESETS[param]) return setQuality(param);
  } catch { /* non-browser environment */ }
  try {
    return normalizeQuality(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch { return DEFAULT_QUALITY; }
}

/** Remember the visitor's choice; returns the normalised name. */
export function setQuality(name) {
  const quality = normalizeQuality(name);
  try { globalThis.localStorage?.setItem(STORAGE_KEY, quality); } catch { /* private mode */ }
  return quality;
}

/** Device profile: the named quality preset plus touch detection for controls. */
export function deviceProfile({ coarsePointer = false, quality = DEFAULT_QUALITY } = {}) {
  const preset = QUALITY_PRESETS[normalizeQuality(quality)];
  return {
    touch: coarsePointer,
    quality: normalizeQuality(quality),
    render: { ...preset.render },
    media: { ...preset.media },
    anisotropy: preset.anisotropy,
  };
}

export function pixelRatio(width, height, dpr, render) {
  return Math.min(dpr, render.maxPixelRatio, Math.sqrt(render.maxPixels / Math.max(1, width * height)));
}
