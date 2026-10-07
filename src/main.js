import './styles.css';
import { CONFIG } from './config.js';
import { App } from './core/app.js';
import { COLLIDERS, SLOTS } from './world/layout.js';
import { buildEnvironment } from './world/environment.js';
import { MediaFrame } from './world/frame.js';
import { CinemaHall } from './world/cinema.js';
import { MediaLibrary } from './media/library.js';
import { Curator } from './media/curator.js';
import { PLACEHOLDER_FILMS, collectionFilms } from './cinema/programme.js';
import { PlayerController } from './controls/player.js';
import { createCollisionChecker } from './controls/collision.js';
import { Interactions } from './controls/interactions.js';
import { CinematicTour } from './controls/tour.js';
import { Hud } from './ui/hud.js';
import { EditorPanel } from './ui/editor.js';
import { CinemaPanel } from './ui/cinemaPanel.js';
import { Overlay } from './ui/overlay.js';
import { $ } from './ui/dom.js';

// ─── World ───────────────────────────────────────────────────────────────────
const app = new App($('canvas'));
const environment = buildEnvironment(app);
app.scene.add(environment.group);

const frames = SLOTS.map((slot) => new MediaFrame(slot));
for (const frame of frames) app.scene.add(frame.group);

const ambientBase = { hemisphere: environment.hemisphere.intensity, env: app.scene.environmentIntensity };
const cinema = app.addSystem(new CinemaHall(app, {
  setAmbient(factor) {
    environment.hemisphere.intensity = ambientBase.hemisphere * factor;
    app.scene.environmentIntensity = ambientBase.env * factor;
  },
}));
app.scene.add(cinema.group);

// ─── Controls ────────────────────────────────────────────────────────────────
const hud = new Hud();
const player = new PlayerController(app.camera, app.canvas, {
  ...CONFIG.player,
  collides: createCollisionChecker(COLLIDERS, CONFIG.player.radius),
});
const tour = new CinematicTour(app.camera, frames, { ...CONFIG.tour, eyeHeight: CONFIG.player.eyeHeight });
const interactions = new Interactions(app.camera);
interactions.addOccluders(environment.walls);

for (const frame of frames) {
  interactions.add(frame.hitTargets, {
    caption: () => frame.item && { title: frame.item.title, subtitle: `${frame.item.subtitle} · click to curate` },
    activate: () => openPanel(editor, frame),
  });
}
cinema.registerInteractions(interactions, {
  onScreen: () => openPanel(cinemaPanel),
  onSeat: (seat) => player.sit(seat),
});

// ─── UI & input modes ────────────────────────────────────────────────────────
/** @type {'intro'|'explore'|'panel'|'touring'} */
let mode = 'intro';
let activePanel = null;
let curator;

const overlay = new Overlay({
  onEnter: () => { overlay.hide(); mode = 'explore'; player.lock(); },
  onTour: () => { overlay.hide(); startTour(); },
});

const editor = new EditorPanel({
  onUpload: (file) => curator.upload(editor.frame, file),
  onShuffle: () => curator.shuffle(editor.frame),
  onReset: () => curator.reset(editor.frame),
  onFit: (fit) => curator.setFit(editor.frame, fit),
  onClose: () => closePanel(true),
});
const cinemaPanel = new CinemaPanel(cinema, { onClose: () => closePanel(true) });
cinemaPanel.setProgramme([{ heading: 'Now showing', films: PLACEHOLDER_FILMS }]);

function openPanel(panel, ...args) {
  mode = 'panel';
  activePanel = panel;
  hud.setHovered(null);
  player.unlock();
  panel.open(...args);
}

function closePanel(resume) {
  activePanel?.close();
  activePanel = null;
  mode = 'explore';
  if (resume) player.lock(); else overlay.showPaused();
}

function startTour() {
  mode = 'touring';
  player.standUp();
  player.enabled = false;
  player.unlock();
  hud.setHovered(null);
  hud.setTour(true);
  tour.start();
}

function stopTour() {
  tour.stop();
  hud.setTour(false);
  player.syncFromCamera();
  player.enabled = true;
  mode = 'explore';
  player.lock();
}

document.addEventListener('pointerlockchange', () => {
  if (!player.locked && mode === 'explore') {
    hud.setHovered(null);
    overlay.showPaused();
  }
});

app.canvas.addEventListener('click', () => {
  if (mode === 'touring') return stopTour();
  if (mode !== 'explore') return;
  if (!player.locked) { overlay.hide(); return player.lock(); }
  const picked = interactions.pick();
  picked?.target.activate(picked.hit);
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.code === 'Escape' && mode === 'panel') closePanel(false);
  if (e.code === 'Escape' && mode === 'touring') { stopTour(); return; }
  if (e.code === 'KeyC' && (mode === 'explore' || mode === 'touring')) {
    if (mode === 'touring') stopTour(); else { overlay.hide(); startTour(); }
  }
  if (e.code === 'KeyR' && curator && mode !== 'panel') {
    curator.shuffleAll();
    hud.toast('Rehanging the gallery…');
  }
  if (e.code === 'Space' && cinema.film && (cinema.contains(app.camera.position) || activePanel === cinemaPanel)) {
    e.preventDefault();
    cinema.togglePause();
  }
});

// ─── Systems ────────────────────────────────────────────────────────────────
app.addSystem(player);
app.addSystem(tour);
app.addSystem({
  update() {
    if (mode !== 'explore' || !player.locked) return;
    const picked = interactions.pick();
    hud.setHovered(picked ? picked.target.caption(picked.hit) : null);
  },
});

app.start();

// ─── Content ─────────────────────────────────────────────────────────────────
const library = await MediaLibrary.load(CONFIG.media.manifestUrl);
overlay.setCollectionSize(library.size);
cinemaPanel.setProgramme([
  { heading: 'Now showing', films: PLACEHOLDER_FILMS },
  { heading: 'Home movies', films: collectionFilms(library) },
]);
curator = app.addSystem(new Curator(frames, library, {
  media: CONFIG.media,
  anisotropy: Math.min(8, app.maxAnisotropy),
  onProgress: (p) => { hud.setProgress(p); if (editor.isOpen) editor.refresh(); },
}));
curator.hangAll();

// Handy for poking at the scene from devtools during development.
if (import.meta.env.DEV) Object.assign(window, { museum: { app, frames, curator, library, tour, cinema, player } });
