import { $ } from './dom.js';
import { generatorPoster } from '../cinema/films.js';

/**
 * The cinema programme: pick a film, control playback. Pure DOM; talks to
 * the hall through the handlers passed in.
 */
export class CinemaPanel {
  /**
   * @param {import('../world/cinema.js').CinemaHall} hall
   * @param {{ onClose(): void }} handlers
   */
  constructor(hall, { onClose }) {
    this.hall = hall;
    this.el = $('cinemaPanel');
    this.list = $('filmList');
    this.nowTitle = $('nowTitle');
    this.nowMeta = $('nowMeta');
    this.toggle = $('filmToggle');
    this.stopButton = $('filmStop');
    this.volume = $('filmVolume');
    this.progress = $('filmProgress');

    this.toggle.addEventListener('click', () => hall.togglePause().catch((e) => console.warn(e)));
    this.stopButton.addEventListener('click', () => hall.stop());
    this.volume.addEventListener('input', () => hall.setVolume(+this.volume.value));
    $('closeCinema').addEventListener('click', onClose);
    hall.onChange = () => this.refresh();
  }

  /** @param {{ heading: string, films: import('../cinema/programme.js').Film[] }[]} sections */
  setProgramme(sections) {
    this.list.replaceChildren(...sections.filter((s) => s.films.length).flatMap(({ heading, films }) => {
      const h = document.createElement('h3');
      h.textContent = heading;
      const grid = document.createElement('div');
      grid.className = 'film-grid';
      grid.append(...films.map((film) => this.card(film)));
      return [h, grid];
    }));
    this.refresh();
  }

  card(film) {
    const button = document.createElement('button');
    button.className = 'film-card';
    button.dataset.id = film.id;
    let poster;
    if (film.source.type === 'generated') {
      poster = document.createElement('img');
      poster.src = generatorPoster(film.source.generator);
      poster.alt = '';
    } else {
      // Shows a frame one second in. Loaded lazily on first open, and with
      // CORS so the cached response stays usable by WebGL elsewhere.
      poster = document.createElement('video');
      Object.assign(poster, { muted: true, preload: 'metadata', playsInline: true, crossOrigin: 'anonymous' });
      poster.dataset.src = `${film.source.url}#t=1`;
    }
    poster.className = 'poster';
    const title = document.createElement('strong');
    title.textContent = film.title;
    const meta = document.createElement('span');
    meta.textContent = film.meta;
    button.append(poster, title, meta);
    button.addEventListener('click', () => this.hall.project(film).catch((err) => {
      console.error(err);
      this.nowMeta.textContent = `Couldn't load: ${err.message}`;
    }));
    return button;
  }

  get isOpen() { return this.el.classList.contains('open'); }
  open() {
    for (const video of this.list.querySelectorAll('video[data-src]')) {
      video.src = video.dataset.src;
      video.removeAttribute('data-src');
    }
    this.refresh();
    this.el.classList.add('open');
    this.tick();
  }
  close() { this.el.classList.remove('open'); }

  refresh() {
    const { nowPlaying, loading, film } = this.hall;
    const current = loading ?? nowPlaying;
    this.nowTitle.textContent = current?.title ?? 'Nothing showing';
    this.nowMeta.textContent = loading ? 'Threading the projector…' : (nowPlaying ? nowPlaying.meta : 'Pick something below');
    this.toggle.disabled = this.stopButton.disabled = !film;
    this.toggle.textContent = film && !film.paused ? 'Pause' : 'Play';
    for (const card of this.list.querySelectorAll('.film-card')) {
      card.classList.toggle('playing', card.dataset.id === nowPlaying?.id);
      card.classList.toggle('loading', card.dataset.id === loading?.id);
    }
  }

  tick() {
    if (!this.isOpen) return;
    const p = this.hall.film?.progress;
    this.progress.style.transform = `scaleX(${p ?? 0})`;
    requestAnimationFrame(() => this.tick());
  }
}
