import * as THREE from 'three';
import { PlayerController } from './controls/player.js';
import { createCollisionChecker } from './controls/collision.js';
import { buildGallery, applyMedia, applyCanvasMedia, updateFit, defaultMediaFor } from './scene/gallery.js';
import { saveSlotMedia, deleteSlotMedia, getSlotMedia } from './storage/db.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181716);
scene.fog = new THREE.Fog(0x181716, 22, 60);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 100);
// Spawn at the 1980s Entrance, looking down the timeline hallway towards -Z
camera.position.set(0, 1.65, 24.5);
camera.lookAt(0, 1.65, -10);

const player = new PlayerController(camera, canvas);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 6.2;

let gallery, collisionCheck;
let selectedFrame = null;
let cinematic = false;
let cinematicStart = 0;

// UI Elements
const startModal = document.getElementById('start');
const editorModal = document.getElementById('editor');
const editorTitle = document.getElementById('editorTitle');
const editorRoom = document.getElementById('editorRoom');
const editorDesc = document.getElementById('editorDesc');
const mediaInput = document.getElementById('mediaInput');
const fitSelect = document.getElementById('fit');
const customNoteInput = document.getElementById('customNote');
const cinematicBadge = document.getElementById('cinematicBadge');
const locationBadge = document.getElementById('locationBadge');
const plaqueHud = document.getElementById('plaqueHud');
const plaqueYear = document.getElementById('plaqueYear');
const plaqueTitle = document.getElementById('plaqueTitle');
const plaqueDesc = document.getElementById('plaqueDesc');
const directoryModal = document.getElementById('directoryModal');

// Museum Waypoints for Fast Travel & Cinematic Tour
export const ROOM_WAYPOINTS = {
  'entrance': { label: 'Entrance & 1980s Era', x: 0, z: 23, yaw: 0 },
  'trophy': { label: 'Wing I: Trophy & Silverware Hall', x: -11, z: 8, yaw: Math.PI / 2 },
  'derby': { label: 'Wing I: Epic Derbies & Clashes', x: 11, z: 8, yaw: -Math.PI / 2 },
  'golden': { label: 'Central Hallway: 1990s-2000s Golden Age', x: 0, z: -2, yaw: 0 },
  'continental': { label: 'Wing II: Continental Tournaments', x: -11, z: -14, yaw: Math.PI / 2 },
  'legends': { label: 'Wing II: Club Legends & Ballon d\'Or', x: 11, z: -14, yaw: -Math.PI / 2 },
  'rotunda': { label: 'Champions Rotunda & Centenary Pavilion', x: 0, z: -38, yaw: 0 }
};

// Cinematic spline path points
const TOUR_NODES = [
  { pos: new THREE.Vector3(0, 1.8, 23), target: new THREE.Vector3(0, 1.8, 15) },
  { pos: new THREE.Vector3(0, 1.8, 14), target: new THREE.Vector3(-8, 2.0, 8) },
  { pos: new THREE.Vector3(-8, 1.8, 8), target: new THREE.Vector3(-17, 2.3, 8) },
  { pos: new THREE.Vector3(-14, 1.8, 8), target: new THREE.Vector3(-11, 2.3, 14.5) },
  { pos: new THREE.Vector3(-7, 1.8, 8), target: new THREE.Vector3(0, 1.8, 5) },
  { pos: new THREE.Vector3(0, 1.8, 8), target: new THREE.Vector3(12, 2.0, 8) },
  { pos: new THREE.Vector3(8, 1.8, 8), target: new THREE.Vector3(17, 2.3, 8) },
  { pos: new THREE.Vector3(4, 1.8, 8), target: new THREE.Vector3(0, 1.8, -2) },
  { pos: new THREE.Vector3(0, 1.8, 0), target: new THREE.Vector3(0, 1.8, -10) },
  { pos: new THREE.Vector3(0, 1.8, -8), target: new THREE.Vector3(-10, 2.0, -14) },
  { pos: new THREE.Vector3(-10, 1.8, -14), target: new THREE.Vector3(-17, 2.3, -14) },
  { pos: new THREE.Vector3(-3, 1.8, -14), target: new THREE.Vector3(10, 2.0, -14) },
  { pos: new THREE.Vector3(10, 1.8, -14), target: new THREE.Vector3(17, 2.3, -14) },
  { pos: new THREE.Vector3(2, 1.8, -14), target: new THREE.Vector3(0, 1.8, -26) },
  { pos: new THREE.Vector3(0, 1.8, -26), target: new THREE.Vector3(0, 2.4, -45) },
  { pos: new THREE.Vector3(0, 1.9, -38), target: new THREE.Vector3(0, 2.6, -45.8) }
];

async function init() {
  gallery = await buildGallery(renderer);
  scene.add(gallery.group);
  collisionCheck = createCollisionChecker(gallery.collisionMeshes);
  setupEventListeners();
  animate();
}

function setupEventListeners() {
  // Enter Gallery
  document.getElementById('enter').addEventListener('click', () => {
    startModal.classList.add('hidden');
    player.lock();
  });

  // Editor actions
  document.getElementById('resume').addEventListener('click', closeEditorAndResume);
  document.getElementById('closeEditor').addEventListener('click', closeEditorAndResume);

  // Reset frame to curated historical artwork
  document.getElementById('resetFrame').addEventListener('click', async () => {
    if (!selectedFrame) return;
    await deleteSlotMedia(selectedFrame.slot.id);
    selectedFrame.fit = 'cover';
    const defaultCanvas = defaultMediaFor(selectedFrame.slot);
    await applyCanvasMedia(selectedFrame, defaultCanvas, renderer);
    fitSelect.value = 'cover';
    if (customNoteInput) customNoteInput.value = '';
    document.getElementById('editorStatus').textContent = 'Frame restored to official historical museum artwork.';
  });

  // Change Fit (Cover / Contain)
  fitSelect.addEventListener('change', async () => {
    if (!selectedFrame) return;
    selectedFrame.fit = fitSelect.value;
    updateFit(selectedFrame);
    const saved = await getSlotMedia(selectedFrame.slot.id);
    if (saved) {
      await saveSlotMedia({ ...saved, fit: fitSelect.value });
    }
  });

  // Save custom note/caption
  if (customNoteInput) {
    customNoteInput.addEventListener('input', async () => {
      if (!selectedFrame) return;
      const saved = await getSlotMedia(selectedFrame.slot.id) || { slotId: selectedFrame.slot.id };
      saved.customNotes = customNoteInput.value;
      await saveSlotMedia(saved);
    });
  }

  // Upload custom photo / video
  mediaInput.addEventListener('change', async () => {
    const file = mediaInput.files?.[0];
    if (!file || !selectedFrame) return;
    const url = URL.createObjectURL(file);
    gallery.transientUrls.push(url);
    await applyMedia(selectedFrame, { url, type: file.type, fit: fitSelect.value, persistent: true }, renderer, gallery.videoElements);
    await saveSlotMedia({
      slotId: selectedFrame.slot.id,
      blob: file,
      type: file.type,
      fit: fitSelect.value,
      name: file.name,
      customNotes: customNoteInput?.value || ''
    });
    document.getElementById('editorStatus').textContent = `Uploaded "${file.name}" saved in browser storage.`;
    mediaInput.value = '';
  });

  // Frame Click
  canvas.addEventListener('click', () => {
    if (!player.locked || cinematic) return;
    const frame = aimedFrame();
    if (frame) openEditor(frame);
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !isEditorOpen() && !isDirectoryOpen()) {
      toggleCinematic();
    }
    if (e.code === 'KeyM' && !isEditorOpen()) {
      toggleDirectory();
    }
    if (e.code === 'Escape') {
      if (isEditorOpen()) closeEditorAndResume();
      if (isDirectoryOpen()) closeDirectory();
    }
  });

  // Directory / Room Guide
  const openDirectoryBtn = document.getElementById('openDirectoryBtn');
  if (openDirectoryBtn) {
    openDirectoryBtn.addEventListener('click', toggleDirectory);
  }
  const closeDirectoryBtn = document.getElementById('closeDirectoryBtn');
  if (closeDirectoryBtn) {
    closeDirectoryBtn.addEventListener('click', closeDirectory);
  }

  // Fast Travel buttons in directory
  document.querySelectorAll('[data-teleport]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomKey = e.currentTarget.getAttribute('data-teleport');
      teleportToRoom(roomKey);
      closeDirectory();
    });
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function aimedFrame() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const screens = gallery.frames.map(f => f.screen);
  const hits = raycaster.intersectObjects(screens, false);
  if (hits.length > 0 && hits[0].distance < 6.2) {
    return gallery.frames.find(f => f.screen === hits[0].object);
  }
  return null;
}

function updateAimedPlaqueHUD() {
  if (!player.locked || cinematic) {
    plaqueHud.style.display = 'none';
    return;
  }
  const frame = aimedFrame();
  if (frame && frame.exhibit) {
    plaqueHud.style.display = 'block';
    plaqueYear.textContent = `${frame.exhibit.era} · ${frame.exhibit.room}`;
    plaqueTitle.textContent = frame.exhibit.title;
    plaqueDesc.textContent = frame.exhibit.subtitle;
  } else {
    plaqueHud.style.display = 'none';
  }
}

function updateLocationHUD() {
  const x = camera.position.x;
  const z = camera.position.z;
  let loc = 'Central Hallway · 1980s Era';

  if (z <= -34) {
    loc = 'Champions Rotunda · Centenary Pavilion';
  } else if (x < -4 && z >= 1 && z <= 15) {
    loc = 'Left Wing · Trophy & Silverware Hall';
  } else if (x > 4 && z >= 1 && z <= 15) {
    loc = 'Right Wing · Epic Derbies & Rivalry Clashes';
  } else if (x < -4 && z >= -21 && z <= -7) {
    loc = 'Left Wing · Continental Tournaments';
  } else if (x > 4 && z >= -21 && z <= -7) {
    loc = 'Right Wing · Club Legends & Ballon d\'Or';
  } else {
    if (z > 10) loc = 'Central Hallway · 1980s: Early Era';
    else if (z >= -10) loc = 'Central Hallway · 1990s-2000s: Golden Age';
    else loc = 'Central Hallway · 2010s-2020s: Modern Dynasties';
  }

  locationBadge.textContent = loc;
}

async function openEditor(frame) {
  selectedFrame = frame;
  player.unlock();
  const exhibit = frame.exhibit;

  editorTitle.textContent = exhibit.title;
  editorRoom.textContent = `${exhibit.room} · ${exhibit.era}`;
  editorDesc.textContent = exhibit.desc;
  fitSelect.value = frame.fit || 'cover';

  const saved = await getSlotMedia(frame.slot.id);
  if (customNoteInput) {
    customNoteInput.value = saved?.customNotes || '';
  }

  document.getElementById('editorStatus').textContent = saved?.blob
    ? `Custom file: ${saved.name || 'Stored media'}`
    : 'Displaying official historical archive artwork.';

  editorModal.style.display = 'block';
}

function closeEditorAndResume() {
  editorModal.style.display = 'none';
  selectedFrame = null;
  player.lock();
}

function isEditorOpen() {
  return editorModal.style.display === 'block';
}

function toggleDirectory() {
  if (isDirectoryOpen()) closeDirectory();
  else openDirectory();
}

function openDirectory() {
  player.unlock();
  directoryModal.style.display = 'block';
}

function closeDirectory() {
  directoryModal.style.display = 'none';
  player.lock();
}

function isDirectoryOpen() {
  return directoryModal.style.display === 'block';
}

function teleportToRoom(roomKey) {
  const wp = ROOM_WAYPOINTS[roomKey];
  if (!wp) return;
  player.teleportTo(wp.x, wp.z, wp.yaw);
}

function toggleCinematic() {
  cinematic = !cinematic;
  player.enabled = !cinematic;
  cinematicBadge.style.display = cinematic ? 'block' : 'none';
  if (cinematic) {
    player.unlock();
    cinematicStart = performance.now();
  } else {
    player.lock();
  }
}

function updateCinematic() {
  if (!cinematic) return;
  const elapsed = (performance.now() - cinematicStart) / 1000;
  const tourDuration = 48; // 48 seconds total loop for all wings
  const progress = (elapsed % tourDuration) / tourDuration;

  const totalSegments = TOUR_NODES.length;
  const segmentProgress = progress * totalSegments;
  const index = Math.floor(segmentProgress);
  const frac = segmentProgress - index;

  const curr = TOUR_NODES[index];
  const next = TOUR_NODES[(index + 1) % totalSegments];

  // Smooth Hermite / Cosine interpolation
  const smoothFrac = 0.5 * (1 - Math.cos(frac * Math.PI));

  camera.position.lerpVectors(curr.pos, next.pos, smoothFrac);
  const currentTarget = new THREE.Vector3().lerpVectors(curr.target, next.target, smoothFrac);
  camera.lookAt(currentTarget);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt, collisionCheck);
  updateCinematic();
  updateLocationHUD();
  updateAimedPlaqueHUD();

  renderer.render(scene, camera);
}

init();
