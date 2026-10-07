import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { deviceProfile, pixelRatio } from './deviceProfile.js';

/**
 * Owns the renderer, scene, camera and the frame loop.
 * Features plug in as "systems": any object with `update(dt, app)`.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.profile = deviceProfile({ coarsePointer: matchMedia('(pointer: coarse)').matches, width: innerWidth,
      deviceMemory: navigator.deviceMemory, saveData: navigator.connection?.saveData });
    this.renderOptions = { ...CONFIG.render, ...this.profile.render };
    this.mediaOptions = { ...CONFIG.media, ...this.profile.media };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.renderOptions.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, this.renderOptions));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.render.fov, innerWidth / innerHeight, 0.05, 220);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.systems = [];

    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      for (const system of this.systems) system.onVisibilityChange?.(!document.hidden);
    });
  }

  get maxAnisotropy() {
    return Math.min(this.profile.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
  }

  addSystem(system) {
    this.systems.push(system);
    return system;
  }

  start() {
    this.renderer.setAnimationLoop((timestamp) => {
      this.timer.update(timestamp);
      if (document.hidden) return;
      const dt = Math.min(this.timer.getDelta(), 0.05);
      for (const system of this.systems) system.update?.(dt, this);
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, this.renderOptions));
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
