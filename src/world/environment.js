import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOM } from './layout.js';
import { periodLabel } from './signage.js';
import { createWoodFloorTexture } from './textures.js';

const PALETTE = {
  wall: 0xebe7df,
  accentWall: 0x163b68, // Hertha blue behind the featured piece
  baseboard: 0x2a2621,
  ceiling: 0xf4f2ec,
  skylight: 0xd6d0c3,
  coffer: 0xd9d5cc,
  track: 0x1d1c1a,
  benchWood: 0x6b4a2f,
  benchMetal: 0x1e1e1e,
  cinemaWall: 0x161214,
  brass: 0xb08d57,
  haze: 0xe4e0d8,
};

/**
 * Building-wide lighting and atmosphere, set up once. Returns the hemisphere
 * light so rooms (the cinema) can dim the house lights.
 */
export function setupAtmosphere(app) {
  const pmrem = new THREE.PMREMGenerator(app.renderer);
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  app.scene.environmentIntensity = 0.32;
  app.scene.background = new THREE.Color(0x151413);
  // Soft haze so the far end of a long hall recedes instead of ending in a hard edge.
  app.scene.fog = new THREE.Fog(PALETTE.haze, 35, 140);
  pmrem.dispose();

  const hemisphere = new THREE.HemisphereLight(0xfff6ea, 0x6d6255, 0.75);
  app.scene.add(hemisphere);
  return { hemisphere };
}

/**
 * Builds one floor's architecture from its layout: hall floor/ceiling, every
 * wall, benches, ceiling fixtures and month signage. Returns wall meshes (for
 * line-of-sight checks) and dispose() to free GPU resources when switching floors.
 * @param {ReturnType<import('./layout.js').createLayout>} layout
 */
export function buildHall(app, layout) {
  const { hall } = layout;
  const group = new THREE.Group();
  group.name = 'hall';

  const width = hall.maxX - hall.minX;
  const centerZ = (hall.minZ + hall.maxZ) / 2;

  // Floor
  const floorTex = createWoodFloorTexture({ anisotropy: app.maxAnisotropy });
  floorTex.repeat.set(width / 1.8, hall.length / 1.8);
  floorTex.rotation = Math.PI / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, hall.length),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = centerZ;
  group.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, hall.length),
    new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.95 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, hall.height, centerZ);
  group.add(ceiling);

  // Walls (+ baseboards on the hall side)
  const materials = {
    hall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.88 }),
    accent: new THREE.MeshStandardMaterial({ color: PALETTE.accentWall, roughness: 0.82 }),
    cinema: new THREE.MeshStandardMaterial({ color: PALETTE.cinemaWall, roughness: 0.95 }),
  };
  const baseMat = new THREE.MeshStandardMaterial({ color: PALETTE.baseboard, roughness: 0.6 });
  const walls = [];
  for (const wall of layout.walls) {
    const y0 = wall.y0 ?? 0, y1 = wall.y1 ?? ROOM.height;
    const material = wall.accent ? materials.accent : materials[wall.room];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, y1 - y0, wall.d), material);
    mesh.position.set(wall.x, (y0 + y1) / 2, wall.z);
    group.add(mesh);
    walls.push(mesh);

    if (wall.room === 'hall' && y0 === 0) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(wall.w + 0.04, 0.14, wall.d + 0.04), baseMat);
      base.position.set(wall.x, 0.07, wall.z);
      group.add(base);
    }
  }

  buildCeilingFixtures(group, layout);

  for (const bench of layout.benches) group.add(createBench(bench));

  // Each period: wall text on both sides, a brass line across the floor and
  // a ceiling wash light over its frames.
  const brass = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.3, metalness: 0.85 });
  const face = ROOM.wall / 2 + 0.01;
  for (const section of layout.sections) {
    for (const side of [-1, 1]) {
      const label = periodLabel(section.period);
      label.position.set(side * (hall.maxX - face), 2.35, section.labelZ);
      label.rotation.y = -side * Math.PI / 2;
      group.add(label);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.006, 0.05), brass);
    line.position.set(0, 0.003, section.startZ);
    group.add(line);
  }

  // Ceiling wash lights at a steady rhythm along the hall (sections vary a lot in length).
  for (let z = hall.minZ + 13; z < hall.maxZ - 2; z += 12) {
    const wash = new THREE.PointLight(0xfff1dc, 7, 9.5, 1.6);
    wash.position.set(0, hall.height - 0.6, z);
    group.add(wash);
  }

  return { group, walls, dispose: () => disposeTree(group) };
}

/** Free geometries, materials and textures under `root`. */
export function disposeTree(root) {
  root.removeFromParent();
  root.traverse((obj) => {
    if (obj.isInstancedMesh) obj.dispose();
    obj.geometry?.dispose();
    for (const material of [obj.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

/**
 * Gallery ceiling: recessed skylight panels down the centre, plus a lighting
 * track along each side with a spot head aimed at every frame (which is what
 * the light pools on the walls appear to come from).
 */
function buildCeilingFixtures(group, { hall, slots }) {
  const y = hall.height;
  const dummy = new THREE.Object3D();

  // Skylights: a soft diffuser inside a slightly darker recess rim.
  const spacing = 6;
  const count = Math.floor((hall.length - 2) / spacing);
  const first = hall.minZ + (hall.length - (count - 1) * spacing) / 2;
  const rim = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.9, 2.9),
    new THREE.MeshStandardMaterial({ color: PALETTE.coffer, roughness: 1 }), count);
  const diffuser = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 2.5),
    new THREE.MeshBasicMaterial({ color: PALETTE.skylight }), count);
  for (let i = 0; i < count; i++) {
    for (const [mesh, offset] of [[rim, 0.004], [diffuser, 0.008]]) {
      dummy.position.set(0, y - offset, first + i * spacing);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  }
  group.add(rim, diffuser);

  // Tracks with spot heads.
  const trackX = hall.maxX - 2.2;
  const metal = new THREE.MeshStandardMaterial({ color: PALETTE.track, roughness: 0.45, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, hall.length - 1), metal);
    track.position.set(side * trackX, y - 0.04, (hall.minZ + hall.maxZ) / 2);
    group.add(track);
  }
  const headGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.2, 14).rotateX(Math.PI / 2); // aims along +z
  const heads = new THREE.InstancedMesh(headGeo, metal, slots.length);
  slots.forEach((slot, i) => {
    const [sx, sy, sz] = slot.position;
    const near = slot.hero
      ? [0, y - 0.2, sz - 2.4]
      : [Math.sign(sx) * trackX, y - 0.2, sz];
    dummy.position.set(...near);
    dummy.rotation.set(0, 0, 0);
    dummy.lookAt(sx, sy, sz);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  group.add(heads);
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
