import * as THREE from 'three';

// Geometry and materials shared by every frame; per-frame size is applied via scale.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const MOULDING = new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 0.42, metalness: 0.25 });
const MATTE = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.95 });
const PLAQUE_BACK = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.35, metalness: 0.7 });

const BAR = 0.075;
const DEPTH = 0.07;
const PLAQUE_Y = 1.45; // world height of the caption plaque (eye level when standing)
const DIMMED = 0.18;
const FADE_SPEED = 2.5;

export const FIT_MODES = ['auto', 'cover', 'contain'];

/** Largest box with `aspect` that fits inside maxW × maxH. */
function containBox(aspect, maxW, maxH) {
  return aspect > maxW / maxH ? [maxW, maxW / aspect] : [maxH * aspect, maxH];
}

/**
 * A framed artwork: moulding, passe-partout, media surface, caption plaque and
 * picture light. Knows nothing about where its media comes from — the curator
 * drives it through beginLoad()/finishLoad().
 */
export class MediaFrame {
  constructor(slot) {
    this.slot = slot;
    this.fit = 'auto';
    this.item = null;
    this.loaded = null;
    this.loadToken = 0;
    this.brightness = 0;
    this.targetBrightness = DIMMED;

    this.group = new THREE.Group();
    this.group.position.fromArray(slot.position);
    this.group.rotation.y = slot.rotationY;
    this.center = this.group.position.clone();
    this.normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, slot.rotationY);

    this.bars = Array.from({ length: 4 }, () => new THREE.Mesh(UNIT_BOX, MOULDING));
    this.matte = new THREE.Mesh(UNIT_BOX, MATTE);
    this.screen = new THREE.Mesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    this.screen.position.z = 0.031;
    this.matte.position.z = 0.02;

    this.plaque = createPlaque();
    this.plaque.mesh.position.y = PLAQUE_Y - slot.position[1];

    this.light = new THREE.SpotLight(0xffe9c7, slot.hero ? 55 : 32, 9, Math.PI / 7, 0.65, 1.4);
    this.group.add(this.light.target);

    this.group.add(...this.bars, this.matte, this.screen, this.plaque.mesh, this.light);
    this.layout();
  }

  /** Meshes that respond to the crosshair. */
  get hitTargets() { return [this.screen, this.matte, ...this.bars]; }

  get aspect() {
    return this.loaded ? this.loaded.width / this.loaded.height : this.slot.maxWidth / this.slot.maxHeight;
  }

  /** Start swapping to `item`; returns a token that finishLoad() must present. */
  beginLoad(item) {
    this.item = item;
    this.targetBrightness = DIMMED;
    this.plaque.draw(item?.title ?? '', item?.subtitle ?? '');
    return ++this.loadToken;
  }

  /** @param {import('../media/loader.js').LoadedMedia} loaded */
  finishLoad(token, loaded) {
    if (token !== this.loadToken) { loaded.dispose(); return false; }
    this.loaded?.dispose();
    this.loaded = loaded;
    this.screen.material.map = loaded.texture;
    this.screen.material.needsUpdate = true;
    this.brightness = 0;
    this.targetBrightness = 1;
    this.layout();
    return true;
  }

  setFit(fit) {
    this.fit = FIT_MODES.includes(fit) ? fit : 'auto';
    this.layout();
  }

  layout() {
    const { maxWidth: maxW, maxHeight: maxH, hero } = this.slot;
    const aspect = this.aspect;
    const [fitW, fitH] = containBox(aspect, maxW, maxH);
    const [frameW, frameH] = this.fit === 'auto' ? [fitW, fitH] : [maxW, maxH];
    const [picW, picH] = this.fit === 'cover' ? [maxW, maxH] : [fitW, fitH];

    const tex = this.loaded?.texture;
    if (tex) {
      // Cover crops by sampling a centred sub-rectangle of the texture.
      let rx = 1, ry = 1;
      if (this.fit === 'cover') {
        if (aspect > maxW / maxH) rx = (maxW / maxH) / aspect; else ry = aspect / (maxW / maxH);
      }
      tex.repeat.set(rx, ry);
      tex.offset.set((1 - rx) / 2, (1 - ry) / 2);
    }

    const pad = (hero ? 0.26 : 0.2) * Math.min(1, Math.min(frameW, frameH) / 1.6);
    const innerW = frameW + pad * 2, innerH = frameH + pad * 2;
    const outerW = innerW + BAR * 2, outerH = innerH + BAR * 2;

    this.screen.scale.set(picW, picH, 1);
    this.matte.scale.set(innerW, innerH, 0.02);
    const [top, bottom, left, right] = this.bars;
    top.scale.set(outerW, BAR, DEPTH); top.position.set(0, innerH / 2 + BAR / 2, DEPTH / 2);
    bottom.scale.copy(top.scale); bottom.position.set(0, -top.position.y, DEPTH / 2);
    left.scale.set(BAR, innerH, DEPTH); left.position.set(-(innerW / 2 + BAR / 2), 0, DEPTH / 2);
    right.scale.copy(left.scale); right.position.set(-left.position.x, 0, DEPTH / 2);

    this.plaque.mesh.position.x = outerW / 2 + 0.32;
    this.plaque.mesh.position.z = 0.006;

    // Picture light: above and in front, cone just wide enough for the frame.
    this.light.position.set(0, outerH / 2 + 1.4, 1.9);
    const dist = this.light.position.length();
    // Range ends just past the wall so the beam doesn't leak into the next room.
    this.light.distance = dist * 1.35;
    this.light.angle = Math.min(Math.PI / 3, Math.atan((Math.max(outerW, outerH) / 2 + 0.25) / dist));
    this.outerSize = [outerW, outerH];
  }

  update(dt, cameraPosition, { videoPlayDistance }) {
    if (this.brightness !== this.targetBrightness) {
      const step = dt * FADE_SPEED;
      const delta = this.targetBrightness - this.brightness;
      this.brightness = Math.abs(delta) <= step ? this.targetBrightness : this.brightness + Math.sign(delta) * step;
      this.screen.material.color.setScalar(this.brightness * 0.96);
    }

    const video = this.loaded?.video;
    if (video) {
      const toCamera = cameraPosition.clone().sub(this.center);
      const visible = toCamera.dot(this.normal) > 0 && toCamera.length() < videoPlayDistance;
      if (visible && video.paused) video.play().catch(() => {});
      else if (!visible && !video.paused) video.pause();
    }
  }
}

function createPlaque() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
  const mesh = new THREE.Mesh(UNIT_BOX, [PLAQUE_BACK, PLAQUE_BACK, PLAQUE_BACK, PLAQUE_BACK, face, PLAQUE_BACK]);
  mesh.scale.set(0.36, 0.18, 0.012);

  function draw(title, subtitle) {
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1d1b18';
    ctx.font = '600 46px "Cormorant Garamond", Georgia, serif';
    wrapText(ctx, title, 36, 92, canvas.width - 72, 52, 2);
    ctx.fillStyle = '#6f675b';
    ctx.font = 'italic 32px Georgia, serif';
    ctx.fillText(subtitle, 36, 212);
    texture.needsUpdate = true;
  }
  draw('', '');
  return { mesh, draw };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ');
  let line = '', lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      if (++lines >= maxLines) return;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}
