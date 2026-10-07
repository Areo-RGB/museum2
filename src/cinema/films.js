import * as THREE from 'three';
import { GENERATORS } from './generators.js';

/**
 * A Film is anything the projector can show. Shared interface:
 *   texture, width, height, paused, progress (0..1 or null),
 *   play(), pause(), update(dt), setVolume(v), dispose(), sampleSource
 */

export class GeneratedFilm {
  constructor(generatorName, { width = 1280, height = 720 } = {}) {
    const factory = GENERATORS[generatorName];
    if (!factory) throw new Error(`Unknown generator: ${generatorName}`);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.generator = factory(width, height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.time = 0;
    this.paused = true;
    this.hasAudio = false;
    this.draw();
  }

  get sampleSource() { return this.canvas; }
  get progress() {
    const d = this.generator.duration;
    return Number.isFinite(d) ? (this.time % d) / d : null;
  }

  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  setVolume() {}

  update(dt) {
    if (this.paused) return;
    this.time += dt;
    this.draw();
  }

  draw() {
    this.generator.draw(this.ctx, this.width, this.height, this.time);
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); this.canvas.width = this.canvas.height = 0; }
}

/** Render a single still from a generator, for posters in the UI. */
export function generatorPoster(name, time = 2.5, width = 320, height = 180) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const gen = GENERATORS[name](width, height);
  // Step a few frames so stateful generators (starfield) have something to show.
  for (let t = 0; t <= time; t += 0.1) gen.draw(canvas.getContext('2d'), width, height, t);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export class VideoFilm {
  /**
   * @param {string} url
   * @param {{ listener: THREE.AudioListener, speaker: THREE.Object3D }} audio
   */
  static load(url, { listener, speaker }) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    Object.assign(video, { loop: true, playsInline: true, preload: 'auto' });
    video.src = url;
    return new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(new VideoFilm(video, listener, speaker)), { once: true });
      video.addEventListener('error', () => reject(new Error(`Could not load ${url}`)), { once: true });
    });
  }

  constructor(video, listener, speaker) {
    this.video = video;
    this.width = video.videoWidth;
    this.height = video.videoHeight;
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.hasAudio = true;

    // Route the soundtrack through a positional source at the screen, so it
    // gets quieter as you walk out of the hall.
    this.audio = new THREE.PositionalAudio(listener);
    this.audio.setMediaElementSource(video);
    this.audio.setRefDistance(7);
    this.audio.setRolloffFactor(1.6);
    this.audio.setDirectionalCone(200, 320, 0.25);
    speaker.add(this.audio);
  }

  get sampleSource() { return this.video; }
  get paused() { return this.video.paused; }
  get progress() { return this.video.duration ? this.video.currentTime / this.video.duration : null; }

  async play() {
    await this.audio.context.resume();
    await this.video.play();
  }

  pause() { this.video.pause(); }
  update() {}
  setVolume(v) { this.audio.setVolume(v); }

  dispose() {
    this.video.pause();
    this.audio.disconnect();
    this.audio.removeFromParent();
    this.texture.dispose();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
