import { dist2d, angleDiff, clamp } from './math.js';
import { hasLineOfSight, characterHitboxes, moveWithCollision } from './collision.js';

export const ENEMY_TYPES = {
  guard: {
    id: 'guard',
    name: '武装警卫',
    health: 100,
    speed: 2.6,
    chaseSpeed: 4.4,
    detectRange: 26,
    fov: Math.PI * 0.55,
    loseTime: 4,
    searchTime: 7,
    weapon: { rpm: 130, damage: 9, range: 45, spread: 0.05, magSize: 12, reload: 2.0, burst: 4 },
    radius: 0.42,
  },
  scout: {
    id: 'scout',
    name: '侦察兵',
    health: 70,
    speed: 3.2,
    chaseSpeed: 5.2,
    detectRange: 32,
    fov: Math.PI * 0.7,
    loseTime: 3,
    searchTime: 9,
    weapon: { rpm: 170, damage: 6, range: 35, spread: 0.07, magSize: 14, reload: 1.6, burst: 3 },
    radius: 0.4,
  },
  heavy: {
    id: 'heavy',
    name: '重装兵',
    health: 190,
    speed: 2.0,
    chaseSpeed: 3.4,
    detectRange: 24,
    fov: Math.PI * 0.5,
    loseTime: 5,
    searchTime: 6,
    weapon: { rpm: 480, damage: 7, range: 50, spread: 0.06, magSize: 60, reload: 3.2, burst: 12 },
    radius: 0.5,
  },
};

let enemyIdCounter = 0;

export function createEnemy(typeId, anchor) {
  const type = ENEMY_TYPES[typeId];
  const patrol = anchor.patrol.map(([x, z]) => ({ x, z }));
  return {
    id: enemyIdCounter++,
    typeId,
    type,
    pos: { x: anchor.x, y: 0, z: anchor.z },
    yaw: Math.atan2(0 - anchor.x, -(38 - anchor.z)),
    state: 'patrol',
    alive: true,
    dead: false,
    health: type.health,
    maxHealth: type.health,
    radius: type.radius,
    crouching: false,
    patrol,
    patrolIndex: 0,
    lastKnownPlayer: null,
    lastSawAt: -99,
    stateChangedAt: 0,
    nextShotAt: 0,
    burstLeft: 0,
    mag: type.weapon.magSize,
    reloadEndsAt: 0,
    reloading: false,
    hitboxes: [],
    coverTarget: null,
    nextCoverCheck: 0,
    searchTarget: null,
    nextSearchMove: 0,
    moveTarget: null,
    flashAt: -99,
  };
}

function canSeePlayer(enemy, player, solids, globalAlert) {
  if (!player.alive) return false;
  const type = enemy.type;
  const dx = player.pos.x - enemy.pos.x;
  const dz = player.pos.z - enemy.pos.z;
  const dist = Math.hypot(dx, dz);
  const targetYaw = Math.atan2(dx, -dz);
  const ang = Math.abs(angleDiff(targetYaw, enemy.yaw));
  const stanceMul = player.crouching ? 0.72 : 1;
  const speedMul = player.running ? 1.25 : 1;
  const range = type.detectRange * stanceMul * speedMul + 10 * globalAlert;
  const inFov = ang < type.fov / 2;
  const closeRange = dist < 3.2;
  if (dist > range) return false;
  if (!inFov && !closeRange) return false;
  const eyeY = 1.6;
  const playerEyeY = player.pos.y + (player.crouching ? 1.1 : 1.6);
  return hasLineOfSight(
    enemy.pos.x, eyeY, enemy.pos.z,
    player.pos.x, playerEyeY, player.pos.z,
    solids
  );
}

function moveToward(enemy, target, speed, dt, solids, bounds) {
  const dx = target.x - enemy.pos.x;
  const dz = target.z - enemy.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.15) return true;
  const nx = dx / dist;
  const nz = dz / dist;
  moveWithCollision(enemy.pos, nx * speed * dt, nz * speed * dt, enemy.radius, solids, bounds);
  const targetYaw = Math.atan2(dx, -dz);
  const diff = angleDiff(targetYaw, enemy.yaw);
  enemy.yaw += clamp(diff, -6 * dt, 6 * dt);
  return dist < 0.6;
}

function findNearbyCover(enemy, playerPos, solids) {
  let best = null;
  let bestScore = Infinity;
  for (const b of solids) {
    if (b.kind !== 'crate') continue;
    const w = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const dToEnemy = dist2d(cx, cz, enemy.pos.x, enemy.pos.z);
    if (dToEnemy > 10 || dToEnemy < 0.8) continue;
    const dxp = cx - playerPos.x;
    const dzp = cz - playerPos.z;
    const dp = Math.hypot(dxp, dzp) || 1;
    const px = cx + (dxp / dp) * (w / 2 + 0.9);
    const pz = cz + (dzp / dp) * (w / 2 + 0.9);
    const score = dist2d(px, pz, enemy.pos.x, enemy.pos.z);
    if (score < bestScore) {
      bestScore = score;
      best = { x: px, z: pz };
    }
  }
  return best;
}

export function enemyShoot(enemy, player, now, solids, rng) {
  const w = enemy.type.weapon;
  if (enemy.reloading) {
    if (now >= enemy.reloadEndsAt) {
      enemy.reloading = false;
      enemy.mag = w.magSize;
    }
    return null;
  }
  if (enemy.burstLeft <= 0 || now < enemy.nextShotAt) return null;
  enemy.nextShotAt = now + 60 / w.rpm;
  enemy.burstLeft -= 1;
  if (enemy.mag <= 0) {
    enemy.reloading = true;
    enemy.reloadEndsAt = now + w.reload;
    return null;
  }
  enemy.mag -= 1;
  enemy.flashAt = now;
  if (enemy.mag <= 0) {
    enemy.reloading = true;
    enemy.reloadEndsAt = now + w.reload;
  }
  const spread = w.spread * (enemy.state === 'engage' ? 1 : 1.4);
  const dx = player.pos.x - enemy.pos.x;
  const dz = player.pos.z - enemy.pos.z;
  const dist = Math.hypot(dx, dz);
  const baseYaw = Math.atan2(dx, -dz);
  const yawErr = (rng.next() - 0.5) * 2 * spread;
  const pitchErr = (rng.next() - 0.5) * 2 * spread;
  const dir = {
    x: Math.sin(baseYaw + yawErr),
    y: pitchErr,
    z: -Math.cos(baseYaw + yawErr),
  };
  const hitPoint = {
    x: player.pos.x,
    y: player.pos.y + (player.crouching ? 1.0 : 1.3),
    z: player.pos.z,
  };
  const los = hasLineOfSight(enemy.pos.x, 1.5, enemy.pos.z, hitPoint.x, hitPoint.y, hitPoint.z, solids);
  if (!los) return { fired: true, hit: false, dir };
  const distFactor = clamp(1 - dist / w.range, 0.2, 1);
  const hitChance = 0.6 * distFactor;
  if (rng.next() >= hitChance) return { fired: true, hit: false, dir };
  const roll = rng.next();
  const part = roll < 0.15 ? 'head' : roll < 0.75 ? 'body' : 'limb';
  const mult = part === 'head' ? 1.6 : part === 'body' ? 1 : 0.6;
  return { fired: true, hit: true, damage: w.damage * mult, part, dir };
}

export function killEnemy(enemy, now) {
  enemy.alive = false;
  enemy.dead = true;
  enemy.state = 'dead';
  enemy.burstLeft = 0;
  enemy.diedAt = now;
}

export function updateEnemy(enemy, player, now, dt, solids, bounds, rng, globalAlert) {
  if (enemy.dead) return { shots: [], sawPlayer: false };
  enemy.hitboxes = characterHitboxes(enemy.pos, enemy.yaw, enemy.radius, enemy.crouching, true);
  const events = { sawPlayer: false, shots: [] };
  const sees = canSeePlayer(enemy, player, solids, globalAlert);

  if (sees) {
    events.sawPlayer = true;
    enemy.lastSawAt = now;
    enemy.lastKnownPlayer = { x: player.pos.x, z: player.pos.z };
    if (enemy.state !== 'engage') {
      enemy.state = 'engage';
      enemy.stateChangedAt = now;
    }
  }

  const sinceSeen = now - enemy.lastSawAt;

  if (enemy.state === 'patrol') {
    if (globalAlert > 0.25) {
      enemy.state = 'alert';
      enemy.stateChangedAt = now;
    } else {
      const wp = enemy.patrol[enemy.patrolIndex];
      if (moveToward(enemy, wp, enemy.type.speed, dt, solids, bounds)) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
      }
    }
  }

  if (enemy.state === 'alert') {
    const target = enemy.lastKnownPlayer || enemy.patrol[0];
    moveToward(enemy, target, enemy.type.speed * 1.3, dt, solids, bounds);
    if (now - enemy.stateChangedAt > enemy.type.searchTime + 4 && globalAlert <= 0.25) {
      enemy.state = 'patrol';
      enemy.lastKnownPlayer = null;
    }
  }

  if (enemy.state === 'engage') {
    const target = enemy.lastKnownPlayer;
    const dist = dist2d(enemy.pos.x, enemy.pos.z, target.x, target.z);
    const desired = enemy.typeId === 'heavy' ? 12 : 10;
    if (now >= enemy.nextCoverCheck) {
      enemy.nextCoverCheck = now + 2.5 + rng.next() * 2;
      if (enemy.health < enemy.maxHealth * 0.5 || enemy.reloading || rng.next() < 0.3) {
        const cover = findNearbyCover(enemy, player.pos, solids);
        if (cover) enemy.coverTarget = cover;
      }
    }
    if (enemy.coverTarget) {
      if (moveToward(enemy, enemy.coverTarget, enemy.type.chaseSpeed * 0.9, dt, solids, bounds)) {
        enemy.coverTarget = null;
        enemy.crouching = true;
      }
    } else {
      enemy.crouching = false;
      if (dist > desired + 2) {
        moveToward(enemy, target, enemy.type.chaseSpeed, dt, solids, bounds);
      } else if (dist < desired - 3) {
        moveToward(
          enemy,
          { x: enemy.pos.x + (enemy.pos.x - target.x), z: enemy.pos.z + (enemy.pos.z - target.z) },
          enemy.type.chaseSpeed * 0.7, dt, solids, bounds
        );
      }
    }
    const aimYaw = Math.atan2(target.x - enemy.pos.x, -(target.z - enemy.pos.z));
    enemy.yaw += clamp(angleDiff(aimYaw, enemy.yaw), -8 * dt, 8 * dt);
    if (sees && dist < enemy.type.weapon.range) {
      if (enemy.burstLeft <= 0 && !enemy.reloading && now >= enemy.nextShotAt + 0.4) {
        enemy.burstLeft = enemy.type.weapon.burst;
      }
      const shot = enemyShoot(enemy, player, now, solids, rng);
      if (shot) events.shots.push(shot);
    }
    if (!sees && sinceSeen > enemy.type.loseTime) {
      enemy.state = 'search';
      enemy.stateChangedAt = now;
      enemy.searchTarget = { ...enemy.lastKnownPlayer };
      enemy.nextSearchMove = now;
      enemy.crouching = false;
    }
  }

  if (enemy.state === 'search') {
    if (now >= enemy.nextSearchMove || !enemy.searchTarget) {
      const ang = rng.next() * Math.PI * 2;
      const rad = 2 + rng.next() * 6;
      enemy.searchTarget = {
        x: clamp(enemy.lastKnownPlayer.x + Math.cos(ang) * rad, -28, 28),
        z: clamp(enemy.lastKnownPlayer.z + Math.sin(ang) * rad, -40, 40),
      };
      enemy.nextSearchMove = now + 2 + rng.next() * 2;
    }
    moveToward(enemy, enemy.searchTarget, enemy.type.chaseSpeed * 0.75, dt, solids, bounds);
    if (now - enemy.stateChangedAt > enemy.type.searchTime) {
      enemy.state = globalAlert > 0.25 ? 'alert' : 'patrol';
      enemy.stateChangedAt = now;
      enemy.lastKnownPlayer = null;
    }
  }

  return events;
}

export function resetEnemyIds() {
  enemyIdCounter = 0;
}
