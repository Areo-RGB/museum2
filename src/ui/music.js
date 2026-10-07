import { $ } from './dom.js';

/**
 * Looping background music, toggled by the visitor. Persists across floors;
 * the cinema can hold it while a film has the screen.
 */
export class BackgroundMusic {
  constructor(url, { volume = 0.35 } = {}) {
    this.button = $('musicButton');
    this.audio = new Audio();
    Object.assign(this.audio, { src: url, loop: true, preload: 'none', volume });
    this.wanted = false;
    this.held = false;
    this.button.addEventListener('click', () => this.toggle());
    this.audio.addEventListener('play', () => this.render());
    this.audio.addEventListener('pause', () => this.render());
    this.render();
  }

  toggle() {
    this.wanted = !this.wanted;
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
