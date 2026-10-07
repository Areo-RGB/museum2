// Central tuning knobs. Anything a future feature might want to tweak lives here
// rather than being hard-coded inside a module.
export const CONFIG = {
  cache: {
    maxBytes: 96 * 1024 * 1024,
    maxObjectBytes: 12 * 1024 * 1024,
    maxEntries: 64,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  media: {
    manifestUrl: '/media-manifest.json',
    // Manifest keys left out of the museum (the files stay in the bucket).
    hidden: ['2014/VID_20231209_164640.mp4'],
    fallbackUrl: '/media/photo1.jpg',
    // Phone photos are 12+ MP; downscale before upload to the GPU.
    maxTextureSize: 2048,
    loadConcurrency: 4,
    // Nearest video textures loaded at once; every video still gets a frame.
    maxVideos: 6,
    // Textures stream in when the visitor gets this close and are freed beyond
    // the second distance, so a long hall doesn't hold every photo in memory.
    loadDistance: 26,
    unloadDistance: 38,
    // Videos only play while the visitor is this close (metres).
    videoPlayDistance: 13,
  },
  player: {
    speed: 3.4,
    sprintMultiplier: 1.8,
    eyeHeight: 1.65,
    radius: 0.4,
    sensitivity: 0.0021,
  },
  tour: {
    secondsPerStop: 7,
    viewDistance: 3.6,
  },
  render: {
    maxPixelRatio: 2,
    exposure: 1.0,
    fov: 62,
  },
};
