import * as THREE from 'three';

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Glides the camera from artwork to artwork, pausing in front of each. */
export class CinematicTour {
  constructor(camera, frames, { secondsPerStop, viewDistance, eyeHeight }) {
    this.camera = camera;
    this.options = { secondsPerStop, viewDistance, eyeHeight };
    this.active = false;
    // Walk the room in angular order so the path circles the gallery.
    this.frames = [...frames].sort((a, b) => Math.atan2(a.center.x, a.center.z) - Math.atan2(b.center.x, b.center.z));
    this._from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this._to = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this._dummy = new THREE.Object3D();
  }

  start() {
    if (!this.frames.length) return;
    this.active = true;
    // Begin at the artwork nearest the camera.
    const pos = this.camera.position;
    this.index = this.frames.reduce((best, f, i) =>
      f.center.distanceToSquared(pos) < this.frames[best].center.distanceToSquared(pos) ? i : best, 0);
    this.beginLeg();
  }

  stop() { this.active = false; }

  beginLeg() {
    this.elapsed = 0;
    this._from.position.copy(this.camera.position);
    this._from.quaternion.copy(this.camera.quaternion);
    this.viewpointFor(this.frames[this.index], this._to);
  }

  viewpointFor(frame, out) {
    const distance = this.options.viewDistance * (frame.slot.hero ? 1.35 : 1);
    out.position.copy(frame.center).addScaledVector(frame.normal, distance);
    out.position.y = this.options.eyeHeight + 0.1;
    this._dummy.position.copy(out.position);
    this._dummy.lookAt(frame.center);
    out.quaternion.copy(this._dummy.quaternion);
  }

  update(dt) {
    if (!this.active) return;
    const total = this.options.secondsPerStop;
    this.elapsed += dt;
    const travel = Math.min(1, this.elapsed / (total * 0.45));
    const e = smoother(travel);
    this.camera.position.lerpVectors(this._from.position, this._to.position, e);
    this.camera.quaternion.slerpQuaternions(this._from.quaternion, this._to.quaternion, e);
    // Slow drift towards the piece while lingering.
    if (travel >= 1) {
      const linger = (this.elapsed - total * 0.45) / (total * 0.55);
      this.camera.position.addScaledVector(this.frames[this.index].normal, -0.35 * smoother(Math.min(1, linger)));
    }
    if (this.elapsed >= total) {
      this.index = (this.index + 1) % this.frames.length;
      this.beginLeg();
    }
  }
}
