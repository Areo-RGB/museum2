import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export const PLAYER_SIZE = { width: 1280, height: 720 };

export function screenCutoutMaterial() {
  // Write alpha=0 directly, with normal depth testing. Geometry in front of
  // the screen retains its opaque pixels and hides the DOM player underneath.
  return new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, premultipliedAlpha: true, toneMapped: false });
}

export function screenPose(surface) {
  surface.updateWorldMatrix(true, false);
  const size = surface.getWorldScale(new THREE.Vector3());
  return {
    position: surface.getWorldPosition(new THREE.Vector3()),
    quaternion: surface.getWorldQuaternion(new THREE.Quaternion()),
    scale: new THREE.Vector3(size.x / PLAYER_SIZE.width, size.y / PLAYER_SIZE.height, 1),
  };
}

export function viewingPosition(fov, aspect) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const distance = Math.max(7.8, 6.4 / (2 * tan * aspect) * 1.15);
  return new THREE.Vector3(0, 1.65, Math.max(0.8, 15.84 - distance));
}

/** A DOM video plane below the canvas, revealed only by its WebGL cutout. */
export class CinemaScreen {
  constructor(app, surface) {
    this.app = app;
    this.surface = surface;
    this.originalMaterial = surface.material;
    this.cutoutMaterial = screenCutoutMaterial();
    this.renderer = new CSS3DRenderer();
    this.renderer.domElement.className = 'cinema-screen-layer';
    this.renderer.domElement.setAttribute('aria-label', 'Cinema screen');
    document.body.prepend(this.renderer.domElement);
    this.container = document.createElement('div');
    this.container.id = 'youtubePlayer';
    this.container.style.width = `${PLAYER_SIZE.width}px`;
    this.container.style.height = `${PLAYER_SIZE.height}px`;
    this.object = new CSS3DObject(this.container);
    this.scene = new THREE.Scene();
    this.scene.add(this.object);
    this.setActive(false);
  }

  setActive(active) {
    this.active = active;
    this.surface.material = active ? this.cutoutMaterial : this.originalMaterial;
    // Draw the cutout last, so foreground seats/walls have already written depth.
    this.surface.renderOrder = active ? 100 : 0;
    this.renderer.domElement.style.visibility = active ? 'visible' : 'hidden';
  }

  setInteractive(interactive) {
    this.container.style.pointerEvents = interactive ? 'auto' : 'none';
  }

  update() {
    if (!this.active) return;
    const width = this.app.canvas.clientWidth, height = this.app.canvas.clientHeight;
    if (width !== this.width || height !== this.height) {
      this.renderer.setSize(width, height);
      this.width = width; this.height = height;
    }
    const pose = screenPose(this.surface);
    this.object.position.copy(pose.position);
    this.object.quaternion.copy(pose.quaternion);
    this.object.scale.copy(pose.scale);
    this.app.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.app.camera);
  }

  dispose() {
    this.setActive(false);
    this.object.removeFromParent();
    this.renderer.domElement.remove();
    this.cutoutMaterial.dispose();
  }
}
