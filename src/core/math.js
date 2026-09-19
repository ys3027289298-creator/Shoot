// Minimal 3D math + collision helpers (no three.js dependency, fully testable in Node)

export function v(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function len2D(a) {
  return Math.hypot(a[0], a[2]);
}

export function norm(a) {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

export function dist2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function approachAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return cur + clamp(d, -maxStep, maxStep);
}

// Axis-aligned box: {min:[x,y,z], max:[x,y,z], tag, id, solid}
export function box(cx, cy, cz, sx, sy, sz, tag = 'wall', id = null, extra = {}) {
  return {
    min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
    tag,
    id,
    solid: extra.solid !== false,
    ...extra,
  };
}

export function pointInBox(p, b) {
  return (
    p[0] >= b.min[0] && p[0] <= b.max[0] &&
    p[1] >= b.min[1] && p[1] <= b.max[1] &&
    p[2] >= b.min[2] && p[2] <= b.max[2]
  );
}

// Slab test. Returns nearest intersection distance (>0) or null.
export function rayAABB(origin, dir, b) {
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = dir[i];
    if (Math.abs(d) < 1e-12) {
      if (origin[i] < b.min[i] || origin[i] > b.max[i]) return null;
    } else {
      let t1 = (b.min[i] - origin[i]) / d;
      let t2 = (b.max[i] - origin[i]) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmax < 0 ? null : { t: Math.max(0, tmin), far: tmax };
}

export function pointBoxDistance(p, b) {
  const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
  const dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
  const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
  return Math.hypot(dx, dy, dz);
}

export function boxOverlap(a, b) {
  return (
    a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
    a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
    a.min[2] < b.max[2] && a.max[2] > b.min[2]
  );
}

// Resolve movement of an entity AABB against solid boxes, one axis at a time (wall sliding).
// pos = [x, feetY, z], vel = velocity vector.
export function moveWithCollisions(pos, vel, dt, hx, height, solidBoxes) {
  const result = { pos: [...pos], onGround: false };

  const tryMove = (axis, delta) => {
    if (delta === 0) return true;
    const next = [...result.pos];
    next[axis] += delta;
    const b = {
      min: [next[0] - hx, next[1], next[2] - hx],
      max: [next[0] + hx, next[1] + height, next[2] + hx],
    };
    for (const w of solidBoxes) {
      if (boxOverlap(b, w)) return false;
    }
    result.pos = next;
    return true;
  };

  for (const axis of [1, 0, 2]) {
    const delta = vel[axis] * dt;
    if (delta === 0) continue;
    let moved = false;
    if (tryMove(axis, delta)) {
      moved = true;
    } else {
      const steps = 4;
      const step = delta / steps;
      for (let i = 0; i < steps; i++) {
        if (!tryMove(axis, step)) break;
        moved = true;
      }
      vel[axis] = 0;
    }
    if (axis === 1 && moved && delta < 0) result.onGround = true;
  }

  return result;
}

// Cast a ray through solid boxes, returning nearest hit {t, box, point} or null
export function raycastBoxes(origin, dir, boxes, maxDist = Infinity) {
  let best = null;
  for (const b of boxes) {
    if (b.solid === false) continue;
    const hit = rayAABB(origin, dir, b);
    if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) {
      best = { t: hit.t, box: b, point: add(origin, scale(dir, hit.t)) };
    }
  }
  return best;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
