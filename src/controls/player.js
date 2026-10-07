import * as THREE from 'three';

const PITCH_LIMIT = Math.PI * 0.47;

/** First-person pointer-lock controller with wall sliding and a little head bob. */
export class PlayerController {
  constructor(camera, canvas, options) {
    this.camera = camera;
    this.canvas = canvas;
    this.options = options;
    this.collides = options.collides ?? (() => false);
    this.euler = new THREE.Euler(0, options.start.yaw, 0, 'YXZ');
    this.keys = new Set();
    this.enabled = true;
    this.seated = false;
    this.standPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.bob = 0;
    this._wish = new THREE.Vector3();
    this._next = new THREE.Vector3();
    this.touchEnabled = false;
    this.touchMove = { x: 0, z: 0 };

    camera.position.fromArray(options.start.position);
    camera.quaternion.setFromEuler(this.euler);

    this._move = (e) => this.onMouseMove(e);
    this._down = (e) => this.keys.add(e.code);
    this._up = (e) => this.keys.delete(e.code);
    document.addEventListener('pointerlockchange', () => this.onLockChange());
  }

  lock() { if (this.enabled && !this.touchEnabled && !this.locked) this.canvas.requestPointerLock()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  get locked() { return document.pointerLockElement === this.canvas; }
  get active() { return this.enabled && (this.locked || this.touchEnabled); }

  clearInput() {
    this.keys.clear();
    this.touchMove.x = this.touchMove.z = 0;
    this.velocity.set(0, 0, 0);
  }

  onLockChange() {
    const method = this.locked ? 'addEventListener' : 'removeEventListener';
    document[method]('mousemove', this._move);
    document[method]('keydown', this._down);
    document[method]('keyup', this._up);
    if (!this.locked) this.clearInput();
  }

  /** Re-derive yaw/pitch after something else (e.g. the tour) moved the camera. */
  syncFromCamera() {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.euler.z = 0;
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.y = this.options.eyeHeight;
  }

  /** Sit down (e.g. in a cinema seat). Any movement key stands back up. */
  sit({ position, yaw }) {
    if (!this.seated) this.standPosition.copy(this.camera.position);
    this.seated = true;
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(position);
    this.euler.set(-0.04, yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  standUp() {
    if (!this.seated) return;
    this.seated = false;
    this.camera.position.copy(this.standPosition);
    this.camera.position.y = this.options.eyeHeight;
  }

  onMouseMove(e) {
    const s = this.options.sensitivity;
    this.euler.y -= e.movementX * s;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x - e.movementY * s, -PITCH_LIMIT, PITCH_LIMIT);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const active = this.active;
    const x = active ? this.touchMove.x + (+(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))) : 0;
    const z = active ? this.touchMove.z + (+(k.has('KeyS') || k.has('ArrowDown')) - +(k.has('KeyW') || k.has('ArrowUp'))) : 0;
    if (this.seated) {
      if (x || z) this.standUp();
      return;
    }
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') ? this.options.sprintMultiplier : 1;

    this._wish.set(x, 0, z);
    if (this._wish.lengthSq()) this._wish.clampLength(0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.euler.y);
    this._wish.multiplyScalar(this.options.speed * sprint);
    // Exponential smoothing gives gentle acceleration/deceleration.
    this.velocity.lerp(this._wish, 1 - Math.exp(-dt * 10));
    if (this.velocity.lengthSq() < 1e-5) return;

    const pos = this.camera.position;
    const step = this._wish.copy(this.velocity).multiplyScalar(dt);
    // Try the full move, then each axis separately so we slide along walls.
    for (const candidate of [[step.x, step.z], [step.x, 0], [0, step.z]]) {
      this._next.set(pos.x + candidate[0], 0, pos.z + candidate[1]);
      if (!this.collides(this._next)) { pos.x = this._next.x; pos.z = this._next.z; break; }
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bob += dt * speed * 2.2;
    pos.y = this.options.eyeHeight + Math.sin(this.bob) * 0.025 * Math.min(1, speed / this.options.speed);
  }
}
