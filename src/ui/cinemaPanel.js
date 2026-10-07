import { $ } from './dom.js';


/**
 * The cinema programme: pick a film. Pure DOM; talks to
 * the hall through the handlers passed in.
 */
export class CinemaPanel {
  /**
   * @param {import('../world/cinema.js').CinemaHall} hall
   * @param {{ onClose(): void }} handlers
   */
  constructor(hall, { onClose, onSelect }) {
    this.onSelect = onSelect;
    this.hall = hall;
    this.el = $('cinemaPanel');
    this.list = $('filmList');
    this.nowTitle = $('nowTitle');
    this.nowMeta = $('nowMeta');
    $('closeCinema').addEventListener('click', onClose);
    this.setHall(hall);
  }

  setHall(hall) {
    if (this.hall) this.hall.onChange = () => {};
    this.hall = hall;
    if (hall) hall.onChange = () => this.refresh();
    this.refresh();
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
    const poster = document.createElement('img');
    poster.dataset.src = `https://i.ytimg.com/vi/${film.source.videoId}/hqdefault.jpg`;
    poster.loading = 'lazy';
    poster.alt = '';
    poster.className = 'poster';
    const title = document.createElement('strong');
    title.textContent = film.title;
    const meta = document.createElement('span');
    meta.textContent = film.meta;
    button.append(poster, title, meta);
    button.addEventListener('click', () => {
      if (!this.hall) return;
      const link = $('youtubeLink');
      link.href = film.source.url;
      link.classList.remove('hidden');
      this.onSelect();
      this.hall.project(film).catch((err) => {
        console.error(err);
        this.nowMeta.textContent = `Couldn't load: ${err.message}`;
      });
      this.el.scrollTop = 0;
    });
    return button;
  }

  get isOpen() { return this.el.classList.contains('open'); }
  open() {
    for (const poster of this.list.querySelectorAll('img[data-src]')) {
      poster.src = poster.dataset.src;
      poster.removeAttribute('data-src');
    }
    this.refresh();
    this.el.classList.add('open');
  }
  close() { this.el.classList.remove('open'); }

  refresh() {
    const { nowPlaying, loading, film } = this.hall ?? {};
    const current = loading ?? nowPlaying;
    this.nowTitle.textContent = current?.title ?? 'Nothing showing';
    $('youtubeLink').classList.toggle('hidden', !film);
    this.nowMeta.textContent = film?.status ?? (loading ? 'Threading the projector…' : (nowPlaying ? nowPlaying.meta : 'Pick something below'));
    $('watchStatus').textContent = film?.status ?? 'Choose a film from the programme';
    $('watchToggle').disabled = !film || !!loading;
    $('watchToggle').textContent = film && !film.paused ? 'Pause' : 'Play';
    $('watchStop').disabled = !film;
    for (const card of this.list.querySelectorAll('.film-card')) {
      card.classList.toggle('playing', card.dataset.id === nowPlaying?.id);
      card.classList.toggle('loading', card.dataset.id === loading?.id);
    }
  }

}
