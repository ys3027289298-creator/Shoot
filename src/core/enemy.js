// Enemy definitions, hit zones, state and basic motion / damage.
import { moveWithCollisions } from './math.js';

export const ENEMY_TYPES = {
  guard: {
    id: 'guard', name: 'Armed Guard', health: 80, speed: 3.2, radius: 0.38,
    viewRange: 26, fov: Math.PI * 0.55,
    fireRange: 24, fireInterval: 0.9, burstCount: 1, burstDelay: 0,
    damage: 9, spread: 0.045, hearing: 16,
    color: 0x6b7a52,
  },
  rusher: {
    id: 'rusher', name: 'Shotgun Breacher', health: 65, speed: 4.6, radius: 0.38,
    viewRange: 20, fov: Math.PI * 0.6,
    fireRange: 11, fireInterval: 1.5, burstCount: 1, burstDelay: 0,
    damage: 7, pellets: 6, spread: 0.09, hearing: 14,
    color: 0x7a5252,
  },
  heavy: {
    id: 'heavy', name: 'Armored Heavy', health: 220, speed: 2.3, radius: 0.5,
    viewRange: 28, fov: Math.PI * 0.5,
    fireRange: 28, fireInterval: 0.12, burstCount: 5, burstDelay: 0.12,
    burstPause: 1.4, damage: 8, spread: 0.06, hearing: 12, armor: true,
    color: 0x444b3a,
  },
};

let enemySeq = 1;

export function createEnemy(type, x, z, route = []) {
  const t = ENEMY_TYPES[type];
  return {
    id: `enemy_${enemySeq++}`,
    type,
    def: t,
    pos: [x, 0, z],
    vel: [0, 0, 0],
    yaw: 0,
    health: t.health,
    maxHealth: t.health,
    alive: true,
    state: 'patrol', // patrol | suspicious | engage | search
    stateTime: 0,
    route: route.length ? route.map(([rx, rz]) => [rx, rz]) : [[x, z]],
    routeIndex: 0,
    waitTime: 0,
    lastKnownPlayer: null,
    lastSeenTime: -99,
    searchTime: 0,
    searchTarget: null,
    coverTarget: null,
    fireCooldown: 0,
    burstLeft: 0,
    burstTimer: 0,
    burstPauseTimer: 0,
    strafeDir: 1,
    strafeTimer: 0,
    investigateTarget: null,
    spotted: false,
  };
}

// Hit zones as stacked AABBs (world space, based on feet position)
export function enemyZones(e) {
  const t = e.def;
  const r = t.radius;
  const h = e.pos[1];
  const x = e.pos[0];
  const z = e.pos[2];
  return [
    { zone: 'head', ref: e,
      min: [x - r * 0.55, h + 1.55, z - r * 0.55], max: [x + r * 0.55, h + 1.85, z + r * 0.55] },
    { zone: 'body', ref: e,
      min: [x - r, h + 0.85, z - r], max: [x + r, h + 1.55, z + r] },
    { zone: 'limb', ref: e,
      min: [x - r, h + 0.05, z - r], max: [x + r, h + 0.85, z + r] },
  ];
}

export function eyeOfEnemy(e) {
  return [e.pos[0], e.pos[1] + 1.62, e.pos[2]];
}

export function moveEnemyBody(e, dx, dz, dt, solidBoxes) {
  const vel = [dx, e.vel[1], dz];
  vel[1] -= 15 * dt;
  const res = moveWithCollisions(e.pos, vel, dt, e.def.radius, 1.8, solidBoxes);
  e.pos = res.pos;
  e.vel = vel;
  if (res.onGround && e.vel[1] < 0) e.vel[1] = 0;
  if (e.pos[1] < 0) { e.pos[1] = 0; e.vel[1] = 0; }
}

export function faceTowards(e, x, z, dt, turnRate = 6) {
  const target = Math.atan2(-(x - e.pos[0]), -(z - e.pos[2]));
  let d = target - e.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-turnRate * dt, Math.min(turnRate * dt, d));
  e.yaw += step;
}

export function damageEnemy(e, amount, zone) {
  if (!e.alive) return { killed: false, damage: 0 };
  let dmg = amount;
  if (e.def.armor && zone !== 'head') dmg *= 0.55;
  e.health -= dmg;
  let killed = false;
  if (e.health <= 0) {
    e.health = 0;
    e.alive = false;
    e.state = 'dead';
    killed = true;
  }
  return { killed, damage: dmg };
}
