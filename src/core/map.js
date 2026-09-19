// Tactical facility map: outdoor compound + multi-room building with corridors,
// multiple entrances, cover and elevated platforms. All geometry is axis aligned.
import { box, mulberry32 } from './math.js';

export const WALL_H = 3.2;
export const WALL_T = 0.3;

// Build wall segments along an axis, leaving gaps (doorways / openings).
// axis 'x': wall runs along x at fixed z; axis 'z': runs along z at fixed x.
function wallWithGaps(axis, fixed, from, to, gaps = [], tag = 'wall') {
  const out = [];
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  let cursor = from;
  for (const [g0, g1] of sorted) {
    if (g0 - cursor > 0.05) {
      out.push(seg(axis, fixed, cursor, g0, tag));
    }
    cursor = g1;
  }
  if (to - cursor > 0.05) out.push(seg(axis, fixed, cursor, to, tag));
  return out;
}

function seg(axis, fixed, a, b, tag) {
  const length = b - a;
  const mid = (a + b) / 2;
  if (axis === 'x') {
    return box(mid, WALL_H / 2, fixed, length, WALL_H, WALL_T, tag);
  }
  return box(fixed, WALL_H / 2, mid, WALL_T, WALL_H, length, tag);
}

// Interior partition wall along x at given z, inside x range [x0,x1]
function interiorX(z, x0, x1, gaps = []) {
  return wallWithGaps('x', z, x0, x1, gaps, 'wall');
}
function interiorZ(x, z0, z1, gaps = []) {
  return wallWithGaps('z', x, z0, z1, gaps, 'wall');
}

function crate(x, z, size = 1.2, height = 1.2, tag = 'crate') {
  return box(x, height / 2, z, size, height, size, tag);
}

export function buildMap(seed = 12345) {
  const rng = mulberry32(seed);
  const walls = [];
  const doors = [];

  const addDoor = (id, axis, fixed, at, name) => {
    doors.push({ id, axis, fixed, at, open: false, name });
  };

  // ---- Outer compound wall 60 x 60 centered at origin; gates on each side ----
  const H = 30;
  // south wall (z=+30): extraction gate gap at x [-2,2]
  walls.push(...wallWithGaps('x', H, -H, H, [[-2, 2]], 'fence'));
  // north wall (z=-30): entry gap [-2,2]
  walls.push(...wallWithGaps('x', -H, -H, H, [[-2, 2]], 'fence'));
  walls.push(...wallWithGaps('z', -H, -H, H, [], 'fence'));
  walls.push(...wallWithGaps('z', H, -H, H, [], 'fence'));

  // ---- Main building: x [-16,16], z [-16,8] ----
  const B = { x0: -16, x1: 16, z0: -16, z1: 8 };
  // south facade: main door at x[-1,1], plus window-like small openings not passable
  walls.push(...wallWithGaps('x', B.z1, B.x0, B.x1, [[-1.5, 1.5]], 'wall'));
  addDoor('door_main', 'x', B.z1, 0, 'Main Entrance');
  walls.push(...wallWithGaps('x', B.z0, B.x0, B.x1, [[-1.5, 1.5]], 'wall'));
  addDoor('door_north', 'x', B.z0, 0, 'North Service Door');
  // east / west facades with side entrances
  walls.push(...wallWithGaps('z', B.x1, B.z0, B.z1, [[-5, -3]], 'wall'));
  addDoor('door_east', 'z', B.x1, -4, 'East Side Door');
  walls.push(...wallWithGaps('z', B.x0, B.z0, B.z1, [[-5, -3]], 'wall'));
  addDoor('door_west', 'z', B.x0, -4, 'West Side Door');

  // ---- Interior partitions ----
  // Horizontal (along x) partitions
  walls.push(...interiorX(-10, -16, 16, [[-3, -1], [9, 11]])); // north corridor wall
  walls.push(...interiorX(-2, -16, 16, [[-8, -6], [-1, 1], [6, 8]]));
  walls.push(...interiorX(3, -16, 16, [[-13, -11], [2, 4]]));

  // Vertical (along z) partitions
  walls.push(...interiorZ(-6, -16, 8, [[-9, -7], [-3.5, -1.5], [5, 7]]));
  walls.push(...interiorZ(4, -16, 3, [[-14, -12], [-6, -4]]));
  walls.push(...interiorZ(11, -2, 8, [[0, 2]]));

  // Detention holding cell inside south-east room (x 11..16, z 3..8)
  walls.push(...interiorZ(13.5, 3, 8, [[5.5, 7]]));
  addDoor('door_cell', 'z', 13.5, 6.25, 'Holding Cell');

  // ---- Cover: crates, containers, barriers ----
  const cover = [];
  // outdoor yard
  cover.push(crate(-8, 18, 1.6, 1.6, 'container'));
  cover.push(crate(-5.5, 14, 1.2, 1.2));
  cover.push(crate(7, 20, 2.4, 1.4, 'container'));
  cover.push(crate(10, 13, 1.2, 1.2));
  cover.push(crate(-20, 12, 1.2, 1.2));
  cover.push(crate(21, -14, 2.4, 1.4, 'container'));
  cover.push(crate(-22, -18, 1.2, 1.2));
  cover.push(crate(4, -24, 1.2, 1.2));
  // perimeter barriers near gates
  cover.push(box(-9, 0.6, 28.2, 3, 1.2, 0.6, 'barrier'));
  cover.push(box(9, 0.6, 28.2, 3, 1.2, 0.6, 'barrier'));
  cover.push(box(-9, 0.6, -28.2, 3, 1.2, 0.6, 'barrier'));
  cover.push(box(9, 0.6, -28.2, 3, 1.2, 0.6, 'barrier'));
  // building: south hall
  cover.push(crate(-10, 5.5, 1.2, 1.2));
  cover.push(crate(8.5, 6, 1.4, 1.4, 'container'));
  // center rooms
  cover.push(crate(-11, -6, 1.2, 1.2));
  cover.push(crate(-2, -6.5, 1.2, 1.2));
  // server room (north-west): server racks block bullets and movement
  // server racks line the north wall; keep a clear lane to the doorway
  cover.push(box(-13.2, 1.0, -14.6, 2.4, 2.0, 0.8, 'rack'));
  cover.push(box(-8.8, 1.0, -14.6, 2.4, 2.0, 0.8, 'rack'));
  // control room (north-center x -6..4)
  cover.push(box(0, 0.7, -13.5, 2.4, 1.4, 1.2, 'desk'));
  // armory (north-east x 4..16)
  cover.push(crate(8, -13, 1.2, 1.2));
  cover.push(crate(13, -12, 1.4, 1.4, 'container'));
  cover.push(crate(13, -7, 1.2, 1.2));
  // detention room
  cover.push(crate(6.5, 5.5, 1.2, 1.2));
  cover.push(crate(15, 1.5, 1.2, 1.2));

  // elevated platform outside (visual + standing cover edge): low platform
  cover.push(box(-18, 0.25, 22, 6, 0.5, 6, 'platform'));

  const allBoxes = [...walls, ...cover];

  // ---- Zones ----
  const zones = {
    spawn: { name: 'Insertion', x: 0, z: 27 },
    extraction: { name: 'Extraction Zone (South Gate)', x: 0, z: 28.5, radius: 3 },
    console: { name: 'Comms Jammer Console', x: -2, z: -13.2 },
    hostageCell: { name: 'Holding Cell', x: 14.7, z: 6 },
    hostage: { x: 14.7, z: 5.2 },
    // data drive can appear in one of three secured locations
    dataSpots: [
      { name: 'Server Rack (Server Room)', x: -10.5, z: -13 },
      { name: 'Armory Locker', x: 13.5, z: -13 },
      { name: 'Ops Office Desk', x: 13.5, z: 0.5 },
    ],
  };

  // choose a data spot deterministically from seed
  const dataIndex = Math.floor(rng() * zones.dataSpots.length);

  // ---- Enemy spawns + patrol routes ----
  const enemyDefs = [
    { type: 'guard', x: 0, z: 10, route: [[0, 10], [-10, 10], [-10, 4], [0, 4]] },
    { type: 'guard', x: 9, z: 5.5, route: [[9, 5.5], [14, 5.5], [14, 1.5]] },
    { type: 'guard', x: -12, z: -6, route: [[-12, -6], [-14, -2], [-8, -3.5]] },
    { type: 'guard', x: 1, z: -6, route: [[1, -6], [-3, -6], [-3, -9]] },
    { type: 'guard', x: 9, z: -6, route: [[9, -6], [14, -6], [14, -9]] },
    { type: 'guard', x: -12, z: -12, route: [[-12, -12], [-7.2, -12], [-10, -14.6]] },
    { type: 'rusher', x: 7, z: -13, route: [[7, -13], [13, -13], [13, -11]] },
    { type: 'heavy', x: 0, z: 0.5, route: [[0, 0.5], [3, 0.5], [3, 2]] },
    { type: 'guard', x: 22, z: -10, route: [[22, -10], [18, -6], [18, -14]] },
    { type: 'rusher', x: -20, z: -16, route: [[-20, -16], [-17, -10], [-23, -10]] },
  ];

  // ---- Supply pool: a random subset spawns each run (finite supplies) ----
  const supplyPool = [
    { x: -8, z: 14, item: 'medkit' },
    { x: 7, z: 20, item: 'rifleAmmo' },
    { x: -22, z: -18, item: 'pistolAmmo' },
    { x: 4, z: -24, item: 'medkit' },
    { x: 21, z: -14, item: 'shotgunAmmo' },
    { x: -10, z: 5.5, item: 'rifleAmmo' },
    { x: 8.5, z: 6, item: 'pistolAmmo' },
    { x: -11, z: -6, item: 'medkit' },
    { x: 13, z: -12, item: 'rifleAmmo' },
    { x: 15, z: 1.5, item: 'shotgunAmmo' },
    { x: -2, z: 0.5, item: 'pistolAmmo' },
    { x: 6.5, z: 5.5, item: 'medkit' },
  ];
  // pick 8 of 12, shuffled
  const shuffled = [...supplyPool].sort(() => rng() - 0.5);
  const supplies = shuffled.slice(0, 8).map((s, i) => ({ id: `supply_${i}`, ...s }));

  // cover point candidates for enemy AI: center-ish positions next to cover boxes
  const coverPoints = [];
  for (const c of cover) {
    const cx = (c.min[0] + c.max[0]) / 2;
    const cz = (c.min[2] + c.max[2]) / 2;
    const sx = c.max[0] - c.min[0];
    const sz = c.max[2] - c.min[2];
    const r = Math.max(sx, sz) / 2 + 1.1;
    coverPoints.push([cx + r, cz], [cx - r, cz], [cx, cz + r], [cx, cz - r]);
  }

  return {
    wallHeight: WALL_H,
    walls,
    cover,
    boxes: allBoxes,
    doors,
    zones,
    dataIndex,
    dataSpot: zones.dataSpots[dataIndex],
    enemyDefs,
    supplies,
    coverPoints,
    bounds: H,
  };
}
