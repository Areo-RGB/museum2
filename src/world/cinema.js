import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CINEMA, SEATS, DOOR, ROOM } from './layout.js';
import { createCarpetTexture, createVelvetTexture } from './textures.js';
import { GeneratedFilm, VideoFilm } from '../cinema/films.js';
import { YouTubeFilm } from '../cinema/youtube.js';
import { disposeTree } from './environment.js';
import { signMesh } from './signage.js';

const B = CINEMA.bounds;
const FACE = ROOM.wall / 2;
const H = CINEMA.height;
const SCREEN = CINEMA.screen;
const SCREEN_Z = B.maxZ - FACE - 0.03;
const BACK_Z = B.minZ + FACE; // cinema side of the shared wall
const SEATED_EYE = 1.12;

const PALETTE = {
  ceiling: 0x0d0b0c,
  panel: 0x3a1a20,
  trim: 0x1a1311,
  seatFabric: 0x7d1d27,
  seatFrame: 0x161213,
  warm: 0xffb36b,
};

/**
 * The cinema hall: architecture, seating, projector and the film currently on
 * screen. Built in CINEMA's local coordinates and placed in the world by
 * `placement` (from the layout). UI talks to it through project()/stop()/
 * togglePause()/setVolume() and listens via `onChange`.
 */
export class CinemaHall {
  /**
   * @param {{ position: number[], rotationY: number }} placement
   * @param {{ setAmbient(factor: number): void }} hooks
   */
  constructor(app, placement, { setAmbient }) {
    this.app = app;
    this.setAmbient = setAmbient;
    this.onChange = () => {};
    this.group = new THREE.Group();
    this.group.name = 'cinema';
    this.group.position.fromArray(placement.position);
    this.group.rotation.y = placement.rotationY;
    this.group.updateMatrixWorld();
    this._local = new THREE.Vector3();

    this.film = null;
    this.nowPlaying = null;
    this.volume = 0.8;
    this.loadToken = 0;
    this.houseLights = 1;
    this.ambient = 1;
    this.beam = 0;
    this.glowColor = new THREE.Color(0.6, 0.5, 0.5);
    this.glowTarget = this.glowColor.clone();
    this.glowLevel = 0.3;
    this.glowLevelTarget = 0.3;
    this.sampleTimer = 0;
    this.sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    this.sampler.canvas.width = this.sampler.canvas.height = 8;

    this.buildShell(app);
    this.buildStage();
    this.buildScreen();
    this.buildSeats();
    this.buildProjector();
    this.buildSigns();

    this.idleFilm = new GeneratedFilm('idle', { width: 1680, height: 720 });
    this.idleFilm.play();
    this.showOnScreen(this.idleFilm);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get activeFilm() { return this.film ?? this.idleFilm; }
  get isPlaying() { return !!this.film && !this.film.paused; }

  /** Is a world-space point inside the hall? */
  contains(p) {
    const l = this.group.worldToLocal(this._local.copy(p));
    return l.x > B.minX && l.x < B.maxX && l.z > B.minZ && l.z < B.maxZ;
  }

  /** @param {import('../cinema/programme.js').Film} entry */
  async project(entry) {
    const token = ++this.loadToken;
    this.loading = entry;
    this.onChange();
    try {
      if (entry.source.type === 'youtube') {
        this.disposeFilm();
        const film = new YouTubeFilm(entry.source.videoId, document.getElementById('youtubePlayer'), () => this.onChange());
        this.film = film;
        this.nowPlaying = entry;
        film.setVolume(this.volume);
        this.onChange();
        await film.ready;
        if (token !== this.loadToken) return;
        if (document.hidden) this.resumeFilm = film;
        else await film.play();
        return;
      }
      const film = entry.source.type === 'video'
        ? await VideoFilm.load(entry.source.url, { listener: this.ensureListener(), speaker: this.speaker })
        : new GeneratedFilm(entry.source.generator);
      if (token !== this.loadToken) { film.dispose(); return; }
      this.disposeFilm();
      this.film = film;
      this.nowPlaying = entry;
      film.setVolume(this.volume);
      this.showOnScreen(film);
      // Autoplay with sound can be refused if the click was too long ago;
      // the film then waits paused for the play button.
      if (document.hidden) this.resumeFilm = film;
      else await film.play().catch((err) => console.warn('[cinema] playback blocked', err));
    } catch (error) {
      if (token !== this.loadToken) return;
      if (this.film instanceof YouTubeFilm) this.film.status = error.message;
      throw error;
    } finally {
      if (token === this.loadToken) this.loading = null;
      this.onChange();
    }
  }

  stop() {
    this.loadToken++;
    this.loading = null;
    this.disposeFilm();
    this.showOnScreen(this.idleFilm);
    this.onChange();
  }

  async togglePause() {
    if (!this.film) return;
    if (this.film.paused) await this.film.play(); else this.film.pause();
    this.onChange();
  }

  setVolume(v) {
    this.volume = v;
    this.film?.setVolume(v);
  }

  /** Register clickable things with the interaction system. */
  registerInteractions(interactions, { onScreen, onSeat }) {
    interactions.add([this.surface, this.letterbox], {
      maxDistance: 30,
      caption: () => this.nowPlaying
        ? { title: this.nowPlaying.title, subtitle: 'Now showing · click for the programme' }
        : { title: 'The Little Cinema', subtitle: 'Click to choose a film' },
      activate: onScreen,
    });
    interactions.add(this.seatMeshes, {
      maxDistance: 6,
      caption: () => ({ title: 'Take a seat', subtitle: 'Click to sit · move to stand up' }),
      activate: (hit) => {
        const seat = SEATS[hit.instanceId];
        if (!seat) return;
        const position = this.group.localToWorld(new THREE.Vector3(seat.x, SEATED_EYE, seat.z - 0.08));
        // Camera yaw 0 looks down -z; face the screen (local +z).
        onSeat({ position, yaw: this.group.rotation.y + Math.PI });
      },
    });
  }

  update(dt, app) {
    const inside = this.contains(app.camera.position);
    // The idle projector is behind a wall: don't redraw its large canvas from the gallery.
    if (this.film || inside) {
      this.activeFilm.update(dt);
      this.updateGlow(dt);
    }

    const dimmed = this.isPlaying;
    this.houseLights = approach(this.houseLights, dimmed ? 0.1 : 1, dt * 0.7);
    for (const { light, base } of this.sconces) light.intensity = base * this.houseLights;
    this.sconceMaterial.emissiveIntensity = 0.2 + 1.8 * this.houseLights;
    this.stageLed.material.color.setScalar(0.25 + 0.75 * this.houseLights);

    // Only dim the building's ambient light while the visitor is in here.
    this.ambient = approach(this.ambient, inside ? 0.2 + 0.8 * this.houseLights : 1, dt * 1.2);
    this.setAmbient(this.ambient);

    this.beam = approach(this.beam, dimmed ? 1 : 0, dt * 1.5);
    this.beamMesh.visible = this.beam > 0.01;
    this.beamMesh.material.opacity = this.beam * 0.22;
    this.beamMesh.material.color.copy(this.glowColor);
    this.projectorLens.material.color.copy(this.glowColor).multiplyScalar(0.4 + this.beam);
  }

  onVisibilityChange(visible) {
    if (!visible) {
      this.resumeFilm = this.activeFilm.paused ? null : this.activeFilm;
      this.activeFilm.pause();
    } else {
      if (this.resumeFilm === this.activeFilm) this.resumeFilm.play().catch(() => {});
      this.resumeFilm = null;
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  dispose() {
    this.stop();
    this.idleFilm.dispose();
    this.listener?.removeFromParent();
    disposeTree(this.group);
    this.setAmbient(1);
  }

  ensureListener() {
    if (!this.listener) {
      this.listener = new THREE.AudioListener();
      this.app.camera.add(this.listener);
    }
    return this.listener;
  }

  disposeFilm() {
    this.film?.dispose();
    this.film = null;
    this.nowPlaying = null;
  }

  showOnScreen(film) {
    const mat = this.surface.material;
    mat.map = film.texture;
    mat.needsUpdate = true;
    // Contain-fit inside the screen; the letterbox fills the rest.
    const aspect = film.width / film.height;
    const screenAspect = SCREEN.width / SCREEN.height;
    const [w, h] = aspect > screenAspect
      ? [SCREEN.width, SCREEN.width / aspect]
      : [SCREEN.height * aspect, SCREEN.height];
    this.surface.scale.set(w, h, 1);
  }

  /** Average the picture every few frames so the room is lit by what's on screen. */
  updateGlow(dt) {
    this.sampleTimer -= dt;
    if (this.sampleTimer <= 0) {
      this.sampleTimer = 0.15;
      try {
        this.sampler.drawImage((this.activeFilm.sampleSource ?? this.idleFilm.sampleSource), 0, 0, 8, 8);
        const data = this.sampler.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        const n = data.length / 4 * 255;
        this.glowTarget.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
        this.glowLevelTarget = Math.max(0.05, (r + g + b) / (3 * n));
      } catch { /* video frame not ready yet */ }
    }
    const k = 1 - Math.exp(-dt * 6);
    this.glowColor.lerp(this.glowTarget, k);
    this.glowLevel += (this.glowLevelTarget - this.glowLevel) * k;
    const base = this.isPlaying ? 14 : 3;
    this.screenLight.color.copy(this.glowColor);
    this.screenLight.intensity = base * this.glowLevel;
  }

  buildShell(app) {
    const width = B.maxX - B.minX, depth = B.maxZ - B.minZ;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;

    const carpet = createCarpetTexture({ anisotropy: app.maxAnisotropy });
    carpet.repeat.set(width / 1.6, depth / 1.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, H, cz);
    this.group.add(floor, ceiling);

    // Fibre-optic "starry sky" ceiling.
    const stars = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      stars.set([B.minX + 0.4 + Math.random() * (width - 0.8), H - 0.02, B.minZ + 0.4 + Math.random() * (depth - 0.8)], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.035 })));

    // Acoustic fabric panels lining the walls.
    const panelMat = new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 1 });
    const panelGeo = new THREE.BoxGeometry(1, 1, 1);
    const addPanel = (x, z, w, d) => {
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.scale.set(w, 3.6, d);
      panel.position.set(x, 2.3, z);
      this.group.add(panel);
    };
    for (let z = B.minZ + 1.2; z < B.maxZ - 1.6; z += 2) {
      addPanel(B.minX + FACE + 0.03, z, 0.06, 1.7);
      addPanel(B.maxX - FACE - 0.03, z, 0.06, 1.7);
    }
    for (const x of [-6, -4, -2, 2, 4, 6]) addPanel(x, BACK_Z + 0.03, 1.7, 0.06);

    // Wall sconces in the gaps between panels.
    this.sconceMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1c14, emissive: PALETTE.warm, emissiveIntensity: 2 });
    const sconceGeo = new THREE.CylinderGeometry(0.13, 0.08, 0.38, 16, 1, false, 0, Math.PI);
    this.sconces = [];
    for (const z of [B.minZ + 4.2, B.minZ + 10.2]) {
      for (const side of [-1, 1]) {
        const wallX = side < 0 ? B.minX + FACE : B.maxX - FACE;
        const sconce = new THREE.Mesh(sconceGeo, this.sconceMaterial);
        sconce.position.set(wallX, 2.9, z);
        sconce.rotation.y = side < 0 ? 0 : Math.PI;
        const light = new THREE.PointLight(PALETTE.warm, 2.2, 5.5, 2);
        light.position.set(wallX - side * 0.35, 3.0, z);
        this.sconces.push({ light, base: light.intensity });
        this.group.add(sconce, light);
      }
    }
  }

  buildStage() {
    const { depth, height } = CINEMA.stage;
    const width = B.maxX - B.minX;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.55 }));
    stage.position.set(0, height / 2, B.maxZ - depth / 2);
    this.stageLed = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: PALETTE.warm }));
    this.stageLed.position.set(0, height - 0.03, B.maxZ - depth - 0.01);
    this.group.add(stage, this.stageLed);

    // Velvet drapes either side of the screen and a valance across the top.
    const velvet = createVelvetTexture();
    const drapeMat = new THREE.MeshPhysicalMaterial({
      map: velvet, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xff6a7a), sheenRoughness: 0.45,
    });
    const drapeH = H - height - 0.1;
    for (const side of [-1, 1]) {
      const drape = new THREE.Mesh(new THREE.BoxGeometry(1.5, drapeH, 0.25), drapeMat);
      drape.position.set(side * (SCREEN.width / 2 + 1.0), height + drapeH / 2, SCREEN_Z - 0.35);
      this.group.add(drape);
    }
    const valanceTex = velvet.clone();
    valanceTex.repeat.set(6, 1);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(B.maxX - B.minX, 0.6, 0.3),
      drapeMat.clone());
    valance.material.map = valanceTex;
    valance.position.set(0, H - 0.3, SCREEN_Z - 0.4);
    this.group.add(valance);
  }

  buildScreen() {
    const masking = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.width + 0.5, SCREEN.height + 0.5, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
    masking.position.set(0, SCREEN.y, SCREEN_Z + 0.02);

    this.letterbox = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
      new THREE.MeshBasicMaterial({ color: 0x020202 }));
    this.letterbox.position.set(0, SCREEN.y, SCREEN_Z - 0.005);
    this.letterbox.rotation.y = Math.PI;

    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.surface.position.set(0, SCREEN.y, SCREEN_Z - 0.01);
    this.surface.rotation.y = Math.PI;

    // Light spilling from the screen onto the audience.
    RectAreaLightUniformsLib.init();
    this.screenLight = new THREE.RectAreaLight(0xffffff, 1, SCREEN.width, SCREEN.height);
    this.screenLight.position.set(0, SCREEN.y, SCREEN_Z - 0.05);
    this.screenLight.lookAt(0, SCREEN.y, SCREEN_Z - 10);

    // Positional audio hangs off this.
    this.speaker = new THREE.Object3D();
    this.speaker.position.set(0, SCREEN.y, SCREEN_Z - 0.3);
    this.speaker.rotation.y = Math.PI;

    this.group.add(masking, this.letterbox, this.surface, this.screenLight, this.speaker);
  }

  buildSeats() {
    const fabric = new THREE.MeshPhysicalMaterial({
      color: PALETTE.seatFabric, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xff8a90), sheenRoughness: 0.5,
    });
    const frame = new THREE.MeshStandardMaterial({ color: PALETTE.seatFrame, roughness: 0.5, metalness: 0.2 });
    const parts = [
      { geo: new THREE.BoxGeometry(0.56, 0.12, 0.5), mat: fabric, offset: [0, 0.44, 0.03] },
      { geo: new THREE.BoxGeometry(0.56, 0.74, 0.1), mat: fabric, offset: [0, 0.86, -0.24], tilt: -0.12 },
      { geo: new THREE.BoxGeometry(0.06, 0.68, 0.6), mat: frame, offset: [-0.31, 0.34, -0.02] },
      { geo: new THREE.BoxGeometry(0.06, 0.68, 0.6), mat: frame, offset: [0.31, 0.34, -0.02] },
    ];
    const dummy = new THREE.Object3D();
    this.seatMeshes = parts.map(({ geo, mat, offset, tilt = 0 }) => {
      const mesh = new THREE.InstancedMesh(geo, mat, SEATS.length);
      SEATS.forEach((seat, i) => {
        dummy.position.set(seat.x + offset[0], offset[1], seat.z + offset[2]);
        dummy.rotation.set(tilt, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    });
  }

  buildProjector() {
    const apex = new THREE.Vector3(0, DOOR.height + 1.35, BACK_Z + 0.05);
    const hw = SCREEN.width / 2, hh = SCREEN.height / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new THREE.Vector3(x, SCREEN.y + y, SCREEN_Z - 0.05));
    const positions = [], colors = [];
    for (let i = 0; i < 4; i++) {
      for (const [v, c] of [[apex, 0.35], [corners[i], 0.015], [corners[(i + 1) % 4], 0.015]]) {
        positions.push(v.x, v.y, v.z);
        colors.push(c, c, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.beamMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.beamMesh.visible = false;

    const booth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x080808 }));
    booth.position.copy(apex).add(new THREE.Vector3(0, 0, -0.02));
    this.projectorLens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.projectorLens.position.copy(apex).add(new THREE.Vector3(0, 0, 0.01));
    this.group.add(this.beamMesh, booth, this.projectorLens);
  }

  buildSigns() {
    const exit = signMesh('EXIT', { width: 0.5, height: 0.18, bg: '#0c1a10', fg: '#3dff7a', font: '700 120px Inter, sans-serif' });
    exit.position.set(0, DOOR.height + 0.3, BACK_Z + 0.02);
    // Gallery side, above the doorway.
    const marquee = signMesh('CINEMA', { width: 1.9, height: 0.42, bg: '#1b1a17', fg: '#e9d9b8', font: '600 150px "Cormorant Garamond", Georgia, serif', spacing: 0.35 });
    marquee.position.set(0, DOOR.height + 0.55, B.minZ - FACE - 0.02);
    marquee.rotation.y = Math.PI;
    this.group.add(exit, marquee);
  }
}

function approach(value, target, step) {
  return Math.abs(target - value) <= step ? target : value + Math.sign(target - value) * step;
}
