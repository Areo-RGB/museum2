import './styles.css';
import { CONFIG } from './config.js';
import { App } from './core/app.js';
import { createLayout } from './world/layout.js';
import { buildHall, setupAtmosphere } from './world/environment.js';
import { Lobby } from './world/lobby.js';
import { MediaFrame } from './world/frame.js';
import { CinemaHall } from './world/cinema.js';
import { MediaLibrary } from './media/library.js';
import { Curator } from './media/curator.js';
import { photoCache } from './media/cache.js';
import { CINEMA_FLOOR, YOUTUBE_FILMS } from './cinema/programme.js';
import { BACKGROUND_MUSIC_URL, HALL_OF_FAME_FEATURE, HALL_OF_FAME_FLOOR, HALL_OF_FAME_ITEMS } from './fame/programme.js';
import { PlayerController } from './controls/player.js';
import { TouchControls } from './controls/touch.js';
import { createCollisionChecker } from './controls/collision.js';
import { Interactions } from './controls/interactions.js';
import { CinematicTour } from './controls/tour.js';
import { Hud } from './ui/hud.js';
import { EditorPanel } from './ui/editor.js';
import { CinemaPanel } from './ui/cinemaPanel.js';
import { Overlay } from './ui/overlay.js';
import { FloorPanel } from './ui/floorPanel.js';
import { BackgroundMusic } from './ui/music.js';
import { getQuality, setQuality } from './core/deviceProfile.js';
import { $ } from './ui/dom.js';

// ─── World ───────────────────────────────────────────────────────────────────
// The hall is generated from the collection's time periods, so read the
// manifest (a small local JSON file) before building anything.
const app = new App($('canvas'));
const library = await MediaLibrary.load(CONFIG.media.manifestUrl, { hidden: CONFIG.media.hidden });
const floors = library.floors();
// The entrance floor is the Hall of Fame; its works resolve through the library like any other.
library.add([...HALL_OF_FAME_ITEMS, HALL_OF_FAME_FEATURE]);
floors.unshift(HALL_OF_FAME_FLOOR);
floors.push(CINEMA_FLOOR);
let currentFloor = 0;
let layout = createLayout(floors[currentFloor]);
let environment = buildHall(app, layout);
let frames = [];
let curator;
const atmosphere = setupAtmosphere(app);
const lobby = app.addSystem(new Lobby(floors));
app.scene.add(environment.group, lobby.group);

const ambientBase = { hemisphere: atmosphere.hemisphere.intensity, env: app.scene.environmentIntensity };
let cinema = null;
function createCinema() {
  cinema = new CinemaHall(app, layout.cinema, {
    setAmbient(factor) {
      atmosphere.hemisphere.intensity = ambientBase.hemisphere * factor;
      app.scene.environmentIntensity = ambientBase.env * factor;
    },
  });
  app.scene.add(cinema.group);
}

const hud = new Hud();
const music = new BackgroundMusic(BACKGROUND_MUSIC_URL);
const player = new PlayerController(app.camera, app.canvas, {
  ...CONFIG.player,
  start: layout.start,
  collides: createCollisionChecker(layout.colliders, CONFIG.player.radius),
});
const tour = new CinematicTour(app.camera, frames, { ...CONFIG.tour, eyeHeight: CONFIG.player.eyeHeight });
const interactions = new Interactions(app.camera);

// ─── UI & input modes ────────────────────────────────────────────────────────
/** @type {'intro'|'explore'|'panel'|'touring'|'riding'|'watching'} */
let mode = 'intro';
let activePanel = null;

const overlay = new Overlay({
  onEnter: () => { overlay.hide(); mode = 'explore'; player.enabled = true; player.lock(); },
  onTour: () => { overlay.hide(); startTour(); },
});

const editor = new EditorPanel({
  onUpload: (file) => curator.upload(editor.frame, file, (p) => editor.setStatus(`Uploading… ${Math.round(p * 100)}%`)),
  onShuffle: () => curator.shuffle(editor.frame),
  onReset: () => curator.reset(editor.frame),
  onFit: (fit) => curator.setFit(editor.frame, fit),
  onClose: () => closePanel(true),
});
const cinemaPanel = new CinemaPanel(cinema, { onClose: () => closePanel(true), onSelect: startWatching });
const floorPanel = new FloorPanel(floors, {
  onSelect: rideElevator,
  onClose: () => closePanel(false),
});
$('chooseFloors').addEventListener('click', showFloors);
$('floorButton').addEventListener('click', showFloors);
$('cinemaButton').addEventListener('click', () => { if (mode !== 'riding' && cinema) openPanel(cinemaPanel); });
$('watchCinema').addEventListener('click', () => openPanel(cinemaPanel));
$('watchProgramme').addEventListener('click', () => openPanel(cinemaPanel));
$('watchWalk').addEventListener('click', leaveWatching);
$('watchToggle').addEventListener('click', () => cinema?.togglePause());
$('watchStop').addEventListener('click', () => cinema?.stop());
addEventListener('resize', () => {
  if (mode !== 'watching' || !cinema) return;
  app.camera.position.copy(cinema.viewingPosition());
  app.camera.lookAt(cinema.lookAtScreen());
  player.syncFromCamera();
});
cinemaPanel.setProgramme([
  { heading: 'September 2026 · Five films', films: YOUTUBE_FILMS },
]);
overlay.setCollectionSize(library.size);
if (globalThis.caches) $('cacheSettings').classList.remove('hidden');
$('clearCache').addEventListener('click', async () => {
  const button = $('clearCache');
  button.disabled = true;
  try { $('cacheStatus').textContent = await photoCache.clear() ? 'Downloaded photos cleared.' : 'Photo cache is unavailable.'; }
  finally { button.disabled = false; }
});
// Quality switch: the choice persists and the page reloads so the renderer
// (antialiasing needs a fresh GL context) and textures pick it up cleanly.
for (const button of document.querySelectorAll('#qualitySettings [data-quality]')) {
  button.classList.toggle('selected', button.dataset.quality === getQuality());
  button.addEventListener('click', () => {
    if (button.dataset.quality === getQuality()) return;
    setQuality(button.dataset.quality);
    location.reload();
  });
}
const touch = new TouchControls(player, {
  available: app.profile.touch,
  onUse: () => { if (mode === 'explore') { const picked = interactions.pick(); picked?.target.activate(picked.hit); } },
  onTour: () => { overlay.hide(); startTour(); },
  onPause: () => {
    if (mode !== 'explore') return;
    player.clearInput(); player.enabled = false;
    overlay.showPaused();
  },
});
if (app.profile.touch) $('tourBadge').textContent = 'Guided tour · tap the gallery to take over';

function showFloors() {
  if (mode === 'riding') return;
  if (mode === 'touring') {
    tour.stop();
    hud.setTour(false);
    player.enabled = true;
    player.syncFromCamera();
  }
  activePanel?.close();
  overlay.hide();
  lobby.openDoors();
  openPanel(floorPanel);
}

function placeInElevator() {
  player.standUp();
  player.velocity.set(0, 0, 0);
  player.keys.clear();
  app.camera.position.fromArray(lobby.cabinPosition);
  player.euler.set(0, lobby.cabinYaw, 0); // face out of the recessed cabin into the hall
  app.camera.quaternion.setFromEuler(player.euler);
}

function rideElevator(index) {
  if (mode === 'riding' || !floors[index]) return;
  if (index === currentFloor) { closePanel(true); return; }
  closePanel(true); // Request pointer lock while the selection still has a user gesture.
  mode = 'riding';
  player.enabled = false;
  placeInElevator();
  hud.toast(`Elevator · ${floors[index].label}`, 2600);
  lobby.travelTo(index, () => {
    switchFloor(index);
    placeInElevator();
  }, () => {
    mode = 'explore';
    player.enabled = true;
    hud.toast(cinema ? 'Arrived · The Little Cinema · click the screen to choose a film' : `Arrived · ${floors[index].label}`, cinema ? 4200 : 2400);
    if (!player.active) overlay.showPaused();
  });
}

/** Replace only floor-owned resources; lobby and atmosphere persist. */
function switchFloor(index, initial = false) {
  if (!floors[index] || (!initial && index === currentFloor)) return;
  cinemaPanel.close();
  setWatchingUI(false);
  cinema?.dispose();
  cinema = null;
  curator?.dispose();
  for (const frame of frames) frame.dispose();
  if (!initial) {
    environment.dispose();
    layout = createLayout(floors[index]);
    environment = buildHall(app, layout);
    app.scene.add(environment.group);
  }
  currentFloor = index;
  frames = layout.slots.map(slot => new MediaFrame(slot));
  for (const frame of frames) app.scene.add(frame.group);
  curator = new Curator(frames, library, {
    media: app.mediaOptions,
    anisotropy: Math.min(8, app.maxAnisotropy),
    onProgress: p => { hud.setProgress(p); if (editor.isOpen) editor.refresh(); },
  });
  interactions.clear();
  interactions.addOccluders(environment.walls);
  for (const frame of frames) {
    interactions.add(frame.hitTargets, {
      caption: () => frame.item && {
        title: frame.item.title,
        subtitle: `${frame.item.subtitle}${frame.hasVideo && !frame.videoWanted ? ' · ▶ below plays the video' : ''} · click to curate`,
      },
      activate: () => openPanel(editor, frame),
    });
    // Dedicated opt-in playback button beside the plaque; the frame itself
    // still opens the curation panel, and gallery videos never autoplay.
    interactions.add([frame.playButton], {
      caption: () => {
        if (!frame.hasVideo) return null;
        return frame.videoWanted
          ? { title: 'Pause video', subtitle: 'Click to pause' }
          : { title: 'Play video', subtitle: 'Click to play · muted · loops' };
      },
      activate: () => { frame.toggleVideo(); },
    });
  }
  lobby.registerInteractions(interactions, showFloors);
  if (layout.cinema) createCinema();
  cinemaPanel.setHall(cinema);
  $('cinemaButton').classList.toggle('hidden', !cinema);
  $('watchCinema').classList.toggle('hidden', !cinema);
  cinema?.registerInteractions(interactions, {
    onScreen: () => openPanel(cinemaPanel),
    onSeat: seat => player.sit(seat),
  });
  player.standUp();
  player.velocity.set(0, 0, 0);
  player.keys.clear();
  const collides = createCollisionChecker(layout.colliders, CONFIG.player.radius);
  player.collides = position => collides(position) || lobby.blocksDoor(position, CONFIG.player.radius);
  app.camera.position.fromArray(layout.start.position);
  player.euler.set(0, layout.start.yaw, 0);
  app.camera.quaternion.setFromEuler(player.euler);
  tour.setFrames(frames);
  lobby.setCurrent(index);
  floorPanel.setCurrent(index);
  $('floorButton').textContent = `${floors[index].label} · ${app.profile.touch ? 'Change period' : 'M to change period'}`;
  hud.setProgress({ pending: 0, done: 0 });
  curator.hangAll();
}

function openPanel(panel, ...args) {
  setWatchingUI(false);
  if (activePanel && activePanel !== panel) activePanel.close();
  overlay.hide();
  mode = 'panel';
  activePanel = panel;
  hud.setHovered(null);
  player.unlock();
  player.clearInput();
  player.enabled = false;
  panel.open(...args);
}

function closePanel(resume) {
  if (activePanel === cinemaPanel && cinema?.film) { startWatching(); return; }
  activePanel?.close();
  activePanel = null;
  curator.preferredFrame = null;
  mode = 'explore';
  player.enabled = true;
  if (resume) player.lock(); else overlay.showPaused();
}

function setWatchingUI(watching) {
  document.body.classList.toggle('cinema-watching', watching);
  $('cinemaViewing').classList.toggle('hidden', !watching);
  cinema?.videoScreen.setInteractive(watching);
}

function startWatching() {
  if (!cinema) return;
  activePanel?.close(); activePanel = null;
  overlay.hide();
  mode = 'watching';
  player.standUp(); player.clearInput(); player.enabled = false; player.unlock();
  app.camera.position.copy(cinema.viewingPosition());
  app.camera.lookAt(cinema.lookAtScreen());
  player.syncFromCamera();
  hud.setHovered(null);
  setWatchingUI(true);
}

function leaveWatching() {
  setWatchingUI(false);
  mode = 'explore';
  player.syncFromCamera(); player.enabled = true; player.lock();
}

function startTour() {
  if (cinema) { overlay.hide(); openPanel(cinemaPanel); return; }
  mode = 'touring';
  player.standUp();
  player.enabled = false;
  player.clearInput();
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
  if (!player.active && mode === 'explore') {
    hud.setHovered(null);
    overlay.showPaused();
  }
});

app.canvas.addEventListener('click', () => {
  if (mode === 'touring') return stopTour();
  if (mode !== 'explore') return;
  if (player.touchEnabled) return;
  if (!player.locked) { overlay.hide(); return player.lock(); }
  const picked = interactions.pick();
  picked?.target.activate(picked.hit);
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'KeyM') { showFloors(); return; }
  if (e.code === 'KeyB') {
    music.toggle();
    hud.toast(music.wanted ? 'Background music on · B to stop' : 'Background music off');
    return;
  }
  if (e.code === 'Escape' && mode === 'watching') { leaveWatching(); return; }
  if (e.code === 'Escape' && mode === 'panel') closePanel(false);
  if (e.code === 'Escape' && mode === 'touring') { stopTour(); return; }
  if (e.code === 'KeyC' && (mode === 'explore' || mode === 'touring')) {
    if (mode === 'touring') stopTour(); else { overlay.hide(); startTour(); }
  }
  if (e.code === 'KeyR' && (mode === 'explore' || mode === 'touring')) {
    curator.shuffleAll();
    hud.toast('Rehanging the gallery…');
  }
  if (e.code === 'Space' && cinema?.film && (cinema.contains(app.camera.position) || activePanel === cinemaPanel)) {
    e.preventDefault();
    cinema.togglePause();
  }
});

// ─── Systems ────────────────────────────────────────────────────────────────
app.addSystem(player);
app.addSystem(tour);
app.addSystem({
  elapsed: 0,
  update(dt) {
    touch.setVisible(mode === 'explore' && !overlay.visible);
    if (mode !== 'explore' || !player.active || overlay.visible) return;
    this.elapsed += dt;
    if (this.elapsed < 0.1) return;
    this.elapsed = 0;
    const picked = interactions.pick();
    hud.setHovered(picked ? picked.target.caption(picked.hit) : null);
  },
});

app.addSystem({
  update(dt, app) {
    curator.update(dt, app);
    cinema?.update(dt, app);
    music.hold(!!cinema?.isPlaying);
  },
  onVisibilityChange(visible) { curator.onVisibilityChange(visible); cinema?.onVisibilityChange(visible); },
});
switchFloor(0, true);
app.start();

// Handy for poking at the scene from devtools during development.
if (import.meta.env.DEV) Object.assign(window, { museum: {
  app, library, floors, tour, player, lobby, touch, music, switchFloor, rideElevator,
  get cinema() { return cinema; }, get layout() { return layout; }, get frames() { return frames; },
  get curator() { return curator; }, get currentFloor() { return currentFloor; },
} });
