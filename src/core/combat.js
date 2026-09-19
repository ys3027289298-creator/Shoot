// Hitscan combat: real ray tests against walls AND enemy hit-zone AABBs.
import { add, norm, rayAABB, raycastBoxes, scale, dist } from './math.js';
import { enemyZones } from './enemy.js';
import { ZONE_MULTIPLIER, damageAtRange } from './weapons.js';
import { damageEnemy } from './enemy.js';

// Fire one ray. Returns {hit: 'enemy'|'wall'|null, enemy, zone, distance, point}
export function castShot(origin, dir, solidBoxes, enemies, maxDist) {
  const wallHit = raycastBoxes(origin, dir, solidBoxes, maxDist);
  let bestEnemy = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    for (const zBox of enemyZones(e)) {
      const hit = rayAABB(origin, dir, zBox);
      if (hit && hit.t <= maxDist) {
        if ((!wallHit || hit.t < wallHit.t) && (!bestEnemy || hit.t < bestEnemy.t)) {
          bestEnemy = { t: hit.t, enemy: e, zone: zBox.zone };
        }
      }
    }
  }
  if (bestEnemy) {
    return {
      kind: 'enemy', distance: bestEnemy.t, enemy: bestEnemy.enemy, zone: bestEnemy.zone,
      point: add(origin, scale(dir, bestEnemy.t)),
    };
  }
  if (wallHit) return { kind: 'wall', distance: wallHit.t, point: wallHit.point, box: wallHit.box };
  return { kind: null, distance: maxDist, point: add(origin, scale(dir, maxDist)) };
}

export function shootWeapon(game, weaponId) {
  const def = game.weaponDefs[weaponId];
  const ws = game.arsenal.owned[weaponId];
  const p = game.player;
  const results = [];
  for (let i = 0; i < def.pellets; i++) {
    const spread = p.ads ? def.spreadADS : def.spreadHip;
    // moving increases spread; crouch/ADS reduces it
    const movePenalty = Math.hypot(p.vel[0], p.vel[2]) / 7 * 0.02;
    const s = spread + movePenalty;
    const dir = applySpread(game.aimDir, s);
    const r = castShot(game.eye, dir, game.activeBoxes(), game.enemies, def.range);
    results.push(r);
    if (r.kind === 'enemy') {
      const base = damageAtRange(def, r.distance);
      const amount = base * ZONE_MULTIPLIER[r.zone];
      const { killed } = damageEnemy(r.enemy, amount, r.zone);
      game.stats.shotsHit += 1;
      game.stats.damageDealt += amount;
      game.events.push({ type: 'enemyDamaged', enemyId: r.enemy.id, zone: r.zone, amount, killed });
      if (killed) {
        game.stats.kills += 1;
        game.events.push({ type: 'enemyKilled', enemyId: r.enemy.id, point: r.point });
      }
    } else if (r.kind === 'wall') {
      game.events.push({ type: 'wallSpark', point: r.point, t: performance.now() });
    }
  }
  game.stats.shotsFired += def.pellets;
  ws.lastShotTime = game.time;
  return results;
}

export function applySpread(dir, spread) {
  return norm([
    dir[0] + (Math.random() - 0.5) * spread,
    dir[1] + (Math.random() - 0.5) * spread,
    dir[2] + (Math.random() - 0.5) * spread,
  ]);
}

// current aim direction from player yaw/pitch
export function aimDirection(p) {
  const cp = Math.cos(p.pitch);
  return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
}

export { dist };
