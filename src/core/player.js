import { clamp } from './math.js';
import { createWeaponState, WEAPONS, canFire, consumeRound, reloadWeapon, finishReload } from './weapons.js';
import { createInventory } from './items.js';
import { characterHitboxes } from './collision.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;

export function createPlayer(spawn) {
  return {
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, // facing north (-z): forward vector = (sin yaw, -cos yaw)
    pitch: 0,
    onGround: true,
    crouching: false,
    running: false,
    aiming: false,
    eyeHeight: EYE_STAND,
    radius: 0.4,
    health: 100,
    maxHealth: 100,
    armor: 0,
    maxArmor: 100,
    alive: true,
    speed: 5.2,
    currentWeapon: 'rifle',
    weapons: {
      pistol: createWeaponState('pistol'),
      rifle: createWeaponState('rifle'),
      shotgun: createWeaponState('shotgun'),
    },
    inventory: createInventory(),
    lastDamageAt: -99,
    lastDamageAmount: 0,
    damageDir: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageTaken: 0,
    kills: 0,
    useItemEndsAt: 0,
    usingItem: null,
  };
}

export function getEyeHeight(player) {
  const target = player.crouching ? EYE_CROUCH : EYE_STAND;
  player.eyeHeight += (target - player.eyeHeight) * 0.25;
  return player.eyeHeight;
}

export function eyePosition(player) {
  return { x: player.pos.x, y: player.pos.y + player.eyeHeight, z: player.pos.z };
}

export function updateHitboxes(player) {
  player.hitboxes = characterHitboxes(player.pos, player.yaw, player.radius, player.crouching, false);
}

export function applyDamage(player, amount, sourceYaw) {
  if (!player.alive) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining * 0.6);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health = clamp(player.health - remaining, 0, player.maxHealth);
  player.damageTaken += amount;
  player.lastDamageAt = performance.now() / 1000;
  player.lastDamageAmount = amount;
  if (sourceYaw !== undefined) player.damageDir = sourceYaw;
  if (player.health <= 0) {
    player.alive = false;
    if (player.game) {
      player.game.status = 'lost';
      player.game.failReason = player.game.failReason || '你在战斗中阵亡，任务失败。';
    }
  }
}

export function healPlayer(player, amount) {
  player.health = clamp(player.health + amount, 0, player.maxHealth);
}

export function addArmor(player, amount) {
  player.armor = clamp(player.armor + amount, 0, player.maxArmor);
}

export function switchWeapon(player, id) {
  if (!player.weapons[id]) return false;
  if (id === player.currentWeapon) return false;
  const ws = player.weapons[id];
  ws.reloading = false;
  player.currentWeapon = id;
  return true;
}

export function tryFire(player, now) {
  const ws = player.weapons[player.currentWeapon];
  const w = WEAPONS[player.currentWeapon];
  if (!canFire(ws, w, now)) return null;
  if (!consumeRound(ws)) return null;
  ws.lastShotAt = now;
  player.shotsFired += w.pellets;
  return { weapon: w, state: ws };
}

export function tryReload(player, now) {
  const ws = player.weapons[player.currentWeapon];
  return reloadWeapon(ws, WEAPONS[player.currentWeapon], now);
}

export function tickReload(player, now) {
  const ws = player.weapons[player.currentWeapon];
  if (ws.reloading && now >= ws.reloadEndsAt) {
    finishReload(ws, WEAPONS[player.currentWeapon]);
  }
}

export function addReserveAmmo(player, ammoType, amount) {
  for (const id of Object.keys(player.weapons)) {
    if (WEAPONS[id].ammoType === ammoType) {
      player.weapons[id].reserve += amount;
    }
  }
}
