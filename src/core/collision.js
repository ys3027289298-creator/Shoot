import { segmentVsAabb3D, resolveCircleAabb, clamp } from './math.js';

// Expanded-AABB swept movement: move one axis at a time, rejecting the axis
// component that would penetrate. Robust for corners and avoids tunneling.
function overlapsExpanded(pos, radius, b) {
  return (
    pos.x > b.minX - radius &&
    pos.x < b.maxX + radius &&
    pos.z > b.minZ - radius &&
    pos.z < b.maxZ + radius
  );
}

function moveAxis(pos, delta, axis, radius, solids) {
  const other = axis === 'x' ? 'z' : 'x';
  pos[axis] += delta;
  for (const b of solids) {
    if (b.solid === false) continue;
    if (!overlapsExpanded(pos, radius, b)) continue;
    // Only resolve when the other axis is within the expanded slab.
    if (
      pos[other] <= b[`min${other.toUpperCase()}`] - radius ||
      pos[other] >= b[`max${other.toUpperCase()}`] + radius
    ) {
      continue;
    }
    if (delta > 0) {
      pos[axis] = b[`min${axis.toUpperCase()}`] - radius;
    } else if (delta < 0) {
      pos[axis] = b[`max${axis.toUpperCase()}`] + radius;
    }
    delta = 0;
  }
}

export function moveWithCollision(pos, dx, dz, radius, solids, bounds) {
  moveAxis(pos, dx, 'x', radius, solids);
  moveAxis(pos, dz, 'z', radius, solids);
  // Last-resort depenetration for spawn-inside cases.
  for (const b of solids) {
    if (b.solid === false) continue;
    if (overlapsExpanded(pos, radius, b)) resolveCircleAabb(pos, radius, b);
  }
  pos.x = clamp(pos.x, bounds.minX + radius, bounds.maxX - radius);
  pos.z = clamp(pos.z, bounds.minZ + radius, bounds.maxZ - radius);
  return pos;
}

// Closest ray hit against solid boxes. Returns {box,t,x,y,z} or null.
export function raycastSolids(ox, oy, oz, dx, dy, dz, maxDist, solids) {
  let best = null;
  for (const b of solids) {
    if (b.solid === false) continue;
    // Robust slab ray test with a unit-length direction vector.
    let tmin = 0;
    let tmax = maxDist;
    const axes = [
      [ox, dx, b.minX, b.maxX],
      [oy, dy, b.minY, b.maxY],
      [oz, dz, b.minZ, b.maxZ],
    ];
    let hit = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { hit = false; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
    }
    if (hit && (!best || tmin < best.dist)) best = { box: b, dist: tmin };
  }
  if (!best) return null;
  return {
    box: best.box,
    dist: best.dist,
    x: ox + dx * best.dist,
    y: oy + dy * best.dist,
    z: oz + dz * best.dist,
  };
}

// Line-of-sight check between two points at given eye/body heights.
export function hasLineOfSight(ax, ay, az, bx, by, bz, solids) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const hit = raycastSolids(ax, ay, az, dx / dist, dy / dist, dz / dist, dist, solids);
  return !hit;
}

// Character hitboxes: head / body / limbs are simple vertical AABBs.
export function characterHitboxes(pos, yaw, radius, crouching, isEnemy = false) {
  const h = crouching ? 1.25 : 1.75;
  const r = radius;
  return [
    { part: 'head', minX: pos.x - r * 0.55, maxX: pos.x + r * 0.55, minZ: pos.z - r * 0.55, maxZ: pos.z + r * 0.55, minY: h - 0.28, maxY: h + 0.02 },
    { part: 'body', minX: pos.x - r, maxX: pos.x + r, minZ: pos.z - r, maxZ: pos.z + r, minY: 0.85, maxY: h - 0.28 },
    { part: 'limb', minX: pos.x - r * 0.7, maxX: pos.x + r * 0.7, minZ: pos.z - r * 0.7, maxZ: pos.z + r * 0.7, minY: 0.05, maxY: 0.9 },
  ];
}

export function raycastCharacters(ox, oy, oz, dir, maxDist, characters) {
  let best = null;
  for (const ch of characters) {
    if (ch.dead) continue;
    for (const hb of ch.hitboxes) {
      let tmin = 0;
      let tmax = maxDist;
      const axes = [
        [ox, dir.x, hb.minX, hb.maxX],
        [oy, dir.y, hb.minY, hb.maxY],
        [oz, dir.z, hb.minZ, hb.maxZ],
      ];
      let hit = true;
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { hit = false; break; }
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && (!best || tmin < best.dist)) {
        best = { character: ch, part: hb.part, dist: tmin };
      }
    }
  }
  return best;
}
