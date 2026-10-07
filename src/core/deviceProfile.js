/** Conservative GPU/media budgets; no user-agent sniffing or collection changes. */
export function deviceProfile({ coarsePointer = false, width = 1280, deviceMemory = 8, saveData = false } = {}) {
  const touch = coarsePointer;
  const constrained = touch || width <= 700 || deviceMemory <= 4 || saveData;
  return {
    touch,
    render: { maxPixelRatio: constrained ? 1.25 : 2, maxPixels: constrained ? 1_500_000 : 3_000_000, antialias: !constrained },
    media: constrained ? { maxTextureSize: 1024, loadConcurrency: 2, maxVideos: 2, loadDistance: 18, unloadDistance: 28, videoPlayDistance: 9 } : {},
    anisotropy: constrained ? 4 : 8,
  };
}

export function pixelRatio(width, height, dpr, render) {
  return Math.min(dpr, render.maxPixelRatio, Math.sqrt(render.maxPixels / Math.max(1, width * height)));
}
