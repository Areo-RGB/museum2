import * as THREE from 'three';
import { EXHIBITS, getExhibitById, generateExhibitCanvas } from './artworks.js';
import { getSlotMedia } from '../storage/db.js';

function createBox(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTextCanvas(text, subtext = '', width = 512, height = 128, bgColor = '#07162c', textColor = '#ffffff', borderColor = '#60a5fa') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Hertha 03 Royal Blue/Navy Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  // Main text
  ctx.font = '700 22px "Cinzel", Georgia, serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '1.5px';
  ctx.fillText(text.toUpperCase(), width / 2, subtext ? 50 : 72);

  // Subtext if present
  if (subtext) {
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillStyle = borderColor;
    ctx.letterSpacing = '1px';
    ctx.fillText(subtext.toUpperCase(), width / 2, 84);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function buildGallery(renderer) {
  const group = new THREE.Group();
  const collisionMeshes = [];
  const frames = [];
  const videoElements = [];
  const transientUrls = [];

  // F.C. Hertha 03 Zehlendorf Materials (Blau-Weiß)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.88, metalness: 0.02 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xeeece6, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x091b33, roughness: 0.35, metalness: 0.15 });
  
  // Floor Materials
  const hallwayFloorMat = new THREE.MeshStandardMaterial({ color: 0xdcd8cf, roughness: 0.28, metalness: 0.04 });
  const runnerMat = new THREE.MeshStandardMaterial({ color: 0x004b93, roughness: 0.65, metalness: 0.06 }); // Hertha 03 Royal Blue Runner
  const tournamentFloorMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.22, metalness: 0.08 });
  const tripsFloorMat = new THREE.MeshStandardMaterial({ color: 0x141d2e, roughness: 0.25, metalness: 0.05 });
  const cabinetFloorMat = new THREE.MeshStandardMaterial({ color: 0x121b2b, roughness: 0.2, metalness: 0.08 });
  const sidelineFloorMat = new THREE.MeshStandardMaterial({ color: 0x152136, roughness: 0.25, metalness: 0.08 });
  const rotundaFloorMat = new THREE.MeshStandardMaterial({ color: 0x0d1f3b, roughness: 0.18, metalness: 0.12 });

  const H = 5.0; // Wall height
  const T = 0.3; // Wall thickness

  // -------------------------------------------------------------------------
  // 1. FLOORS & CEILINGS
  // -------------------------------------------------------------------------

  // A. Main Central Hallway Floor (Z: +26 to -34, X: -4 to 4)
  const hallFloor = createBox(8, 0.12, 60, hallwayFloorMat);
  hallFloor.position.set(0, -0.06, -4);
  group.add(hallFloor);

  // Central Blau-Weiß Runner Carpet down the hallway (Width 3.2m)
  const runner = createBox(3.2, 0.02, 59.8, runnerMat);
  runner.position.set(0, 0.01, -4);
  group.add(runner);

  // Main Hallway Ceiling
  const hallCeiling = createBox(8, 0.12, 60, ceilingMat);
  hallCeiling.position.set(0, H + 0.06, -4);
  group.add(hallCeiling);

  // B. Wing I West: Turniere & Berliner Pokal (X: -18 to -4, Z: 1 to 15)
  const tourFloor = createBox(14, 0.12, 14, tournamentFloorMat);
  tourFloor.position.set(-11, -0.06, 8);
  const tourCeil = createBox(14, 0.12, 14, ceilingMat);
  tourCeil.position.set(-11, H + 0.06, 8);
  group.add(tourFloor, tourCeil);

  // C. Wing I East: Ausflüge, Camps & Feste (X: 4 to 18, Z: 1 to 15)
  const tripsFloor = createBox(14, 0.12, 14, tripsFloorMat);
  tripsFloor.position.set(11, -0.06, 8);
  const tripsCeil = createBox(14, 0.12, 14, ceilingMat);
  tripsCeil.position.set(11, H + 0.06, 8);
  group.add(tripsFloor, tripsCeil);

  // D. Wing II West: Pokalschrank & Ehrungen (X: -18 to -4, Z: -21 to -7)
  const cabinetFloor = createBox(14, 0.12, 14, cabinetFloorMat);
  cabinetFloor.position.set(-11, -0.06, -14);
  const cabinetCeil = createBox(14, 0.12, 14, ceilingMat);
  cabinetCeil.position.set(-11, H + 0.06, -14);
  group.add(cabinetFloor, cabinetCeil);

  // E. Wing II East: Trainer & Eltern (X: 4 to 18, Z: -21 to -7)
  const sidelineFloor = createBox(14, 0.12, 14, sidelineFloorMat);
  sidelineFloor.position.set(11, -0.06, -14);
  const sidelineCeil = createBox(14, 0.12, 14, ceilingMat);
  sidelineCeil.position.set(11, H + 0.06, -14);
  group.add(sidelineFloor, sidelineCeil);

  // F. Die 2014er Ehrenhalle (Rotunde: X: -9 to 9, Z: -46 to -34)
  const rotundaFloor = createBox(18, 0.12, 12, rotundaFloorMat);
  rotundaFloor.position.set(0, -0.06, -40);
  const rotundaCeil = createBox(18, 0.12, 12, ceilingMat);
  rotundaCeil.position.set(0, H + 0.06, -40);
  group.add(rotundaFloor, rotundaCeil);

  // -------------------------------------------------------------------------
  // 2. ARCHITECTURAL WALLS & DOORWAYS
  // -------------------------------------------------------------------------

  function addWall(w, h, d, x, y, z, mat = wallMat) {
    const wall = createBox(w, h, d, mat);
    wall.position.set(x, y, z);
    group.add(wall);
    collisionMeshes.push(wall);
    return wall;
  }

  // Entrance Wall at Z = 26
  addWall(8 + T*2, H, T, 0, H/2, 26);

  // Hallway Left Wall Segments (X = -4)
  addWall(T, H, 11, -4, H/2, 20.5);
  addWall(T, H, 5.5, -4, H/2, 12.25);
  addWall(T, H, 5.5, -4, H/2, 3.75);
  const lintelTour = createBox(T, 1.6, 3.0, wallMat);
  lintelTour.position.set(-4, H - 0.8, 8);
  group.add(lintelTour);
  collisionMeshes.push(lintelTour);

  addWall(T, H, 8, -4, H/2, -3);

  addWall(T, H, 5.5, -4, H/2, -9.75);
  addWall(T, H, 5.5, -4, H/2, -18.25);
  const lintelCabinet = createBox(T, 1.6, 3.0, wallMat);
  lintelCabinet.position.set(-4, H - 0.8, -14);
  group.add(lintelCabinet);
  collisionMeshes.push(lintelCabinet);

  addWall(T, H, 13, -4, H/2, -27.5);

  // Hallway Right Wall Segments (X = +4)
  addWall(T, H, 11, 4, H/2, 20.5);
  addWall(T, H, 5.5, 4, H/2, 12.25);
  addWall(T, H, 5.5, 4, H/2, 3.75);
  const lintelTrips = createBox(T, 1.6, 3.0, wallMat);
  lintelTrips.position.set(4, H - 0.8, 8);
  group.add(lintelTrips);
  collisionMeshes.push(lintelTrips);

  addWall(T, H, 8, 4, H/2, -3);

  addWall(T, H, 5.5, 4, H/2, -9.75);
  addWall(T, H, 5.5, 4, H/2, -18.25);
  const lintelSideline = createBox(T, 1.6, 3.0, wallMat);
  lintelSideline.position.set(4, H - 0.8, -14);
  group.add(lintelSideline);
  collisionMeshes.push(lintelSideline);

  addWall(T, H, 13, 4, H/2, -27.5);

  // Outer Room Walls
  addWall(T, H, 14, -18, H/2, 8);
  addWall(14, H, T, -11, H/2, 15);
  addWall(14, H, T, -11, H/2, 1);

  addWall(T, H, 14, 18, H/2, 8);
  addWall(14, H, T, 11, H/2, 15);
  addWall(14, H, T, 11, H/2, 1);

  addWall(T, H, 14, -18, H/2, -14);
  addWall(14, H, T, -11, H/2, -7);
  addWall(14, H, T, -11, H/2, -21);

  addWall(T, H, 14, 18, H/2, -14);
  addWall(14, H, T, 11, H/2, -7);
  addWall(14, H, T, 11, H/2, -21);

  // Rotunda Walls
  addWall(18 + T*2, H, T, 0, H/2, -46);
  addWall(T, H, 12, -9, H/2, -40);
  addWall(T, H, 12, 9, H/2, -40);
  addWall(5, H, T, -6.5, H/2, -34);
  addWall(5, H, T, 6.5, H/2, -34);
  const rotundaLintel = createBox(8, 1.4, T, wallMat);
  rotundaLintel.position.set(0, H - 0.7, -34);
  group.add(rotundaLintel);
  collisionMeshes.push(rotundaLintel);

  // -------------------------------------------------------------------------
  // 3. ARCHWAY HEADERS & THEMATIC SIGNAGE
  // -------------------------------------------------------------------------

  function addSignagePlaque(text, sub, x, y, z, rotY, w = 2.6, h = 0.65) {
    const tex = createTextCanvas(text, sub, 512, 128);
    const plaqueMat = new THREE.MeshBasicMaterial({ map: tex });
    const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plaqueMat);
    plaqueMesh.position.set(x, y, z);
    plaqueMesh.rotation.y = rotY;
    group.add(plaqueMesh);

    const backing = createBox(w + 0.12, h + 0.08, 0.04, trimMat);
    backing.position.copy(plaqueMesh.position);
    backing.rotation.copy(plaqueMesh.rotation);
    const normal = new THREE.Vector3(0, 0, -0.025).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    backing.position.add(normal);
    group.add(backing);
  }

  // Wing Doorway Plaques
  addSignagePlaque('Turniere & Berliner Pokal', 'Flügel I · Sommerturniere & Neunmeter', -3.82, 3.65, 8, Math.PI / 2);
  addSignagePlaque('Ausflüge, Camps & Feste', 'Flügel I · Hertha 03 auf Tour', 3.82, 3.65, 8, -Math.PI / 2);
  addSignagePlaque('Pokalschrank & Ehrungen', 'Flügel II · Staffelsieger & Fair Play', -3.82, 3.65, -14, Math.PI / 2);
  addSignagePlaque('Trainer & Hertha-Eltern', 'Flügel II · Die 03-Familie am Spielfeldrand', 3.82, 3.65, -14, -Math.PI / 2);
  addSignagePlaque('Die 2014er Ehrenhalle', 'F.C. Hertha 03 Zehlendorf e.V.', 0, 3.8, -33.82, 0, 3.4, 0.75);

  // Central Hallway Timeline Age Banners
  addSignagePlaque('2018–2020: Minis & F-Jugend', 'Erste Schritte am Siebenendenweg', -3.82, 3.85, 20.5, Math.PI / 2, 3.2, 0.6);
  addSignagePlaque('2021–2023: E-Jugend & Teamgeist', 'Große Tore, Hallencups & Kombinationen', -3.82, 3.85, -3, Math.PI / 2, 3.2, 0.6);
  addSignagePlaque('2024–2026: D-Jugend & Großfeld', 'Flutlichtabende & Schritt zum 11v11', -3.82, 3.85, -27.5, Math.PI / 2, 3.4, 0.6);

  // -------------------------------------------------------------------------
  // 4. LIGHTING SYSTEM
  // -------------------------------------------------------------------------

  const ambient = new THREE.HemisphereLight(0xf0f7ff, 0x828fa3, 1.8);
  group.add(ambient);

  const dirLight1 = new THREE.DirectionalLight(0xfffaed, 0.9);
  dirLight1.position.set(5, 12, 10);
  const dirLight2 = new THREE.DirectionalLight(0xfffaed, 0.8);
  dirLight2.position.set(-5, 12, -20);
  group.add(dirLight1, dirLight2);

  // Hallway Downlights
  for (let z = 22; z >= -30; z -= 7) {
    const ptLight = new THREE.PointLight(0xfff5e6, 8, 12, 1.8);
    ptLight.position.set(0, H - 0.4, z);
    group.add(ptLight);
  }

  // Side Room Ambient Lights
  const roomLights = [
    { x: -11, z: 8, col: 0xfff0db },   // Turniere
    { x: 11, z: 8, col: 0xe6f2ff },    // Ausflüge
    { x: -11, z: -14, col: 0xfffae6 }, // Pokalschrank
    { x: 11, z: -14, col: 0xeef5ff },  // Trainer & Eltern
    { x: 0, z: -40, col: 0xfffae6 },   // Rotunde
  ];
  roomLights.forEach(rl => {
    const light = new THREE.PointLight(rl.col, 18, 18, 1.6);
    light.position.set(rl.x, H - 0.4, rl.z);
    group.add(light);
  });

  // -------------------------------------------------------------------------
  // 5. EXHIBIT FRAMES PLACEMENT
  // -------------------------------------------------------------------------

  const SLOT_CONFIGS = {
    // --- Central Hallway Minis / F-Jugend ---
    'hall-u8-1': { pos: new THREE.Vector3(-3.85, 2.35, 22.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-u8-2': { pos: new THREE.Vector3(3.85, 2.35, 22.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-u8-3': { pos: new THREE.Vector3(-3.85, 2.35, 17.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Wing I West: Turniere ---
    'tournament-1': { pos: new THREE.Vector3(-11, 2.45, 14.85), rotY: Math.PI, w: 4.2, h: 2.4 },
    'tournament-2': { pos: new THREE.Vector3(-17.85, 2.45, 8.0), rotY: Math.PI / 2, w: 4.4, h: 2.5 },
    'tournament-3': { pos: new THREE.Vector3(-11, 2.35, 1.15), rotY: 0, w: 3.2, h: 2.2 },
    'tournament-4': { pos: new THREE.Vector3(-4.15, 2.35, 12.5), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Wing I East: Ausflüge & Feste ---
    'trips-1': { pos: new THREE.Vector3(11, 2.45, 14.85), rotY: Math.PI, w: 4.2, h: 2.4 },
    'trips-2': { pos: new THREE.Vector3(17.85, 2.45, 8.0), rotY: -Math.PI / 2, w: 4.4, h: 2.5 },
    'trips-3': { pos: new THREE.Vector3(11, 2.35, 1.15), rotY: 0, w: 3.2, h: 2.2 },
    'trips-4': { pos: new THREE.Vector3(4.15, 2.35, 12.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Central Hallway E-Jugend ---
    'hall-u12-1': { pos: new THREE.Vector3(-3.85, 2.35, -1.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-u12-2': { pos: new THREE.Vector3(3.85, 2.35, -1.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-u12-3': { pos: new THREE.Vector3(-3.85, 2.35, -5.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Wing II West: Pokalschrank ---
    'cabinet-1': { pos: new THREE.Vector3(-17.85, 2.45, -14.0), rotY: Math.PI / 2, w: 4.4, h: 2.5 },
    'cabinet-2': { pos: new THREE.Vector3(-11, 2.45, -6.85), rotY: 0, w: 4.2, h: 2.4 },
    'cabinet-3': { pos: new THREE.Vector3(-11, 2.35, -20.85), rotY: Math.PI, w: 3.2, h: 2.2 },
    'cabinet-4': { pos: new THREE.Vector3(-4.15, 2.35, -9.5), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Wing II East: Trainer & Eltern ---
    'sideline-1': { pos: new THREE.Vector3(17.85, 2.45, -14.0), rotY: -Math.PI / 2, w: 4.4, h: 2.5 },
    'sideline-2': { pos: new THREE.Vector3(11, 2.45, -6.85), rotY: 0, w: 4.2, h: 2.4 },
    'sideline-3': { pos: new THREE.Vector3(11, 2.35, -20.85), rotY: Math.PI, w: 3.2, h: 2.2 },
    'sideline-4': { pos: new THREE.Vector3(4.15, 2.35, -9.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Central Hallway D-Jugend ---
    'hall-u15-1': { pos: new THREE.Vector3(-3.85, 2.35, -25.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-u15-2': { pos: new THREE.Vector3(3.85, 2.35, -25.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Die 2014er Ehrenhalle ---
    'rotunda-hero': { pos: new THREE.Vector3(0, 2.65, -45.85), rotY: 0, w: 5.6, h: 3.2 },
    'rotunda-left': { pos: new THREE.Vector3(-8.85, 2.45, -40.0), rotY: Math.PI / 2, w: 3.6, h: 2.4 },
    'rotunda-right': { pos: new THREE.Vector3(8.85, 2.45, -40.0), rotY: -Math.PI / 2, w: 3.6, h: 2.4 },
  };

  for (const exhibit of EXHIBITS) {
    const cfg = SLOT_CONFIGS[exhibit.id];
    if (!cfg) continue;

    const frame = await createMuseumFrame(exhibit, cfg, renderer, videoElements, transientUrls);
    frames.push(frame);
    group.add(frame.group);

    const spot = new THREE.SpotLight(0xfff3d6, 32, 7.5, Math.PI / 6, 0.45, 1.4);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cfg.rotY);
    spot.position.copy(cfg.pos).add(normal.clone().multiplyScalar(1.85)).add(new THREE.Vector3(0, 1.5, 0));
    spot.target.position.copy(cfg.pos);
    group.add(spot, spot.target);
  }

  return { group, frames, collisionMeshes, videoElements, transientUrls };
}

async function createMuseumFrame(exhibit, cfg, renderer, videoElements, transientUrls) {
  const group = new THREE.Group();
  group.position.copy(cfg.pos);
  group.rotation.y = cfg.rotY;

  const W = cfg.w;
  const H = cfg.h;
  const b = 0.12, d = 0.14;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x0c1e36, roughness: 0.35, metalness: 0.15 });
  const innerGoldMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3, metalness: 0.4 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x071120, roughness: 0.9 });

  const top = createBox(W + b*2, b, d, woodMat); top.position.y = H/2 + b/2;
  const bot = top.clone(); bot.position.y = -H/2 - b/2;
  const left = createBox(b, H, d, woodMat); left.position.x = -W/2 - b/2;
  const right = left.clone(); right.position.x = W/2 + b/2;

  const gB = 0.035;
  const gTop = createBox(W, gB, d * 0.9, innerGoldMat); gTop.position.set(0, H/2 - gB/2, 0.01);
  const gBot = gTop.clone(); gBot.position.y = -H/2 + gB/2;
  const gLeft = createBox(gB, H, d * 0.9, innerGoldMat); gLeft.position.set(-W/2 + gB/2, 0, 0.01);
  const gRight = gLeft.clone(); gRight.position.x = W/2 - gB/2;

  const backing = createBox(W, H, 0.04, backMat);
  backing.position.z = 0.04;

  group.add(top, bot, left, right, gTop, gBot, gLeft, gRight, backing);

  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.92), screenMat);
  screen.position.z = 0.075;
  screen.userData.isMediaScreen = true;
  screen.userData.slotId = exhibit.id;
  group.add(screen);

  // Plaque below frame
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 100;
  const pCtx = plaqueCanvas.getContext('2d');
  pCtx.fillStyle = '#061324';
  pCtx.fillRect(0, 0, 512, 100);
  pCtx.strokeStyle = '#60a5fa';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(4, 4, 504, 92);
  pCtx.font = '600 19px "Cinzel", Georgia, serif';
  pCtx.fillStyle = '#ffffff';
  pCtx.textAlign = 'center';
  pCtx.fillText(exhibit.title, 256, 40);
  pCtx.font = '400 13px Inter, sans-serif';
  pCtx.fillStyle = '#93c5fd';
  pCtx.fillText(exhibit.subtitle, 256, 72);
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W * 0.7, 1.8), 0.35), new THREE.MeshBasicMaterial({ map: plaqueTex }));
  plaqueMesh.position.set(0, -H/2 - b - 0.26, 0.07);
  group.add(plaqueMesh);

  const frame = {
    group,
    screen,
    slot: { id: exhibit.id, exhibit },
    exhibit,
    fit: 'cover',
    current: null
  };

  const saved = await getSlotMedia(exhibit.id);
  if (saved?.blob) {
    const url = URL.createObjectURL(saved.blob);
    transientUrls.push(url);
    await applyMedia(frame, { url, type: saved.type, fit: saved.fit || 'cover', persistent: true }, renderer, videoElements);
  } else {
    const defaultCanvas = generateExhibitCanvas(exhibit);
    await applyCanvasMedia(frame, defaultCanvas, renderer);
  }

  return frame;
}

export async function applyCanvasMedia(frame, canvas, renderer) {
  const old = frame.current;
  if (old?.texture) old.texture.dispose();
  if (old?.video) { old.video.pause(); old.video.removeAttribute('src'); old.video.load(); }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  frame.screen.material.map = texture;
  frame.screen.material.needsUpdate = true;
  frame.fit = 'cover';
  frame.current = { texture, canvas, type: 'canvas', isDefault: true };
  updateFit(frame);
}

export async function applyMedia(frame, media, renderer, videoElements) {
  const old = frame.current;
  if (old?.texture) old.texture.dispose();
  if (old?.video) { old.video.pause(); old.video.removeAttribute('src'); old.video.load(); }

  let texture, video = null;
  if (media.type?.startsWith('video')) {
    video = document.createElement('video');
    video.src = media.url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try { await video.play(); } catch {}
    texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    videoElements.push(video);
  } else {
    texture = await new THREE.TextureLoader().loadAsync(media.url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  frame.screen.material.map = texture;
  frame.screen.material.needsUpdate = true;
  frame.fit = media.fit || 'cover';
  frame.current = { texture, video, type: media.type, url: media.url, isDefault: false };
  updateFit(frame);
}

export function updateFit(frame) {
  const tex = frame.current?.texture;
  if (!tex) return;
  const img = frame.current.video || frame.current.canvas || tex.image;
  const iw = img?.videoWidth || img?.naturalWidth || img?.width || 1;
  const ih = img?.videoHeight || img?.naturalHeight || img?.height || 1;
  const imageAspect = iw / ih;
  const screenAspect = frame.screen.geometry.parameters.width / frame.screen.geometry.parameters.height;

  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);

  if (frame.fit === 'contain') {
    if (imageAspect > screenAspect) {
      tex.repeat.y = screenAspect / imageAspect;
    } else {
      tex.repeat.x = imageAspect / screenAspect;
    }
  } else {
    if (imageAspect > screenAspect) {
      tex.repeat.x = screenAspect / imageAspect;
    } else {
      tex.repeat.y = imageAspect / screenAspect;
    }
  }
  tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
  tex.needsUpdate = true;
}

export function defaultMediaFor(slot) {
  return generateExhibitCanvas(slot.exhibit || getExhibitById(slot.id));
}
