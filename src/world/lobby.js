import * as THREE from 'three';
import { LOBBY, ROOM } from './layout.js';
import { canvasPanel } from './signage.js';

const { escalator: E, directory: D } = LOBBY;
const RISE = ROOM.height;               // the escalator disappears into the ceiling
const RUN = E.topZ - E.bottomZ;
const SLOPE = Math.atan2(RISE, RUN);
const STEP_RUN = 0.4;                   // horizontal depth of one step
const STEP_SPEED = 0.45;                // m/s along the run
const STEP_COUNT = Math.ceil(RUN / STEP_RUN);

const PALETTE = {
  truss: 0x2b2a28,
  step: 0x8d8b86,
  rail: 0x111111,
  glass: 0xcfe3e6,
  comb: 0xb9a36c,
  led: 0xffd9a0,
};

/**
 * Lobby fixtures shared by every floor: the escalator (between floors) and the
 * floor directory. Click either to choose a floor.
 */
export class Lobby {
  /** @param {{ key: string, label: string, range: string, count: number }[]} floors */
  constructor(floors) {
    this.floors = floors;
    this.current = 0;
    this.group = new THREE.Group();
    this.group.name = 'lobby';
    this.stepOffset = 0;
    this.buildEscalator();
    this.buildDirectory();
  }

  /** World position on the escalator's walking line at horizontal distance `t` (0..RUN) from the bottom. */
  pointOnRun(t, height = 0) {
    return new THREE.Vector3(E.x, Math.max(0, t) * Math.tan(SLOPE) + height, E.bottomZ + t);
  }

  /** Where a ride starts (bottom landing) and ends (inside the ceiling), at eye height. */
  get ride() {
    return {
      landing: new THREE.Vector3(E.x, 1.65, E.bottomZ - 0.6),
      top: this.pointOnRun(RUN, 1.65),
      slope: SLOPE,
    };
  }

  setCurrent(index) {
    this.current = index;
    this.directory.repaint();
  }

  registerInteractions(interactions, onActivate) {
    interactions.add(this.escalatorMeshes, {
      caption: () => ({ title: 'Escalator', subtitle: 'Click to choose a floor' }),
      activate: onActivate,
    });
    interactions.add([this.directory.mesh, this.directory.base], {
      caption: () => ({ title: 'Floor directory', subtitle: `${this.floors.length} floors · click to choose` }),
      activate: onActivate,
    });
  }

  update(dt) {
    this.stepOffset = (this.stepOffset + dt * STEP_SPEED) % STEP_RUN;
    this.layoutSteps();
  }

  buildEscalator() {
    const length = Math.hypot(RUN, RISE);
    const metal = new THREE.MeshStandardMaterial({ color: PALETTE.truss, roughness: 0.5, metalness: 0.6 });
    const along = (mesh, height, offsetX = 0) => {
      // Place a box of the given length centred on the walking line, tilted to the slope.
      const mid = this.pointOnRun(RUN / 2, height);
      mesh.position.set(E.x + offsetX, mid.y, mid.z);
      mesh.rotation.x = -SLOPE;
      return mesh;
    };

    const truss = along(new THREE.Mesh(new THREE.BoxGeometry(E.width, 0.5, length), metal), -0.3);
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false,
    });
    const railMat = new THREE.MeshStandardMaterial({ color: PALETTE.rail, roughness: 0.6 });
    const ledMat = new THREE.MeshBasicMaterial({ color: PALETTE.led });
    const parts = [truss];
    for (const side of [-1, 1]) {
      const x = side * (E.width / 2 - 0.05);
      parts.push(
        along(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.85, length), glassMat), 0.5, x),
        along(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, length + 0.4), railMat), 0.95, x),
        along(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, length), ledMat), 0.06, x * 0.92),
      );
    }

    // Moving steps (treads + risers) as instanced boxes.
    const stepMat = new THREE.MeshStandardMaterial({ color: PALETTE.step, roughness: 0.4, metalness: 0.7 });
    const stepW = E.width - 0.2;
    this.treads = new THREE.InstancedMesh(new THREE.BoxGeometry(stepW, 0.04, STEP_RUN - 0.03), stepMat, STEP_COUNT);
    this.risers = new THREE.InstancedMesh(new THREE.BoxGeometry(stepW, STEP_RUN * Math.tan(SLOPE), 0.02), stepMat, STEP_COUNT);
    this.treads.frustumCulled = this.risers.frustumCulled = false;
    this._dummy = new THREE.Object3D();
    this.layoutSteps();

    // Landing plate with a brass comb edge, and the dark opening it disappears into.
    const landing = new THREE.Mesh(new THREE.BoxGeometry(E.width, 0.03, 1.0),
      new THREE.MeshStandardMaterial({ color: PALETTE.step, roughness: 0.35, metalness: 0.8 }));
    landing.position.set(E.x, 0.015, E.bottomZ - 0.5);
    const comb = new THREE.Mesh(new THREE.BoxGeometry(E.width - 0.1, 0.035, 0.06),
      new THREE.MeshStandardMaterial({ color: PALETTE.comb, roughness: 0.3, metalness: 0.9 }));
    comb.position.set(E.x, 0.03, E.bottomZ - 0.02);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(E.width + 0.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    opening.rotation.x = Math.PI / 2;
    opening.position.set(E.x, ROOM.height - 0.012, E.topZ - 0.6);

    this.escalatorMeshes = [...parts, this.treads, this.risers];
    this.group.add(...parts, this.treads, this.risers, landing, comb, opening);
  }

  layoutSteps() {
    const d = this._dummy;
    const rise = STEP_RUN * Math.tan(SLOPE);
    for (let i = 0; i < STEP_COUNT; i++) {
      const t = i * STEP_RUN + this.stepOffset;
      // Tread: flat, its front edge on the slope line, so the run reads as a staircase.
      const p = this.pointOnRun(t + STEP_RUN / 2);
      d.position.set(E.x, Math.ceil(t / STEP_RUN) * rise - 0.02, p.z);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.treads.setMatrixAt(i, d.matrix);
      d.position.set(E.x, Math.ceil(t / STEP_RUN) * rise - rise / 2 - 0.02, E.bottomZ + t + 0.01);
      d.updateMatrix();
      this.risers.setMatrixAt(i, d.matrix);
    }
    this.treads.instanceMatrix.needsUpdate = true;
    this.risers.instanceMatrix.needsUpdate = true;
  }

  buildDirectory() {
    const [x, , z] = D.position;
    const base = new THREE.Mesh(new THREE.BoxGeometry(D.width + 0.1, D.height + 0.3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.5, metalness: 0.3 }));
    base.position.set(x, (D.height + 0.3) / 2, z);

    const draw = (ctx, w, h) => {
      ctx.fillStyle = '#1b1a17';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9a873';
      ctx.font = `500 ${w * 0.05}px Inter, sans-serif`;
      ctx.letterSpacing = '0.25em';
      ctx.fillText('FLOOR DIRECTORY', w * 0.08, h * 0.07);
      ctx.letterSpacing = '0em';
      ctx.fillStyle = '#f1e8d8';
      ctx.font = `600 ${w * 0.13}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Floors', w * 0.08, h * 0.15);
      const rowH = Math.min(h * 0.08, (h * 0.78) / this.floors.length);
      this.floors.forEach((floor, i) => {
        const y = h * 0.2 + i * rowH;
        if (i === this.current) {
          ctx.fillStyle = 'rgba(201,168,115,0.22)';
          ctx.fillRect(w * 0.04, y, w * 0.92, rowH * 0.9);
          ctx.fillStyle = '#c9a873';
          ctx.fillRect(w * 0.04, y, w * 0.012, rowH * 0.9);
        }
        ctx.fillStyle = i === this.current ? '#f1e8d8' : 'rgba(241,232,216,0.7)';
        ctx.font = `600 ${rowH * 0.42}px Inter, sans-serif`;
        ctx.fillText(floorName(i, this.floors), w * 0.08, y + rowH * 0.55);
        ctx.font = `600 ${rowH * 0.5}px "Cormorant Garamond", Georgia, serif`;
        ctx.fillText(floor.label, w * 0.26, y + rowH * 0.58);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(241,232,216,0.5)';
        ctx.font = `500 ${rowH * 0.34}px Inter, sans-serif`;
        ctx.fillText(String(floor.count), w * 0.92, y + rowH * 0.55);
        ctx.textAlign = 'left';
      });
    };
    const mesh = canvasPanel(D.width, D.height, draw, { lit: false, resolution: 768 });
    mesh.position.set(x, D.height / 2 + 0.2, z - 0.065);
    mesh.rotation.y = Math.PI; // face the entrance
    this.directory = { mesh, base, repaint: () => mesh.userData.repaint() };
    this.group.add(base, mesh);
  }
}

/** "1", "2", … for dated floors; the undated archive is the basement. */
export function floorName(index, floors) {
  return floors[index]?.key === 'undated' ? 'B' : String(index + 1);
}
