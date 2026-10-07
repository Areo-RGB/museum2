// Declarative description of the building. Each floor is one time period of
// the collection and shows every work from it: one section per month, oldest
// at the entrance, a featured piece at the far end. Every floor shares the same
// lobby (entrance zone) with the cinema door and the elevator between floors.
// Environment geometry, colliders, frame slots and signage are all derived
// from the object createLayout() returns.
//
// Orientation: the visitor enters at the hall's minimum z and walks towards +z,
// so +x is on their LEFT and -x on their right.

export const ROOM = { width: 14, height: 5.4, wall: 0.24 };

const T = ROOM.wall;
const FACE = T / 2; // distance from wall centre line to its inner face
const HX = ROOM.width / 2;

/** Opening in the hall wall that leads into the cinema. */
export const DOOR = { halfWidth: 1.1, height: 2.9 };

/** Rhythm of the hall along its length (metres). */
export const SPACING = {
  pitch: 4.4,        // distance between neighbouring frames on one wall
  sectionGap: 2.8,   // room for the period label before each section's frames
  entrance: 9.5,     // back wall → first section (holds the cinema door)
  exit: 7,           // last section → end wall with the featured piece
};

/**
 * Lobby fixtures on the visitor's right (-x) side of the entrance zone: an
 * recessed elevator cabin and a wall-mounted floor directory.
 */
export const LOBBY = {
  // Cabin coordinates stay local: +z runs behind the right-hand wall (-x).
  elevator: { x: 0, width: 3.2, depth: 2.5, frontZ: 0, height: 3.3, opening: 1.6,
    placement: { position: [-HX, 0, 5.8], rotationY: -Math.PI / 2 } },
  directory: { position: [-HX + FACE + 0.085, 1.65, 2.65], rotationY: Math.PI / 2, width: 1.1, height: 1.9 },
};

/**
 * The cinema, in its own local coordinates: the door wall is the plane z = 0
 * (shared with the hall wall), the room extends towards +z and the screen
 * hangs on the far wall facing back towards the door. createLayout() decides
 * where this local frame sits in the world.
 */
export const CINEMA = {
  bounds: { minX: -7, maxX: 7, minZ: 0, maxZ: 16 },
  height: ROOM.height,
  screen: { width: 8.4, height: 3.6, y: 3.0 },
  stage: { depth: 1.3, height: 0.45 },
  rows: [10.5, 9.1, 7.7, 6.3, 4.9], // seat row centres (local z), front to back
  seatsPerSide: 7,
  seatPitch: 0.68,
  aisleHalfWidth: 0.75,
};

/** Seats in cinema-local coordinates: cushion centre, all facing the screen (+z). */
export const SEATS = CINEMA.rows.flatMap((z, row) =>
  [-1, 1].flatMap((side) => Array.from({ length: CINEMA.seatsPerSide }, (_, i) => ({
    row, x: side * (CINEMA.aisleHalfWidth + CINEMA.seatPitch * (i + 0.5)), z,
  }))));

const STANDARD = { maxWidth: 3.1, maxHeight: 2.15, y: 2.3 };
const HERO = { maxWidth: 4.6, maxHeight: 2.9, y: 2.55 };
// Frame front is local +z; these rotations make frames face into the hall.
const FACING = { towardsMinusX: -Math.PI / 2, towardsPlusX: Math.PI / 2, towardsEntrance: Math.PI };

const toRect = ({ x, z, w, d }) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

/** Map a point from a placed room's local space into the world (rotation about Y). */
function placePoint(x, z, { position: [px, , pz], rotationY }) {
  const c = Math.cos(rotationY), s = Math.sin(rotationY);
  return [px + x * c + z * s, pz - x * s + z * c];
}

/** Shared transforms for elevator meshes, collision checks and arrival camera. */
export function elevatorPoint(x, z) {
  return placePoint(x, z, LOBBY.elevator.placement);
}

export function elevatorLocalPoint({ x, z }) {
  const { position: [px, , pz], rotationY } = LOBBY.elevator.placement;
  const c = Math.cos(rotationY), s = Math.sin(rotationY);
  return { x: (x - px) * c - (z - pz) * s, z: (x - px) * s + (z - pz) * c };
}

/** Map a local axis-aligned rectangle into the world (rotations must be multiples of 90°). */
function placeRect(rect, placement) {
  const corners = [[rect.minX, rect.minZ], [rect.maxX, rect.maxZ]].map(([x, z]) => placePoint(x, z, placement));
  const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Same for a wall box {x, z, w, d, ...}. */
function placeBox(box, placement) {
  const r = placeRect(toRect(box), placement);
  return { ...box, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ };
}

/**
 * Layout for one floor.
 * @param {ReturnType<import('../media/library.js').MediaLibrary['floors']>[number] | null} floor
 */
export function createLayout(floor) {
  const months = floor?.months.length
    ? floor.months
    : [{ key: 'empty', label: 'The Collection', items: [] }];
  const floorKey = floor?.key ?? 'empty';

  // One section per month, oldest first from the entrance. Every item gets a frame.
  const plan = months.map((month) => {
    const frames = month.items.length || 2; // an empty floor still shows two placeholders
    const perSide = Math.ceil(frames / 2);
    const label = { label: month.label, range: floor?.label ?? '', count: month.items.length };
    return { month, label, frames, perSide, length: SPACING.sectionGap + perSide * SPACING.pitch };
  });
  const length = SPACING.entrance + plan.reduce((sum, s) => sum + s.length, 0) + SPACING.exit;
  const minZ = 0;
  const maxZ = length;
  const hall = { minX: -HX, maxX: HX, minZ, maxZ, length, height: ROOM.height };

  // The cinema opens off the visitor's left (+x) wall, right inside the entrance.
  // Its 14 m wide shell must sit entirely alongside the hall wall, hence the offset.
  const cinemaHalfWidth = (CINEMA.bounds.maxX - CINEMA.bounds.minX) / 2;
  const doorZ = minZ + cinemaHalfWidth + 0.2;
  const cinema = { position: [HX, 0, doorZ], rotationY: Math.PI / 2 };

  const sections = [];
  const allItems = months.flatMap((m) => m.items);
  const featured = allItems[Math.floor(Math.random() * allItems.length)];
  const slots = [{
    id: `${floorKey}:hero`, ...HERO, position: [0, HERO.y, maxZ - FACE], rotationY: FACING.towardsEntrance,
    hero: true, period: floorKey, itemId: featured?.id ?? null,
  }];
  const benches = [];

  let z = minZ + SPACING.entrance;
  for (const { month, label, frames, perSide, length: sectionLength } of plan) {
    const section = { period: label, startZ: z, endZ: z + sectionLength, labelZ: z + SPACING.sectionGap / 2 };
    sections.push(section);
    for (let i = 0; i < frames; i++) {
      // Alternate walls so consecutive works face each other across the hall.
      const side = i % 2 === 0 ? 'left' : 'right';
      const index = Math.floor(i / 2);
      const fz = z + SPACING.sectionGap + SPACING.pitch * (index + 0.5);
      slots.push({
        id: `${floorKey}:${month.key}:${i + 1}`, ...STANDARD, period: floorKey, itemId: month.items[i]?.id ?? null,
        position: [side === 'left' ? HX - FACE : -HX + FACE, STANDARD.y, fz],
        rotationY: side === 'left' ? FACING.towardsMinusX : FACING.towardsPlusX,
      });
    }
    // A bench roughly every three frames along the section.
    const benchCount = Math.max(1, Math.round(perSide / 3));
    const framesStart = z + SPACING.sectionGap;
    for (let b = 0; b < benchCount; b++) {
      benches.push({ x: 0, z: framesStart + (perSide * SPACING.pitch) * (b + 0.5) / benchCount, w: 0.62, d: 2.6 });
    }
    z += sectionLength;
  }

  const C = CINEMA.bounds;
  const cinemaWalls = [
    { room: 'cinema', x: C.minX, z: (C.minZ + C.maxZ) / 2, w: T, d: C.maxZ - C.minZ },
    { room: 'cinema', x: C.maxX, z: (C.minZ + C.maxZ) / 2, w: T, d: C.maxZ - C.minZ },
    { room: 'cinema', x: 0, z: C.maxZ, w: C.maxX - C.minX + T, d: T },
  ].map((w) => placeBox(w, cinema));

  const doorLow = doorZ - DOOR.halfWidth, doorHigh = doorZ + DOOR.halfWidth;
  const { elevator: e, directory } = LOBBY;
  const elevatorZ = e.placement.position[2];
  const elevatorLow = elevatorZ - e.width / 2, elevatorHigh = elevatorZ + e.width / 2;
  /** Axis-aligned wall boxes: centre (x, z), size (w along x, d along z), optional vertical span [y0, y1]. */
  const walls = [
    { room: 'hall', x: 0, z: minZ, w: ROOM.width + T, d: T },
    { room: 'hall', accent: true, x: 0, z: maxZ, w: ROOM.width + T, d: T },
    // Right wall continues around the recessed elevator facade and above it.
    { room: 'hall', x: -HX, z: (minZ + elevatorLow) / 2, w: T, d: elevatorLow - minZ },
    { room: 'hall', x: -HX, z: (elevatorHigh + maxZ) / 2, w: T, d: maxZ - elevatorHigh },
    { room: 'hall', x: -HX, z: elevatorZ, w: T, d: e.width, y0: e.height },
    // Left (+x) wall, split around the cinema door, plus a lintel above it.
    { room: 'hall', x: HX, z: (minZ + doorLow) / 2, w: T, d: doorLow - minZ },
    { room: 'hall', x: HX, z: (doorHigh + maxZ) / 2, w: T, d: maxZ - doorHigh },
    { room: 'hall', x: HX, z: doorZ, w: T, d: DOOR.halfWidth * 2, y0: DOOR.height },
    ...cinemaWalls,
  ];

  const seatBlockOuter = CINEMA.aisleHalfWidth + CINEMA.seatPitch * CINEMA.seatsPerSide;
  const cinemaColliders = [
    // Seat rows, one block either side of the centre aisle.
    ...CINEMA.rows.flatMap((rz) => [-1, 1].map((side) => ({
      minX: side < 0 ? -seatBlockOuter : CINEMA.aisleHalfWidth,
      maxX: side < 0 ? -CINEMA.aisleHalfWidth : seatBlockOuter,
      minZ: rz - 0.45, maxZ: rz + 0.35,
    }))),
    // Stage.
    { minX: C.minX, maxX: C.maxX, minZ: C.maxZ - CINEMA.stage.depth, maxZ: C.maxZ },
  ].map((r) => placeRect(r, cinema));

  const elevatorColliders = [
    ...[-1, 1].map(side => toRect({ x: e.x + side * e.width / 2, z: e.frontZ + e.depth / 2, w: 0.12, d: e.depth })),
    toRect({ x: e.x, z: e.frontZ + e.depth, w: e.width, d: 0.12 }),
    ...[-1, 1].map(side => toRect({ x: e.x + side * (e.opening / 2 + (e.width - e.opening) / 4), z: e.frontZ, w: (e.width - e.opening) / 2, d: 0.16 })),
  ].map(rect => placeRect(rect, e.placement));
  /** Collision rectangles in the XZ plane (only things that reach the floor). */
  const colliders = [
    ...walls.filter((w) => !w.y0).map(toRect),
    ...benches.map(toRect),
    ...cinemaColliders,
    // Cabin walls and front jambs; the sliding doors are checked by Lobby.blocksDoor().
    ...elevatorColliders,
    toRect({ x: directory.position[0], z: directory.position[2], w: 0.14, d: directory.width + 0.1 }),
  ];

  // Enter at the oldest end, looking down the hall; the cinema door is just ahead on the left.
  const start = { position: [0, 1.65, minZ + 3.2], yaw: Math.PI };

  return { hall, sections, slots, benches, walls, colliders, cinema, start };
}
