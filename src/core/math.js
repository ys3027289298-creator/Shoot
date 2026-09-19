export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Segment (P0 -> P1) vs axis-aligned box in 2D (Slab method).
// Returns t in [0,1] of entry, or null.
export function segmentVsAabb2D(px, pz, dx, dz, b) {
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [px, dx, b.minX, b.maxX],
    [pz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Segment vs 3D AABB {minX,maxX,minY,maxY,minZ,maxZ}. Returns entry t or null.
export function segmentVsAabb3D(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Circle vs AABB overlap / penetration resolution. Mutates pos.
export function resolveCircleAabb(pos, radius, b) {
  const cx = clamp(pos.x, b.minX, b.maxX);
  const cz = clamp(pos.z, b.minZ, b.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
  } else {
    // Center inside box: push out along smallest penetration axis.
    const left = pos.x - b.minX;
    const right = b.maxX - pos.x;
    const top = pos.z - b.minZ;
    const bottom = b.maxZ - pos.z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) pos.x = b.minX - radius;
    else if (m === right) pos.x = b.maxX + radius;
    else if (m === top) pos.z = b.minZ - radius;
    else pos.z = b.maxZ + radius;
  }
  return true;
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
