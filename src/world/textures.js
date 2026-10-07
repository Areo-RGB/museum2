import * as THREE from 'three';

/** Procedural oak plank floor, tileable horizontally and vertically. */
export function createWoodFloorTexture({ size = 1024, rows = 8, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rowH = size / rows;
  const rand = mulberry32(7);

  for (let r = 0; r < rows; r++) {
    // Each row spans exactly one texture width starting at a random offset;
    // drawing every plank again one width to the left makes the row wrap seamlessly.
    const start = -rand() * size * 0.5;
    for (let x = start; x < start + size;) {
      const len = Math.min(size * (0.32 + rand() * 0.42), start + size - x);
      const color = `hsl(${26 + rand() * 6}, ${20 + rand() * 8}%, ${30 + rand() * 9}%)`;
      const grainSeed = Math.floor(rand() * 2 ** 31);
      for (const ox of [x, x + size]) drawPlank(ctx, ox, r * rowH, len, rowH, color, mulberry32(grainSeed));
      x += len;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

function drawPlank(ctx, x, y, w, h, color, rand) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);

  const seed = rand() * 1000;
  for (let i = 0; i < 22; i++) {
    const gy = y + (i + 0.5) * (h / 22);
    ctx.strokeStyle = `rgba(${50 + rand() * 30}, 30, 12, ${0.04 + rand() * 0.07})`;
    ctx.lineWidth = 0.6 + rand() * 1.6;
    ctx.beginPath();
    for (let gx = x; gx <= x + w; gx += 16) {
      const wobble = Math.sin((gx + seed) * 0.012 + i) * 2.2 + Math.sin((gx + seed * 2) * 0.041) * 0.8;
      gx === x ? ctx.moveTo(gx, gy + wobble) : ctx.lineTo(gx, gy + wobble);
    }
    ctx.stroke();
  }
  // Subtle bevel/seam.
  ctx.strokeStyle = 'rgba(25, 14, 6, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dark patterned cinema carpet. */
export function createCarpetTexture({ size = 512, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b1117';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(3);
  // Fibre noise
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(120,50,60,0.12)';
    ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
  }
  // Small diamond motif
  const step = size / 4;
  ctx.strokeStyle = 'rgba(196, 150, 90, 0.28)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = (x + 0.5) * step, cy = (y + 0.5) * step, r = step * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    ctx.stroke();
  }
  return finishTiling(canvas, anisotropy);
}

/** Vertical folds for velvet curtains. */
export function createVelvetTexture({ width = 512, height = 64, folds = 9 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < width; x++) {
    const shade = 0.55 + 0.45 * Math.sin((x / width) * folds * Math.PI * 2) ** 2;
    ctx.fillStyle = `rgb(${Math.round(120 * shade)}, ${Math.round(16 * shade)}, ${Math.round(28 * shade)})`;
    ctx.fillRect(x, 0, 1, height);
  }
  return finishTiling(canvas, 4);
}

function finishTiling(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}
