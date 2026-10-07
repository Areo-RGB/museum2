// Declarative description of the building. Environment geometry, colliders and
// frame placement are all derived from this data, so adding a wall or a frame
// is a one-line change here.

export const ROOM = { width: 18, depth: 24, height: 5.4, wall: 0.24 };

const hx = ROOM.width / 2;
const hz = ROOM.depth / 2;
const T = ROOM.wall;
const face = T / 2; // distance from wall centre line to its inner face

/** Opening in the gallery's front wall that leads into the cinema. */
export const DOOR = { halfWidth: 1.1, height: 2.9 };

/**
 * The cinema hall behind the gallery's front wall (z = hz). The screen hangs
 * on the far wall and faces back towards the door.
 */
export const CINEMA = {
  bounds: { minX: -7, maxX: 7, minZ: hz, maxZ: hz + 16 },
  height: ROOM.height,
  screen: { width: 8.4, height: 3.6, y: 3.0 },
  stage: { depth: 1.3, height: 0.45 },
  rows: [22.5, 21.1, 19.7, 18.3, 16.9], // seat row centres (z), front to back
  seatsPerSide: 7,
  seatPitch: 0.68,
  aisleHalfWidth: 0.75,
};

const C = CINEMA.bounds;
const cinemaCx = (C.minX + C.maxX) / 2;
const cinemaCz = (C.minZ + C.maxZ) / 2;
const frontSegment = hx + face - DOOR.halfWidth; // width of each wall piece beside the door

/**
 * Axis-aligned wall boxes: centre (x, z), size (w along x, d along z) and an
 * optional vertical span [y0, y1]. `room` decides the finish.
 */
export const WALLS = [
  { room: 'gallery', accent: true, x: 0, z: -hz, w: ROOM.width + T, d: T },
  { room: 'gallery', x: -hx, z: 0, w: T, d: ROOM.depth },
  { room: 'gallery', x: hx, z: 0, w: T, d: ROOM.depth },
  // Front wall, split around the door, plus a lintel above it.
  { room: 'gallery', x: -(DOOR.halfWidth + frontSegment / 2), z: hz, w: frontSegment, d: T },
  { room: 'gallery', x: DOOR.halfWidth + frontSegment / 2, z: hz, w: frontSegment, d: T },
  { room: 'gallery', x: 0, z: hz, w: DOOR.halfWidth * 2, d: T, y0: DOOR.height },
  // Cinema shell.
  { room: 'cinema', x: C.minX, z: cinemaCz, w: T, d: C.maxZ - C.minZ },
  { room: 'cinema', x: C.maxX, z: cinemaCz, w: T, d: C.maxZ - C.minZ },
  { room: 'cinema', x: cinemaCx, z: C.maxZ, w: C.maxX - C.minX + T, d: T },
];

/** Benches (also used as colliders). Long axis runs along z. */
export const BENCHES = [
  { x: 0, z: -3.2, w: 0.62, d: 2.6 },
  { x: 0, z: 3.8, w: 0.62, d: 2.6 },
];

// Facing directions expressed as rotation around Y (frame front is local +z).
const FACING = { east: Math.PI / 2, west: -Math.PI / 2, south: 0, north: Math.PI };

const STANDARD = { maxWidth: 3.1, maxHeight: 2.15, y: 2.3 };
const HERO = { maxWidth: 4.6, maxHeight: 2.9, y: 2.55 };

/**
 * Frame slots. `position` is the point on the wall surface the frame hangs on.
 * Each slot id is the persistence key for user uploads, so keep ids stable.
 */
export const SLOTS = [
  ...[-8, -3, 2, 7].map((z, i) => ({
    id: `left-${i + 1}`, ...STANDARD, position: [-hx + face, STANDARD.y, z], rotationY: FACING.east,
  })),
  ...[-8, -3, 2, 7].map((z, i) => ({
    id: `right-${i + 1}`, ...STANDARD, position: [hx - face, STANDARD.y, z], rotationY: FACING.west,
  })),
  { id: 'hero', ...HERO, position: [0, HERO.y, -hz + face], rotationY: FACING.south, hero: true },
  ...[-5.7, 5.7].map((x, i) => ({
    id: `back-${i + 1}`, ...STANDARD, position: [x, STANDARD.y, -hz + face], rotationY: FACING.south,
  })),
  ...[-4.6, 4.6].map((x, i) => ({
    id: `front-${i + 1}`, ...STANDARD, position: [x, STANDARD.y, hz - face], rotationY: FACING.north,
  })),
];

/** Seats derived from CINEMA: position of the cushion centre, all facing the screen (+z). */
export const SEATS = CINEMA.rows.flatMap((z, row) =>
  [-1, 1].flatMap((side) => Array.from({ length: CINEMA.seatsPerSide }, (_, i) => ({
    row, x: side * (CINEMA.aisleHalfWidth + CINEMA.seatPitch * (i + 0.5)), z,
  }))));

const seatBlockOuter = CINEMA.aisleHalfWidth + CINEMA.seatPitch * CINEMA.seatsPerSide;

const toRect = ({ x, z, w, d }) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

/** Collision rectangles in the XZ plane (only things that reach the floor). */
export const COLLIDERS = [
  ...WALLS.filter((w) => !w.y0).map(toRect),
  ...BENCHES.map(toRect),
  // Seat rows, one block either side of the centre aisle.
  ...CINEMA.rows.flatMap((z) => [-1, 1].map((side) => ({
    minX: side < 0 ? -seatBlockOuter : CINEMA.aisleHalfWidth,
    maxX: side < 0 ? -CINEMA.aisleHalfWidth : seatBlockOuter,
    minZ: z - 0.45, maxZ: z + 0.35,
  }))),
  // Stage in front of the screen.
  { minX: C.minX, maxX: C.maxX, minZ: C.maxZ - CINEMA.stage.depth, maxZ: C.maxZ },
];
