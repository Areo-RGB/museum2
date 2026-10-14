import * as THREE from 'three';

const CENTER = new THREE.Vector2(0, 0);
const OCCLUDER = Symbol('occluder');

/**
 * @typedef {Object} Interactable
 * @property {(hit: THREE.Intersection) => ({ title: string, subtitle: string } | null)} caption
 * @property {(hit: THREE.Intersection) => void} activate
 * @property {number} [maxDistance]  Defaults to 8 m.
 */

/**
 * Everything the crosshair can point at. Features register meshes together
 * with a handler object; walls are registered as occluders so nothing can be
 * clicked through them.
 */
export class Interactions {
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 40;
    this.targets = new Map();
    this.meshes = [];
  }

  /** @param {THREE.Object3D[]} meshes @param {Interactable} target */
  add(meshes, target) {
    for (const mesh of meshes) {
      this.targets.set(mesh, target);
      this.meshes.push(mesh);
    }
  }

  addOccluders(meshes) {
    for (const mesh of meshes) {
      this.targets.set(mesh, OCCLUDER);
      this.meshes.push(mesh);
    }
  }

  clear() {
    this.targets.clear();
    this.meshes.length = 0;
  }

  /** @returns {{ target: Interactable, hit: THREE.Intersection } | null} */
  pick() {
    this.raycaster.setFromCamera(CENTER, this.camera);
    // Hidden meshes (e.g. the video play button on non-video frames) must not
    // intercept the ray; the nearest *visible* hit decides.
    const hit = this.raycaster.intersectObjects(this.meshes, false)
      .find((h) => { let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
    const target = hit && this.targets.get(hit.object);
    if (!target || target === OCCLUDER || hit.distance > (target.maxDistance ?? 8)) return null;
    return { target, hit };
  }
}
