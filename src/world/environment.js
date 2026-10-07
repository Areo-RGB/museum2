import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOM, WALLS, BENCHES } from './layout.js';
import { createWoodFloorTexture } from './textures.js';

const PALETTE = {
  wall: 0xebe7df,
  accentWall: 0x2c3a35, // deep green feature wall behind the hero piece
  baseboard: 0x2a2621,
  ceiling: 0xf4f2ec,
  lightStrip: 0xfff6e6,
  benchWood: 0x6b4a2f,
  benchMetal: 0x1e1e1e,
  cinemaWall: 0x161214,
};

/**
 * Builds the static architecture: gallery floor/ceiling, every wall, benches and
 * ambient light. Returns wall meshes (for line-of-sight checks) and the
 * hemisphere light (so rooms can dim the house lights).
 */
export function buildEnvironment(app) {
  const group = new THREE.Group();
  group.name = 'environment';

  const pmrem = new THREE.PMREMGenerator(app.renderer);
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  app.scene.environmentIntensity = 0.32;
  app.scene.background = new THREE.Color(0x151413);
  pmrem.dispose();

  // Floor
  const floorTex = createWoodFloorTexture({ anisotropy: app.maxAnisotropy });
  floorTex.repeat.set(ROOM.width / 1.8, ROOM.depth / 1.8);
  floorTex.rotation = Math.PI / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.95 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  group.add(ceiling);

  // Walls (+ baseboards on the gallery side)
  const materials = {
    gallery: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.88 }),
    accent: new THREE.MeshStandardMaterial({ color: PALETTE.accentWall, roughness: 0.82 }),
    cinema: new THREE.MeshStandardMaterial({ color: PALETTE.cinemaWall, roughness: 0.95 }),
  };
  const baseMat = new THREE.MeshStandardMaterial({ color: PALETTE.baseboard, roughness: 0.6 });
  const walls = [];
  for (const wall of WALLS) {
    const y0 = wall.y0 ?? 0, y1 = wall.y1 ?? ROOM.height;
    const material = wall.accent ? materials.accent : materials[wall.room];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, y1 - y0, wall.d), material);
    mesh.position.set(wall.x, (y0 + y1) / 2, wall.z);
    group.add(mesh);
    walls.push(mesh);

    if (wall.room === 'gallery' && y0 === 0) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(wall.w + 0.04, 0.14, wall.d + 0.04), baseMat);
      base.position.set(wall.x, 0.07, wall.z);
      group.add(base);
    }
  }

  // Ceiling light coves: emissive strips that read as diffuse skylights.
  const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.lightStrip });
  for (const x of [-3.2, 3.2]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, ROOM.depth - 3), stripMat);
    strip.position.set(x, ROOM.height - 0.02, 0);
    group.add(strip);
  }

  for (const bench of BENCHES) group.add(createBench(bench));

  const hemisphere = new THREE.HemisphereLight(0xfff6ea, 0x6d6255, 0.75);
  group.add(hemisphere);
  // Gentle wash down the length of the room from the light coves. Short range
  // so it doesn't bleed through the front wall into the cinema.
  for (const z of [-6.5, 0, 6]) {
    const wash = new THREE.PointLight(0xfff1dc, 6, 10, 1.6);
    wash.position.set(0, ROOM.height - 0.6, z);
    group.add(wash);
  }

  return { group, walls, hemisphere };
}

function createBench({ x, z, w, d }) {
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  const wood = new THREE.MeshStandardMaterial({ color: PALETTE.benchWood, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: PALETTE.benchMetal, roughness: 0.4, metalness: 0.6 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), wood);
  seat.position.y = 0.45;
  bench.add(seat);
  for (const lz of [-d / 2 + 0.2, d / 2 - 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.42, 0.06), metal);
    leg.position.set(0, 0.21, lz);
    bench.add(leg);
  }
  return bench;
}
