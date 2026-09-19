// Enemy AI: vision (FOV + real line-of-sight raycasts), hearing, alert propagation,
// patrol, investigate, engage (cover use + bursts) and search-after-lost.
import { dist2D, norm, raycastBoxes, rayAABB, clamp } from './math.js';
import { eyeOfEnemy, moveEnemyBody, faceTowards } from './enemy.js';
import { damagePlayer, eyePosition, PLAYER_CFG } from './player.js';
import { add, scale } from './math.js';

function angleToPlayer(e, p) {
  const dx = p.pos[0] - e.pos[0];
  const dz = p.pos[2] - e.pos[2];
  const ang = Math.atan2(-dx, -dz);
  let d = ang - e.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// True if no solid box blocks eye -> player eye
export function hasLineOfSight(e, p, solidBoxes, maxDist) {
  const from = eyeOfEnemy(e);
  const to = eyePosition(p);
  const dirV = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const dist = Math.hypot(dirV[0], dirV[1], dirV[2]);
  if (dist > maxDist) return false;
  const dir = norm(dirV);
  const hit = raycastBoxes(from, dir, solidBoxes, dist - 0.6);
  return !hit;
}

// Detection strength 0..1; crouch / distance / alert level all matter
export function detectionLevel(e, p, solidBoxes, alert) {
  const d = dist2D(e.pos, p.pos);
  if (d > e.def.viewRange) return 0;
  if (!hasLineOfSight(e, p, solidBoxes, e.def.viewRange)) return 0;
  const fovAng = angleToPlayer(e, p);
  const inFov = fovAng < e.def.fov / 2;
  const peripheral = inFov ? 1 : 0.35;
  const distFactor = clamp(1 - d / e.def.viewRange, 0.05, 1);
  const stanceFactor = p.crouching ? 0.55 : 1;
  const motionFactor = 0.35 + 0.65 * p.noiseLevel;
  const alertFactor = 1 + alert * 0.8;
  return clamp(peripheral * distFactor * stanceFactor * (0.5 + motionFactor) * alertFactor, 0, 1);
}

function pickCover(e, p, map) {
  let best = null;
  let bestScore = -Infinity;
  for (const cp of map.coverPoints) {
    const dPlayer = dist2D(cp, p.pos);
    const dSelf = dist2D(cp, e.pos);
    if (dSelf > 12) continue;
    if (dPlayer < 2.5) continue;
    // prefer points within fire range and not already on top of us
    if (dPlayer > e.def.fireRange) continue;
    const score = Math.random() * 2 - dSelf * 0.15 + (dPlayer < e.def.fireRange * 0.8 ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = cp; }
  }
  return best;
}

function chooseSearchPoint(e, map) {
  const candidates = map.coverPoints.filter((cp) => dist2D(cp, e.lastKnownPlayer) < 9);
  if (!candidates.length) return [e.lastKnownPlayer[0], e.lastKnownPlayer[2]];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function moveTowards(e, tx, tz, dt, speed, solids) {
  const dx = tx - e.pos[0];
  const dz = tz - e.pos[2];
  const d = Math.hypot(dx, dz);
  if (d < 0.4) return 0;
  const s = Math.min(speed, d / dt);
  moveEnemyBody(e, (dx / d) * s, (dz / d) * s, dt, solids);
  return d;
}

function fireAtPlayer(e, p, dt, solids, events, hostage) {
  const from = eyeOfEnemy(e);
  const to = eyePosition(p);
  const dirV = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const dist = Math.hypot(dirV[0], dirV[1], dirV[2]);
  let dir = norm(dirV);
  // aim error
  const err = e.def.spread * (dist / 12 + 0.5);
  dir = norm([
    dir[0] + (Math.random() - 0.5) * err,
    dir[1] + (Math.random() - 0.5) * err * 0.6,
    dir[2] + (Math.random() - 0.5) * err,
  ]);
  const pellets = e.def.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const pd = norm([
      dir[0] + (Math.random() - 0.5) * err,
      dir[1] + (Math.random() - 0.5) * err,
      dir[2] + (Math.random() - 0.5) * err,
    ]);
    const wallHit = raycastBoxes(from, pd, solids, dist - 0.5);
    let hostageHit = false;
    if (hostage && hostage.alive && hostage.freed) {
      const hb = {
        min: [hostage.pos[0] - 0.35, hostage.pos[1] + 0.05, hostage.pos[2] - 0.35],
        max: [hostage.pos[0] + 0.35, hostage.pos[1] + 1.75, hostage.pos[2] + 0.35],
      };
      const hHit = rayAABB(from, pd, hb);
      if (hHit && hHit.t < dist - 0.4 && (!wallHit || hHit.t < wallHit.t)) hostageHit = true;
    }
    if (hostageHit) {
      hostage.alive = false;
      events.push({ type: 'hostageHit', t: performance.now() });
    } else if (!wallHit) {
      damagePlayer(p, e.def.damage);
      events.push({ type: 'playerHit', amount: e.def.damage, t: performance.now() });
    }
  }
  events.push({ type: 'enemyShot', from: [...from], dir: [...dir], enemyId: e.id, weapon: e.type, t: performance.now() });
}

// opts: { solidBoxes, map, alert, onSpot, onFire, time }
export function updateEnemyAI(e, p, dt, opts) {
  if (!e.alive) return;
  const { solidBoxes, map, alert, events } = opts;
  e.stateTime += dt;
  e.fireCooldown = Math.max(0, e.fireCooldown - dt);
  e.burstPauseTimer = Math.max(0, e.burstPauseTimer - dt);

  const canSee = p.alive && hasLineOfSight(e, p, solidBoxes, e.def.viewRange);
  const det = canSee ? detectionLevel(e, p, solidBoxes, alert) : 0;

  if (canSee && det > 0.55) {
    if (e.state !== 'engage') {
      events.push({ type: 'spotted', enemyId: e.id });
      e.coverTarget = null;
    }
    e.state = 'engage';
    e.stateTime = 0;
    e.lastKnownPlayer = [p.pos[0], p.pos[2]];
    e.lastSeenTime = opts.time;
    e.spotted = true;
  }

  switch (e.state) {
    case 'patrol': {
      // hearing
      if (p.noiseLevel > 0.4 && dist2D(e.pos, p.pos) < e.def.hearing) {
        e.state = 'suspicious';
        e.stateTime = 0;
        e.investigateTarget = [p.pos[0], p.pos[2]];
        break;
      }
      const target = e.route[e.routeIndex];
      faceTowards(e, target[0], target[2], dt, 3);
      if (e.waitTime > 0) {
        e.waitTime -= dt;
      } else {
        const d = moveTowards(e, target[0], target[1], dt, e.def.speed * 0.55, solidBoxes);
        if (d < 0.6) {
          e.waitTime = 1.2 + Math.random() * 1.5;
          e.routeIndex = (e.routeIndex + 1) % e.route.length;
        }
      }
      break;
    }
    case 'suspicious': {
      // look toward last known movement, then approach
      const tgt = e.investigateTarget || e.lastKnownPlayer;
      if (tgt) {
        faceTowards(e, tgt[0], tgt[1], dt, 4);
        if (e.stateTime > 0.7) moveTowards(e, tgt[0], tgt[1], dt, e.def.speed * 0.8, solidBoxes);
      }
      if (e.stateTime > 6) {
        e.state = 'patrol';
        e.stateTime = 0;
        e.investigateTarget = null;
      }
      break;
    }
    case 'engage': {
      const d = dist2D(e.pos, p.pos);
      faceTowards(e, p.pos[0], p.pos[2], dt, 8);

      // rushers close distance; others seek/use cover every few seconds
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 1.2 + Math.random() * 1.2; }

      if (e.type === 'rusher') {
        if (d > e.def.fireRange * 0.7) {
          moveTowards(e, p.pos[0], p.pos[2], dt, e.def.speed, solidBoxes);
        } else {
          const sx = Math.cos(e.yaw) * e.strafeDir;
          const sz = Math.sin(e.yaw) * e.strafeDir;
          moveEnemyBody(e, sx * e.def.speed * 0.5, sz * e.def.speed * 0.5, dt, solidBoxes);
        }
      } else if (!e.coverTarget && (e.stateTime > 3 || e.health < e.maxHealth * 0.45)) {
        e.coverTarget = pickCover(e, p, map);
      } else if (e.coverTarget) {
        const cd = moveTowards(e, e.coverTarget[0], e.coverTarget[1], dt, e.def.speed, solidBoxes);
        if (cd < 0.7) e.coverTarget = null;
      } else {
        // small combat strafe so they don't stand still
        const sx = Math.cos(e.yaw) * e.strafeDir;
        const sz = Math.sin(e.yaw) * e.strafeDir;
        moveEnemyBody(e, sx * e.def.speed * 0.4, sz * e.def.speed * 0.4, dt, solidBoxes);
      }

      // fire with burst logic
      const canFire = canSee && d <= e.def.fireRange && e.burstPauseTimer <= 0;
      if (e.burstTimer > 0) e.burstTimer -= dt;
      if (e.burstLeft > 0 && e.burstTimer <= 0 && canFire) {
        fireAtPlayer(e, p, dt, solidBoxes, events, opts.hostage);
        e.burstLeft -= 1;
        e.burstTimer = e.def.burstDelay || 0.1;
        e.fireCooldown = 0.15;
        if (e.burstLeft <= 0 && e.def.burstPause) e.burstPauseTimer = e.def.burstPause;
      } else if (e.burstLeft <= 0 && canFire && e.fireCooldown <= 0) {
        e.burstLeft = e.def.burstCount;
        e.burstTimer = 0;
        e.fireCooldown = e.def.fireInterval;
      }
      break;
    }
    case 'search': {
      if (canSee && det > 0.5) {
        e.state = 'engage';
        e.stateTime = 0;
        break;
      }
      if (!e.searchTarget || dist2D(e.pos, e.searchTarget) < 0.8) {
        e.searchTarget = chooseSearchPoint(e, map);
      }
      const tgt = e.searchTarget;
      faceTowards(e, tgt[0], tgt[1], dt, 4);
      moveTowards(e, tgt[0], tgt[1], dt, e.def.speed * 0.85, solidBoxes);
      e.searchTime -= dt;
      if (e.searchTime <= 0) {
        e.state = 'patrol';
        e.stateTime = 0;
        e.searchTarget = null;
      }
      break;
    }
  }

  // transition engage -> search when player vanished
  if (e.state === 'engage') {
    const sinceSeen = opts.time - e.lastSeenTime;
    if (!canSee && sinceSeen > 2.5) {
      e.state = 'search';
      e.stateTime = 0;
      e.searchTime = 10;
      e.searchTarget = null;
      e.coverTarget = null;
    }
  }
  // suspicious discovery even at low detection keeps them looking
  if (e.state === 'patrol' && det > 0.25) {
    e.state = 'suspicious';
    e.stateTime = 0;
    e.investigateTarget = [p.pos[0], p.pos[2]];
  }
}

// A noise event (gunshot, explosion) makes nearby enemies investigate / engage
export function hearNoise(enemies, x, z, radius, solidBoxes, p) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (dist2D(e.pos, [x, z]) <= radius) {
      if (e.state === 'patrol') {
        e.state = 'suspicious';
        e.stateTime = 0;
        e.investigateTarget = [x, z];
      }
    }
  }
}
