import * as THREE from 'three';
import { EXHIBITS, getExhibitById, generateExhibitCanvas } from './artworks.js';
import { getSlotMedia } from '../storage/db.js';

function createBox(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTextCanvas(text, subtext = '', width = 512, height = 128, bgColor = '#181b22', textColor = '#f4ebd0', borderColor = '#d4a362') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  // Main text
  ctx.font = '700 24px "Cinzel", Georgia, serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  ctx.fillText(text.toUpperCase(), width / 2, subtext ? 52 : 72);

  // Subtext if present
  if (subtext) {
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillStyle = borderColor;
    ctx.letterSpacing = '1px';
    ctx.fillText(subtext.toUpperCase(), width / 2, 86);
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

  // Museum Materials
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3efe8, roughness: 0.88, metalness: 0.02 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xede9e1, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.4, metalness: 0.1 });
  
  // Floor Materials
  const hallwayFloorMat = new THREE.MeshStandardMaterial({ color: 0xded9cf, roughness: 0.28, metalness: 0.05 });
  const runnerMat = new THREE.MeshStandardMaterial({ color: 0x142033, roughness: 0.72, metalness: 0.05 });
  const trophyFloorMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.22, metalness: 0.08 });
  const derbyFloorMat = new THREE.MeshStandardMaterial({ color: 0x1f1618, roughness: 0.25, metalness: 0.05 });
  const continentalFloorMat = new THREE.MeshStandardMaterial({ color: 0x101a2b, roughness: 0.2, metalness: 0.08 });
  const legendsFloorMat = new THREE.MeshStandardMaterial({ color: 0x1b1522, roughness: 0.25, metalness: 0.08 });
  const rotundaFloorMat = new THREE.MeshStandardMaterial({ color: 0x26221b, roughness: 0.18, metalness: 0.12 });

  const H = 5.0; // Wall height
  const T = 0.3; // Wall thickness

  // -------------------------------------------------------------------------
  // 1. FLOORS & CEILINGS
  // -------------------------------------------------------------------------

  // A. Main Central Hallway Floor (Z: +26 to -34, X: -4 to 4)
  const hallFloor = createBox(8, 0.12, 60, hallwayFloorMat);
  hallFloor.position.set(0, -0.06, -4);
  group.add(hallFloor);

  // Central Velvet Runner Carpet down the hallway (Width 3.2m)
  const runner = createBox(3.2, 0.02, 59.8, runnerMat);
  runner.position.set(0, 0.01, -4);
  group.add(runner);

  // Main Hallway Ceiling
  const hallCeiling = createBox(8, 0.12, 60, ceilingMat);
  hallCeiling.position.set(0, H + 0.06, -4);
  group.add(hallCeiling);

  // B. Left Wing 1 Floor & Ceiling (Trophy Room: X: -18 to -4, Z: 1 to 15)
  const trophyFloor = createBox(14, 0.12, 14, trophyFloorMat);
  trophyFloor.position.set(-11, -0.06, 8);
  const trophyCeil = createBox(14, 0.12, 14, ceilingMat);
  trophyCeil.position.set(-11, H + 0.06, 8);
  group.add(trophyFloor, trophyCeil);

  // C. Right Wing 1 Floor & Ceiling (Derby Room: X: 4 to 18, Z: 1 to 15)
  const derbyFloor = createBox(14, 0.12, 14, derbyFloorMat);
  derbyFloor.position.set(11, -0.06, 8);
  const derbyCeil = createBox(14, 0.12, 14, ceilingMat);
  derbyCeil.position.set(11, H + 0.06, 8);
  group.add(derbyFloor, derbyCeil);

  // D. Left Wing 2 Floor & Ceiling (Continental Room: X: -18 to -4, Z: -21 to -7)
  const continentalFloor = createBox(14, 0.12, 14, continentalFloorMat);
  continentalFloor.position.set(-11, -0.06, -14);
  const continentalCeil = createBox(14, 0.12, 14, ceilingMat);
  continentalCeil.position.set(-11, H + 0.06, -14);
  group.add(continentalFloor, continentalCeil);

  // E. Right Wing 2 Floor & Ceiling (Legends Room: X: 4 to 18, Z: -21 to -7)
  const legendsFloor = createBox(14, 0.12, 14, legendsFloorMat);
  legendsFloor.position.set(11, -0.06, -14);
  const legendsCeil = createBox(14, 0.12, 14, ceilingMat);
  legendsCeil.position.set(11, H + 0.06, -14);
  group.add(legendsFloor, legendsCeil);

  // F. Champions Rotunda Floor & Ceiling (X: -9 to 9, Z: -46 to -34)
  const rotundaFloor = createBox(18, 0.12, 12, rotundaFloorMat);
  rotundaFloor.position.set(0, -0.06, -40);
  const rotundaCeil = createBox(18, 0.12, 12, ceilingMat);
  rotundaCeil.position.set(0, H + 0.06, -40);
  group.add(rotundaFloor, rotundaCeil);

  // -------------------------------------------------------------------------
  // 2. ARCHITECTURAL WALLS & DOORWAYS (WITH REAL 3D OPENINGS)
  // -------------------------------------------------------------------------

  function addWall(w, h, d, x, y, z, mat = wallMat) {
    const wall = createBox(w, h, d, mat);
    wall.position.set(x, y, z);
    group.add(wall);
    collisionMeshes.push(wall);
    return wall;
  }

  // --- ENTRANCE WALL ---
  // South Back Wall of Hallway (Entrance at Z = 26)
  addWall(8 + T*2, H, T, 0, H/2, 26);

  // --- HALLWAY LEFT WALL SEGMENTS (X = -4) ---
  // 1. Entrance to Trophy Room: Z from 26 down to 15
  addWall(T, H, 11, -4, H/2, 20.5);

  // Doorway 1 Opening: Z from 15 to 1 (Archway at Z in [6.5, 9.5], width 3m)
  // Left wall segment south of door: Z from 15 down to 9.5 (length 5.5m)
  addWall(T, H, 5.5, -4, H/2, 12.25);
  // Left wall segment north of door: Z from 6.5 down to 1 (length 5.5m)
  addWall(T, H, 5.5, -4, H/2, 3.75);
  // Lintel above Doorway 1 (Trophy Room): Z in [6.5, 9.5], Height 1.6m at top
  const lintelTrophy = createBox(T, 1.6, 3.0, wallMat);
  lintelTrophy.position.set(-4, H - 0.8, 8);
  group.add(lintelTrophy);
  collisionMeshes.push(lintelTrophy);

  // 2. Middle Hallway Wall between Trophy & Continental Room: Z from 1 down to -7 (length 8m)
  addWall(T, H, 8, -4, H/2, -3);

  // Doorway 2 Opening: Z from -7 to -21 (Archway at Z in [-15.5, -12.5], width 3m)
  // Left wall segment south of door 2: Z from -7 down to -12.5 (length 5.5m)
  addWall(T, H, 5.5, -4, H/2, -9.75);
  // Left wall segment north of door 2: Z from -15.5 down to -21 (length 5.5m)
  addWall(T, H, 5.5, -4, H/2, -18.25);
  // Lintel above Doorway 2 (Continental Room)
  const lintelContinental = createBox(T, 1.6, 3.0, wallMat);
  lintelContinental.position.set(-4, H - 0.8, -14);
  group.add(lintelContinental);
  collisionMeshes.push(lintelContinental);

  // 3. Hallway Wall approaching Rotunda: Z from -21 down to -34 (length 13m)
  addWall(T, H, 13, -4, H/2, -27.5);

  // --- HALLWAY RIGHT WALL SEGMENTS (X = +4) ---
  // 1. Entrance to Derby Room: Z from 26 down to 15
  addWall(T, H, 11, 4, H/2, 20.5);

  // Doorway 1 Opening (Derby Room): Z in [6.5, 9.5]
  addWall(T, H, 5.5, 4, H/2, 12.25);
  addWall(T, H, 5.5, 4, H/2, 3.75);
  const lintelDerby = createBox(T, 1.6, 3.0, wallMat);
  lintelDerby.position.set(4, H - 0.8, 8);
  group.add(lintelDerby);
  collisionMeshes.push(lintelDerby);

  // 2. Middle Hallway Wall between Derby & Legends Room: Z from 1 down to -7 (length 8m)
  addWall(T, H, 8, 4, H/2, -3);

  // Doorway 2 Opening (Legends Room): Z in [-15.5, -12.5]
  addWall(T, H, 5.5, 4, H/2, -9.75);
  addWall(T, H, 5.5, 4, H/2, -18.25);
  const lintelLegends = createBox(T, 1.6, 3.0, wallMat);
  lintelLegends.position.set(4, H - 0.8, -14);
  group.add(lintelLegends);
  collisionMeshes.push(lintelLegends);

  // 3. Hallway Wall approaching Rotunda: Z from -21 down to -34 (length 13m)
  addWall(T, H, 13, 4, H/2, -27.5);

  // --- LEFT WING 1 (TROPHY ROOM) OUTER WALLS ---
  // West outer wall (X = -18, Z: 1 to 15)
  addWall(T, H, 14, -18, H/2, 8);
  // South outer wall (Z = 15, X: -18 to -4)
  addWall(14, H, T, -11, H/2, 15);
  // North outer wall (Z = 1, X: -18 to -4)
  addWall(14, H, T, -11, H/2, 1);

  // --- RIGHT WING 1 (DERBY ROOM) OUTER WALLS ---
  // East outer wall (X = 18, Z: 1 to 15)
  addWall(T, H, 14, 18, H/2, 8);
  // South outer wall (Z = 15, X: 4 to 18)
  addWall(14, H, T, 11, H/2, 15);
  // North outer wall (Z = 1, X: 4 to 18)
  addWall(14, H, T, 11, H/2, 1);

  // --- LEFT WING 2 (CONTINENTAL ROOM) OUTER WALLS ---
  // West outer wall (X = -18, Z: -21 to -7)
  addWall(T, H, 14, -18, H/2, -14);
  // South outer wall (Z = -7, X: -18 to -4)
  addWall(14, H, T, -11, H/2, -7);
  // North outer wall (Z = -21, X: -18 to -4)
  addWall(14, H, T, -11, H/2, -21);

  // --- RIGHT WING 2 (LEGENDS ROOM) OUTER WALLS ---
  // East outer wall (X = 18, Z: -21 to -7)
  addWall(T, H, 14, 18, H/2, -14);
  // South outer wall (Z = -7, X: 4 to 18)
  addWall(14, H, T, 11, H/2, -7);
  // North outer wall (Z = -21, X: 4 to 18)
  addWall(14, H, T, 11, H/2, -21);

  // --- CHAMPIONS ROTUNDA WALLS ---
  // Far North Wall (Z = -46, X: -9 to 9)
  addWall(18 + T*2, H, T, 0, H/2, -46);
  // West Wall (X = -9, Z: -46 to -34)
  addWall(T, H, 12, -9, H/2, -40);
  // East Wall (X = 9, Z: -46 to -34)
  addWall(T, H, 12, 9, H/2, -40);
  // Transition shoulders connecting Hallway (X: [-4, 4]) to Rotunda (X: [-9, 9]) at Z = -34
  addWall(5, H, T, -6.5, H/2, -34);
  addWall(5, H, T, 6.5, H/2, -34);
  // Grand Rotunda Portal Lintel at Z = -34, X in [-4, 4]
  const rotundaLintel = createBox(8, 1.4, T, wallMat);
  rotundaLintel.position.set(0, H - 0.7, -34);
  group.add(rotundaLintel);
  collisionMeshes.push(rotundaLintel);

  // -------------------------------------------------------------------------
  // 3. ARCHWAY HEADERS & 3D SIGNAGE PLAQUES
  // -------------------------------------------------------------------------

  function addSignagePlaque(text, sub, x, y, z, rotY, w = 2.6, h = 0.65) {
    const tex = createTextCanvas(text, sub, 512, 128);
    const plaqueMat = new THREE.MeshBasicMaterial({ map: tex });
    const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plaqueMat);
    plaqueMesh.position.set(x, y, z);
    plaqueMesh.rotation.y = rotY;
    group.add(plaqueMesh);

    // Dark trim backing
    const backing = createBox(w + 0.12, h + 0.08, 0.04, trimMat);
    backing.position.copy(plaqueMesh.position);
    backing.rotation.copy(plaqueMesh.rotation);
    const normal = new THREE.Vector3(0, 0, -0.025).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    backing.position.add(normal);
    group.add(backing);
  }

  // Plaques facing central hallway
  addSignagePlaque('Trophy & Silverware', 'Wing I · West', -3.82, 3.65, 8, Math.PI / 2);
  addSignagePlaque('Epic Derbies & Events', 'Wing I · East', 3.82, 3.65, 8, -Math.PI / 2);
  addSignagePlaque('Continental Nights', 'Wing II · West', -3.82, 3.65, -14, Math.PI / 2);
  addSignagePlaque('Club Legends & Icons', 'Wing II · East', 3.82, 3.65, -14, -Math.PI / 2);
  addSignagePlaque('Champions Rotunda', 'Centenary Pavilion', 0, 3.8, -33.82, 0, 3.4, 0.75);

  // Timeline Era Wall Banners along central hallway
  addSignagePlaque('1980s: The Early Era', 'Foundation & Promotion', -3.82, 3.85, 20.5, Math.PI / 2, 3.0, 0.6);
  addSignagePlaque('1990s-2000s: Golden Age', 'Trebles & Champions', -3.82, 3.85, -3, Math.PI / 2, 3.2, 0.6);
  addSignagePlaque('2010s-2020s: Modern Dynasties', 'High Press & Centurions', -3.82, 3.85, -27.5, Math.PI / 2, 3.4, 0.6);

  // -------------------------------------------------------------------------
  // 4. LIGHTING SYSTEM
  // -------------------------------------------------------------------------

  // Natural warm ambient and hemisphere lighting
  const ambient = new THREE.HemisphereLight(0xfffbf2, 0x8a8479, 1.8);
  group.add(ambient);

  // Soft directional gallery fill lights
  const dirLight1 = new THREE.DirectionalLight(0xfffaed, 0.9);
  dirLight1.position.set(5, 12, 10);
  const dirLight2 = new THREE.DirectionalLight(0xfffaed, 0.8);
  dirLight2.position.set(-5, 12, -20);
  group.add(dirLight1, dirLight2);

  // Ceiling Point Lights along main hallway
  for (let z = 22; z >= -30; z -= 7) {
    const ptLight = new THREE.PointLight(0xfff3db, 8, 12, 1.8);
    ptLight.position.set(0, H - 0.4, z);
    group.add(ptLight);
  }

  // Ceiling Lights in Side Rooms
  const roomCenters = [
    { x: -11, z: 8, col: 0xfff0d0 },   // Trophy
    { x: 11, z: 8, col: 0xffe6e6 },    // Derby
    { x: -11, z: -14, col: 0xe6f0ff }, // Continental
    { x: 11, z: -14, col: 0xf5e6ff },  // Legends
    { x: 0, z: -40, col: 0xfffae6 },   // Rotunda
  ];
  roomCenters.forEach(rc => {
    const light = new THREE.PointLight(rc.col, 18, 18, 1.6);
    light.position.set(rc.x, H - 0.4, rc.z);
    group.add(light);
  });

  // -------------------------------------------------------------------------
  // 5. EXHIBIT FRAMES PLACEMENT & TEXTURE BINDING
  // -------------------------------------------------------------------------

  // Slot Placement Coordinates mapped to EXHIBITS
  const SLOT_CONFIGS = {
    // --- Central Hallway 1980s ---
    'hall-1980s-1': { pos: new THREE.Vector3(-3.85, 2.35, 22.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-1980s-2': { pos: new THREE.Vector3(3.85, 2.35, 22.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-1980s-3': { pos: new THREE.Vector3(-3.85, 2.35, 17.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Trophy Room ---
    'trophy-1': { pos: new THREE.Vector3(-11, 2.45, 14.85), rotY: Math.PI, w: 4.2, h: 2.4 }, // South Wall
    'trophy-2': { pos: new THREE.Vector3(-17.85, 2.45, 8.0), rotY: Math.PI / 2, w: 4.4, h: 2.5 }, // West Wall Centerpiece
    'trophy-3': { pos: new THREE.Vector3(-11, 2.35, 1.15), rotY: 0, w: 3.2, h: 2.2 }, // North Wall
    'trophy-4': { pos: new THREE.Vector3(-4.15, 2.35, 12.5), rotY: -Math.PI / 2, w: 2.8, h: 2.1 }, // East inner wall

    // --- Derby Room ---
    'derby-1': { pos: new THREE.Vector3(11, 2.45, 14.85), rotY: Math.PI, w: 4.2, h: 2.4 }, // South Wall
    'derby-2': { pos: new THREE.Vector3(17.85, 2.45, 8.0), rotY: -Math.PI / 2, w: 4.4, h: 2.5 }, // East Wall
    'derby-3': { pos: new THREE.Vector3(11, 2.35, 1.15), rotY: 0, w: 3.2, h: 2.2 }, // North Wall
    'derby-4': { pos: new THREE.Vector3(4.15, 2.35, 12.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 }, // West inner wall

    // --- Central Hallway Golden Era ---
    'hall-golden-1': { pos: new THREE.Vector3(-3.85, 2.35, -1.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-golden-2': { pos: new THREE.Vector3(3.85, 2.35, -1.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-golden-3': { pos: new THREE.Vector3(-3.85, 2.35, -5.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Continental Room ---
    'continental-1': { pos: new THREE.Vector3(-17.85, 2.45, -14.0), rotY: Math.PI / 2, w: 4.4, h: 2.5 }, // West Wall Hero
    'continental-2': { pos: new THREE.Vector3(-11, 2.45, -6.85), rotY: 0, w: 4.2, h: 2.4 }, // South Wall
    'continental-3': { pos: new THREE.Vector3(-11, 2.35, -20.85), rotY: Math.PI, w: 3.2, h: 2.2 }, // North Wall
    'continental-4': { pos: new THREE.Vector3(-4.15, 2.35, -9.5), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Legends Room ---
    'legends-1': { pos: new THREE.Vector3(17.85, 2.45, -14.0), rotY: -Math.PI / 2, w: 4.4, h: 2.5 }, // East Wall Hero
    'legends-2': { pos: new THREE.Vector3(11, 2.45, -6.85), rotY: 0, w: 4.2, h: 2.4 }, // South Wall
    'legends-3': { pos: new THREE.Vector3(11, 2.35, -20.85), rotY: Math.PI, w: 3.2, h: 2.2 }, // North Wall
    'legends-4': { pos: new THREE.Vector3(4.15, 2.35, -9.5), rotY: Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Central Hallway Modern Era ---
    'hall-modern-1': { pos: new THREE.Vector3(-3.85, 2.35, -25.0), rotY: Math.PI / 2, w: 2.8, h: 2.1 },
    'hall-modern-2': { pos: new THREE.Vector3(3.85, 2.35, -25.0), rotY: -Math.PI / 2, w: 2.8, h: 2.1 },

    // --- Champions Rotunda ---
    'rotunda-hero': { pos: new THREE.Vector3(0, 2.65, -45.85), rotY: 0, w: 5.6, h: 3.2 }, // Grand Centenary Hero Frame
    'rotunda-left': { pos: new THREE.Vector3(-8.85, 2.45, -40.0), rotY: Math.PI / 2, w: 3.6, h: 2.4 },
    'rotunda-right': { pos: new THREE.Vector3(8.85, 2.45, -40.0), rotY: -Math.PI / 2, w: 3.6, h: 2.4 },
  };

  // Build Each Frame
  for (const exhibit of EXHIBITS) {
    const cfg = SLOT_CONFIGS[exhibit.id];
    if (!cfg) continue;

    const frame = await createMuseumFrame(exhibit, cfg, renderer, videoElements, transientUrls);
    frames.push(frame);
    group.add(frame.group);

    // Dynamic Frame Spotlight
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

  // Frame molding materials
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x181512, roughness: 0.35, metalness: 0.12 });
  const innerGoldMat = new THREE.MeshStandardMaterial({ color: 0xd4a362, roughness: 0.25, metalness: 0.75 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0f0e0c, roughness: 0.9 });

  // Outer wood moldings
  const top = createBox(W + b*2, b, d, woodMat); top.position.y = H/2 + b/2;
  const bot = top.clone(); bot.position.y = -H/2 - b/2;
  const left = createBox(b, H, d, woodMat); left.position.x = -W/2 - b/2;
  const right = left.clone(); right.position.x = W/2 + b/2;

  // Inner gilded bezel trim
  const gB = 0.035;
  const gTop = createBox(W, gB, d * 0.9, innerGoldMat); gTop.position.set(0, H/2 - gB/2, 0.01);
  const gBot = gTop.clone(); gBot.position.y = -H/2 + gB/2;
  const gLeft = createBox(gB, H, d * 0.9, innerGoldMat); gLeft.position.set(-W/2 + gB/2, 0, 0.01);
  const gRight = gLeft.clone(); gRight.position.x = W/2 - gB/2;

  const backing = createBox(W, H, 0.04, backMat);
  backing.position.z = 0.04;

  group.add(top, bot, left, right, gTop, gBot, gLeft, gRight, backing);

  // Screen Plane (where the photo/canvas texture is displayed)
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.92), screenMat);
  screen.position.z = 0.075;
  screen.userData.isMediaScreen = true;
  screen.userData.slotId = exhibit.id;
  group.add(screen);

  // Architectural Plaque underneath the frame
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 100;
  const pCtx = plaqueCanvas.getContext('2d');
  pCtx.fillStyle = '#111317';
  pCtx.fillRect(0, 0, 512, 100);
  pCtx.strokeStyle = '#d4a362';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(4, 4, 504, 92);
  pCtx.font = '600 20px "Cinzel", Georgia, serif';
  pCtx.fillStyle = '#f7f2e4';
  pCtx.textAlign = 'center';
  pCtx.fillText(exhibit.title, 256, 40);
  pCtx.font = '400 13px Inter, sans-serif';
  pCtx.fillStyle = '#bfa886';
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

  // Check IndexedDB for user customization
  const saved = await getSlotMedia(exhibit.id);
  if (saved?.blob) {
    const url = URL.createObjectURL(saved.blob);
    transientUrls.push(url);
    await applyMedia(frame, { url, type: saved.type, fit: saved.fit || 'cover', persistent: true }, renderer, videoElements);
  } else {
    // Generate beautiful procedural museum canvas artwork
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
