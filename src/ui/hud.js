import { $ } from './dom.js';

/** Crosshair, hover caption, loading bar, tour badge and toasts. */
export class Hud {
  constructor() {
    this.root = $('hud');
    this.caption = $('hoverCaption');
    this.captionTitle = $('hoverTitle');
    this.captionSub = $('hoverSub');
    this.crosshair = $('crosshair');
    this.loading = $('loading');
    this.loadingBar = $('loadingBar');
    this.badge = $('tourBadge');
    this.toastEl = $('toast');
    this.hovered = '';
  }

  setVisible(visible) { this.root.classList.toggle('hidden', !visible); }

  /** @param {{ title: string, subtitle: string } | null} caption */
  setHovered(caption) {
    const key = caption ? `${caption.title}|${caption.subtitle}` : '';
    if (key === this.hovered) return;
    this.hovered = key;
    this.crosshair.classList.toggle('active', !!caption);
    this.caption.classList.toggle('show', !!caption);
    if (caption) {
      this.captionTitle.textContent = caption.title;
      this.captionSub.textContent = caption.subtitle;
    }
  }

  setProgress({ pending, done }) {
    const total = pending + done;
    this.loadingBar.style.transform = `scaleX(${total ? done / total : 1})`;
    this.loading.classList.toggle('show', pending > 0);
  }

  setTour(active) { this.badge.classList.toggle('show', active); }

  toast(message, ms = 2400) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
