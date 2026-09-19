// Static facility map. All walls/crates/doors are axis-aligned boxes that block
// movement and bullets. Coordinates: x = east, z = north.

const WALL_T = 0.4;
const WALL_H = 4;

function hSegments(x1, x2, z, gaps = []) {
  const spans = [];
  let cur = x1;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) spans.push([cur, g0, z]);
    cur = Math.max(cur, g1);
  }
  if (x2 > cur) spans.push([cur, x2, z]);
  return spans;
}

function vSegments(z1, z2, x, gaps = []) {
  const spans = [];
  let cur = z1;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) spans.push([x, cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (z2 > cur) spans.push([x, cur, z2]);
  return spans;
}

let boxIdCounter = 0;
function wallBoxes(segments, orientation) {
  return segments.map(([a, b, c]) => {
    if (orientation === 'h') {
      return {
        id: `w${boxIdCounter++}`,
        kind: 'wall',
        minX: Math.min(a, b),
        maxX: Math.max(a, b),
        minZ: c - WALL_T / 2,
        maxZ: c + WALL_T / 2,
        minY: 0,
        maxY: WALL_H,
      };
    }
    return {
      id: `w${boxIdCounter++}`,
      kind: 'wall',
      minX: a - WALL_T / 2,
      maxX: a + WALL_T / 2,
      minZ: Math.min(b, c),
      maxZ: Math.max(b, c),
      minY: 0,
      maxY: WALL_H,
    };
  });
}

export function buildMap() {
  boxIdCounter = 0;
  const walls = [];

  // Outer compound perimeter (60 x 84). South gate [-4,4], north gate [18,26].
  walls.push(...wallBoxes(hSegments(-30, -4, 42), 'h'));
  walls.push(...wallBoxes(hSegments(4, 30, 42), 'h'));
  walls.push(...wallBoxes(hSegments(-30, 18, -42), 'h'));
  walls.push(...wallBoxes(hSegments(26, 30, -42), 'h'));
  walls.push(...wallBoxes(vSegments(-42, 42, -30), 'v'));
  walls.push(...wallBoxes(vSegments(-42, 42, 30), 'v'));

  // Facility exterior x[-22,22], z[-26,20]; two doors on each face.
  const doorGaps = [
    [-11.5, -8.5],
    [8.5, 11.5],
  ];
  walls.push(...wallBoxes(hSegments(-22, 22, 20, doorGaps), 'h'));
  walls.push(...wallBoxes(hSegments(-22, 22, -26, doorGaps), 'h'));
  walls.push(...wallBoxes(vSegments(-26, 20, -22), 'v'));
  walls.push(...wallBoxes(vSegments(-26, 20, 22), 'v'));

  // Central cross corridors.
  walls.push(...wallBoxes(hSegments(-22, 22, -3, [[-11.5, -8.5], [-1.5, 1.5], [8.5, 11.5]]), 'h'));
  walls.push(...wallBoxes(vSegments(-3, 20, -4, [[6.5, 9.5]]), 'v'));
  walls.push(...wallBoxes(vSegments(-3, 20, 4, [[6.5, 9.5]]), 'v'));
  walls.push(...wallBoxes(vSegments(-26, -3, -4, [[-15.5, -12.5]]), 'v'));
  walls.push(...wallBoxes(vSegments(-26, -3, 4, [[-15.5, -12.5]]), 'v'));

  const crateSpecs = [
    [-12, 34, 2.4, 1.4, 1.4], [10, 32, 2.4, 2.4, 1.6],
    [-18, 28, 2, 2, 1.4], [16, 26, 1.8, 3, 1.8],
    [0, 27, 2.2, 1.6, 1.3], [-24, 36, 2.6, 2, 1.5],
    [23, 35, 2.2, 2.2, 1.5], [-1.8, 14, 1.4, 1.4, 1.1],
    [1.8, 11, 1.4, 1.4, 1.1], [0, 6, 2, 1.2, 1.3],
    [-16, 15, 2, 1.4, 1.4], [-8, 4, 1.6, 2, 1.2],
    [-15, 12, 1.2, 1.2, 1.8], [14, 15, 2.2, 1.4, 1.3],
    [8, 3, 1.6, 1.6, 1.2], [17, 7, 1.4, 2, 1.5],
    [0, -8, 2, 1.2, 1.3], [0, -20, 1.8, 1.8, 1.4],
    [-16, -8, 2.4, 1.4, 1.6], [-9, -20, 1.6, 2, 1.3],
    [-18, -22, 2, 1.2, 1.2], [14, -8, 2, 1.4, 1.4],
    [18, -20, 1.8, 1.8, 1.5], [8, -22, 1.6, 1.2, 1.2],
    [-12, -32, 2.4, 2, 1.5], [6, -34, 2, 2, 1.4],
    [20, -32, 2.2, 1.6, 1.3], [-2, -38, 2.4, 1.8, 1.6],
  ];
  const crates = crateSpecs.map(([x, z, w, d, h]) => ({
    id: `c${boxIdCounter++}`,
    kind: 'crate',
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    minY: 0,
    maxY: h,
  }));

  const doorDefs = [
    { id: 'door_sw', name: '南门(西)', x: -10, z: 20, axis: 'x' },
    { id: 'door_se', name: '南门(东)', x: 10, z: 20, axis: 'x' },
    { id: 'door_nw', name: '北门(西)', x: -10, z: -26, axis: 'x' },
    { id: 'door_ne', name: '北门(东)', x: 10, z: -26, axis: 'x' },
    { id: 'door_hostage', name: '拘留室门', x: 4, z: -14, axis: 'z' },
    { id: 'door_server', name: '机房门', x: -4, z: -14, axis: 'z' },
  ];
  const doors = doorDefs.map((d) => ({
    ...d,
    width: 3,
    open: false,
    minY: 0,
    maxY: 3.2,
    ...(d.axis === 'x'
      ? {
          minX: d.x - 1.5, maxX: d.x + 1.5,
          minZ: d.z - WALL_T / 2, maxZ: d.z + WALL_T / 2,
        }
      : {
          minX: d.x - WALL_T / 2, maxX: d.x + WALL_T / 2,
          minZ: d.z - 1.5, maxZ: d.z + 1.5,
        }),
  }));

  const allSolids = [...walls, ...crates, ...doors];
  const playerSpawn = { x: 0, z: 38 };
  const extraction = { x: 22, z: -38, radius: 3.2 };

  const objectives = {
    intel: {
      id: 'intel',
      name: '取得情报资料',
      zone: { x: -13, z: 9, radius: 2.2 },
      requiresDrive: true,
      holdSeconds: 2,
    },
    device: {
      id: 'device',
      name: '关闭通讯干扰设备',
      zone: { x: -13, z: -14, radius: 2.2 },
      holdSeconds: 3,
    },
    hostage: {
      id: 'hostage',
      name: '救出被俘人员',
      zone: { x: 13, z: -14, radius: 2.4 },
    },
  };

  const supplyPoints = [
    { x: -13, z: 14 }, { x: -7, z: 8 }, { x: -18, z: 5 },
    { x: 13, z: 12 }, { x: 9, z: 6 }, { x: 18, z: 12 },
    { x: -1, z: 16 }, { x: 1, z: 1 },
    { x: -13, z: -6 }, { x: -18, z: -18 }, { x: -8, z: -23 },
    { x: 12, z: -6 }, { x: 18, z: -14 }, { x: 9, z: -23 },
    { x: 0, z: -14 }, { x: -14, z: 30 }, { x: 14, z: 28 },
    { x: -24, z: -30 }, { x: 4, z: -36 },
  ];

  const enemyAnchors = [
    { x: 0, z: 30, patrol: [[0, 30], [-10, 30], [0, 30], [10, 30]] },
    { x: -14, z: 26, patrol: [[-14, 26], [-24, 32], [-14, 26]] },
    { x: 14, z: 26, patrol: [[14, 26], [24, 30], [14, 26]] },
    { x: -1, z: 13, patrol: [[-1, 13], [-1, 5], [1, 5], [1, 13]] },
    { x: -13, z: 10, patrol: [[-13, 10], [-18, 5], [-8, 5], [-13, 10]] },
    { x: 13, z: 10, patrol: [[13, 10], [8, 5], [18, 5], [13, 10]] },
    { x: 0, z: -8, patrol: [[0, -8], [-8, -8], [0, -8], [8, -8]] },
    { x: -13, z: -13, patrol: [[-13, -13], [-18, -20], [-8, -20], [-13, -13]] },
    { x: 13, z: -13, patrol: [[13, -13], [18, -20], [8, -20], [13, -13]] },
    { x: 10, z: -32, patrol: [[10, -32], [-14, -32], [10, -32], [20, -34]] },
    { x: -8, z: -30, patrol: [[-8, -30], [0, -38], [-8, -30]] },
  ];

  return {
    bounds: { minX: -30, maxX: 30, minZ: -42, maxZ: 42 },
    walls,
    crates,
    doors,
    allSolids,
    playerSpawn,
    extraction,
    objectives,
    supplyPoints,
    enemyAnchors,
  };
}
