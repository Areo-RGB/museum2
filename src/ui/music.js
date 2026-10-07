import { $ } from './dom.js';

const STORAGE_KEY = 'museum-music';

/**
 * Looping background music, on by default and toggled by the visitor (the
 * choice is remembered). Persists across floors; the cinema can hold it while
 * a film has the screen. Browsers block sound until the first user gesture, so
 * a blocked start waits for one.
 */
export class BackgroundMusic {
  constructor(url, { volume = 0.35 } = {}) {
    this.button = $('musicButton');
    this.audio = new Audio();
    Object.assign(this.audio, { src: url, loop: true, preload: 'none', volume });
    this.wanted = readPreference();
    this.held = false;
    this.startOnGesture = () => {
      for (const type of GESTURES) removeEventListener(type, this.startOnGesture, true);
      this.sync();
    };
    this.button.addEventListener('click', () => this.toggle());
    this.audio.addEventListener('play', () => this.render());
    this.audio.addEventListener('pause', () => this.render());
    this.sync();
  }

  toggle() {
    this.wanted = !this.wanted;
    try { localStorage.setItem(STORAGE_KEY, this.wanted ? 'on' : 'off'); } catch {}
    this.sync();
  }

  /** Pause without forgetting the visitor's choice (e.g. while watching a film). */
  hold(held) {
    if (this.held === held) return;
    this.held = held;
    this.sync();
  }

  sync() {
    if (this.wanted && !this.held) {
      this.audio.play().catch((err) => {
        if (err.name === 'NotAllowedError') {
          for (const type of GESTURES) addEventListener(type, this.startOnGesture, { capture: true });
          return;
        }
        console.warn('[music] playback failed', err);
        this.wanted = false;
        this.render();
      });
    } else this.audio.pause();
    this.render();
  }

  render() {
    const playing = this.wanted && !this.held;
    this.button.textContent = playing ? '❚❚ Music' : '▶ Music';
    this.button.setAttribute('aria-pressed', String(this.wanted));
    this.button.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
    this.button.title = 'Background music (B)';
  }
}

// Events that count as user activation for media playback.
const GESTURES = ['pointerdown', 'keydown', 'touchend'];

function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
