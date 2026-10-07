import * as THREE from 'three';

/**
 * A flat sign drawn onto a canvas. `draw(ctx, w, h)` paints it; it is redrawn
 * once web fonts have loaded so serif text doesn't stay in the fallback face.
 */
export function canvasPanel(width, height, draw, { resolution = 1024, lit = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = Math.round(resolution * height / width);
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const paint = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint);
  const material = lit
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, transparent: true })
    : new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.userData.repaint = paint;
  return mesh;
}

/** Single line of text on a solid background (EXIT, CINEMA, ...). */
export function signMesh(text, { width, height, bg, fg, font, spacing = 0.1 }) {
  return canvasPanel(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.letterSpacing = `${spacing}em`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 6);
  }, { lit: false });
}

/**
 * Wall text introducing a period: vinyl-lettering style, no background, so it
 * reads as painted onto the wall.
 * @param {import('../media/library.js').Period} period
 */
export function periodLabel(period, { width = 2.6, height = 1.5, dark = false } = {}) {
  const ink = dark ? '#efe6d6' : '#24211d';
  const muted = dark ? 'rgba(239,230,214,0.65)' : 'rgba(36,33,29,0.6)';
  const accent = '#a8834d';
  return canvasPanel(width, height, (ctx, w, h) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.fillRect(0, h * 0.06, w * 0.08, h * 0.018);
    ctx.fillStyle = muted;
    ctx.font = `500 ${h * 0.065}px Inter, sans-serif`;
    ctx.letterSpacing = '0.2em';
    ctx.fillText(period.range.toUpperCase(), 0, h * 0.2);
    ctx.letterSpacing = '0em';
    ctx.fillStyle = ink;
    ctx.font = `600 ${h * 0.3}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(period.label, -h * 0.01, h * 0.52);
    ctx.fillStyle = muted;
    ctx.font = `italic 500 ${h * 0.1}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(`${period.count} ${period.count === 1 ? 'work' : 'works'} in the collection`, 0, h * 0.72);
  });
}
