// Core game engine: simulation only (renderer-independent).
import { buildMap } from './map.js';
import { createPlayer, updatePlayer, eyePosition } from './player.js';
import { createEnemy } from './enemy.js';
import { updateEnemyAI, hearNoise } from './ai.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { createInventory, addItem, removeItem, canAdd, ITEM_DEFS, countItem } from './items.js';
import { createObjectives, allComplete, updateHoldObjective } from './objectives.js';
import { shootWeapon, aimDirection } from './combat.js';
import { clamp, dist2D, moveWithCollisions } from './math.js';

export const MISSION_TIME = 480; // 8 minutes

export function createGame(opts = {}) {
  const seed = opts.seed ?? (Date.now() % 100000);
  const map = buildMap(seed);
  const player = createPlayer(map.zones.spawn.x, map.zones.spawn.z);
  const inventory = createInventory();
  const arsenal = {
    current: 'pistol',
    owned: {
      pistol: { id: 'pistol', ammo: WEAPONS.pistol.magSize, reloading: false, reloadElapsed: 0, reloadTotal: 0, lastShotTime: -1 },
      rifle: { id: 'rifle', ammo: WEAPONS.rifle.magSize, reloading: false, reloadElapsed: 0, reloadTotal: 0, lastShotTime: -1 },
      shotgun: { id: 'shotgun', ammo: WEAPONS.shotgun.magSize, reloading: false, reloadElapsed: 0, reloadTotal: 0, lastShotTime: -1 },
    },
  };
  const enemies = map.enemyDefs.map((d) => createEnemy(d.type, d.x, d.z, d.route));

  const hostage = {
    pos: [map.zones.hostage.x, 0, map.zones.hostage.z],
    vel: [0, 0, 0],
    freed: false,
    alive: true,
    yaw: 0,
  };

  // world pickups: data drive + random supplies
  const pickups = [];
  const ds = map.dataSpot;
  pickups.push({ id: 'data_drive', itemId: 'dataDrive', x: ds.x, z: ds.z, taken: false });
  for (const s of map.supplies) {
    pickups.push({ id: s.id, itemId: s.item, x: s.x, z: s.z, taken: false });
  }

  const game = {
    seed,
    map,
    player,
    inventory,
    arsenal,
    enemies,
    hostage,
    pickups,
    objectives: createObjectives(),
    time: 0,
    timeLeft: MISSION_TIME,
    alert: 0, // 0..1 facility alert level
    events: [],
    status: 'playing', // playing | won | lost
    lossReason: '',
    notices: [], // {text, ttl}
    stats: {
      shotsFired: 0, shotsHit: 0, kills: 0, damageTaken: 0, damageDealt: 0,
    },
    input: {
      forward: 0, strafe: 0, jump: false, crouch: false, sprint: false, ads: false,
      fireHeld: false, interactHeld: false, interactPressed: false,
    },
    weaponDefs: WEAPONS,
    interactProgress: 0,
    aimDir: [0, 0, -1],
    eye: [0, 1.62, 0],
    extractionActive: false,
  };

  game.activeBoxes = () => {
    const result = [...map.walls, ...map.cover];
    for (const d of map.doors) {
      if (!d.open) result.push(doorBox(d));
    }
    return result;
  };

  game.notify = (text, ttl = 3) => {
    game.notices.push({ text, ttl });
  };

  return game;
}

export function doorBox(d) {
  const W = 1.4;
  const H = 2.4;
  const T = 0.12;
  if (d.axis === 'x') {
    return {
      min: [d.at - W / 2, 0, d.fixed - T / 2],
      max: [d.at + W / 2, H, d.fixed + T / 2],
      tag: 'door', id: d.id, solid: true,
    };
  }
  return {
    min: [d.fixed - T / 2, 0, d.at - W / 2],
    max: [d.fixed + T / 2, H, d.at + W / 2],
    tag: 'door', id: d.id, solid: true,
  };
}
