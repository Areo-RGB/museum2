import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Owns the renderer, scene, camera and the frame loop.
 * Features plug in as "systems": any object with `update(dt, app)`.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.render.fov, innerWidth / innerHeight, 0.05, 80);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.systems = [];

    addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  addSystem(system) {
    this.systems.push(system);
    return system;
  }

  start() {
    this.renderer.setAnimationLoop((timestamp) => {
      this.timer.update(timestamp);
      const dt = Math.min(this.timer.getDelta(), 0.05);
      for (const system of this.systems) system.update?.(dt, this);
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
