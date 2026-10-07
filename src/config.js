// Central tuning knobs. Anything a future feature might want to tweak lives here
// rather than being hard-coded inside a module.
export const CONFIG = {
  media: {
    manifestUrl: '/media-manifest.json',
    fallbackUrl: '/media/photo1.jpg',
    // Phone photos are 12+ MP; downscale before upload to the GPU.
    maxTextureSize: 2048,
    loadConcurrency: 4,
    // Keep the number of simultaneously streaming videos sane.
    maxVideos: 3,
    // Videos only play while the visitor is this close (metres).
    videoPlayDistance: 13,
  },
  player: {
    speed: 3.4,
    sprintMultiplier: 1.8,
    eyeHeight: 1.65,
    radius: 0.4,
    sensitivity: 0.0021,
    start: { position: [0, 1.65, 9.2], yaw: 0 },
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
