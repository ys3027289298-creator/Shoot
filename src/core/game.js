import { buildMap } from './map.js';
import { createRng, randomSeed } from './rng.js';
import { clamp, dist2d } from './math.js';
import {
  createPlayer, getEyeHeight, eyePosition, updateHitboxes, applyDamage,
  healPlayer, addArmor, switchWeapon, tryFire, tryReload, tickReload,
  addReserveAmmo,
} from './player.js';
import { WEAPONS } from './weapons.js';
import { ITEM_TYPES, addItem, canCarry, dropItem, removeOne, hasItem } from './items.js';
import { createEnemy, updateEnemy, killEnemy, resetEnemyIds } from './enemy.js';
import { raycastSolids, raycastCharacters, moveWithCollision } from './collision.js';

export const MISSION_TIME = 480;

const ENEMY_COMPOSITION = [
  'guard', 'scout', 'guard', 'guard', 'guard', 'guard',
  'scout', 'guard', 'heavy', 'guard', 'guard',
];

export function newGame(seed = randomSeed()) {
  const map = buildMap();
  resetEnemyIds();
  const rng = createRng(seed);
  const player = createPlayer(map.playerSpawn);

  const points = rng.shuffle([...map.supplyPoints]);
  const pickups = [];
  const drivePoint = points.pop();
  pickups.push({ id: 'pk_drive', type: 'data_drive', pos: { x: drivePoint.x, z: drivePoint.z }, taken: false });
  const lootTable = ['medkit', 'bandage', 'bandage', 'armor', 'ammo_pistol',
    'ammo_pistol', 'ammo_rifle', 'ammo_rifle', 'ammo_rifle', 'ammo_shotgun', 'ammo_shotgun'];
  rng.shuffle(lootTable);
  for (let i = 0; i < Math.min(11, points.length); i++) {
    pickups.push({ id: `pk_${i}`, type: lootTable[i % lootTable.length], pos: { x: points[i].x, z: points[i].z }, taken: false });
  }

  const enemies = map.enemyAnchors.map((anchor, i) =>
    createEnemy(ENEMY_COMPOSITION[i % ENEMY_COMPOSITION.length], anchor));

  const hostage = {
    id: 'hostage',
    pos: { x: 13, y: 0, z: -14 },
    radius: 0.38,
    alive: true,
    health: 60,
    tied: true,
    following: false,
  };

  const game = {
    seed,
    rng,
    map,
    player,
    enemies,
    pickups,
    hostage,
    timeLeft: MISSION_TIME,
    elapsed: 0,
    alert: 0,
    status: 'playing',
    failReason: '',
    objectives: {
      intel: { done: false, hold: 0 },
      device: { done: false, hold: 0 },
      hostage: { done: false, hold: 0 },
    },
    extractionOpen: false,
    extracted: false,
    effects: [],
    hitMarkers: [],
    notifications: [],
    interactPrompt: '',
    stats: {
      shotsFired: 0, shotsHit: 0, kills: 0, damageTaken: 0,
      objectivesDone: 0, alertsTriggered: 0,
    },
    lastGunshotAt: -99,
    missionTime: MISSION_TIME,
  };
  player.game = game;
  updateHitboxes(player);
  return game;
}

export function notify(game, text, ttl = 2.5) {
  game.notifications.push({ text, until: game.elapsed + ttl });
}

export function solidsList(game) {
  return game.map.allSolids.filter((b) => b.open !== true);
}

export function viewDirection(yaw, pitch) {
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: -Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

function hostageTarget(hostage) {
  return {
    id: 'hostage',
    isHostage: true,
    dead: !hostage.alive,
    pos: hostage.pos,
    hitboxes: [
      { part: 'head', minX: hostage.pos.x - 0.2, maxX: hostage.pos.x + 0.2, minZ: hostage.pos.z - 0.2, maxZ: hostage.pos.z + 0.2, minY: 1.55, maxY: 1.85 },
      { part: 'body', minX: hostage.pos.x - 0.35, maxX: hostage.pos.x + 0.35, minZ: hostage.pos.z - 0.35, maxZ: hostage.pos.z + 0.35, minY: 0.8, maxY: 1.55 },
      { part: 'limb', minX: hostage.pos.x - 0.3, maxX: hostage.pos.x + 0.3, minZ: hostage.pos.z - 0.3, maxZ: hostage.pos.z + 0.3, minY: 0.05, maxY: 0.85 },
    ],
  };
}

export function fireWeapon(game) {
  const now = game.elapsed;
  const fired = tryFire(game.player, now);
  if (!fired) return [];
  const { weapon } = fired;
  const solids = solidsList(game);
  const eye = eyePosition(game.player);
  const results = [];
  const moving = Math.hypot(game.player.vel.x, game.player.vel.z) > 0.5;
  let baseSpread = game.player.aiming ? weapon.aimSpread : weapon.spread;
  if (moving) baseSpread += weapon.moveSpread;
  if (game.player.crouching) baseSpread *= 0.7;

  for (let p = 0; p < weapon.pellets; p++) {
    const spread = Math.max(0.0005, baseSpread) * (game.player.aiming ? 1 : 1.3);
    const sx = (game.rng.next() - 0.5) * 2 * spread;
    const sy = (game.rng.next() - 0.5) * 2 * spread;
    const dir = viewDirection(game.player.yaw + sx, clamp(game.player.pitch + sy, -1.5, 1.5));

    const wallHit = raycastSolids(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, weapon.range, solids);
    const targets = [
      ...game.enemies,
      ...(game.hostage.alive ? [hostageTarget(game.hostage)] : []),
    ];
    const charHit = raycastCharacters(eye.x, eye.y, eye.z, dir, weapon.range, targets);
    let endDist = weapon.range;
    if (wallHit) endDist = Math.min(endDist, wallHit.dist);
    if (charHit) endDist = Math.min(endDist, charHit.dist);
    const end = { x: eye.x + dir.x * endDist, y: eye.y + dir.y * endDist, z: eye.z + dir.z * endDist };
    let hitInfo = null;
    if (charHit && (!wallHit || charHit.dist <= wallHit.dist + 0.05)) {
      hitInfo = applyHit(game, charHit, weapon);
      game.player.shotsHit += 1;
      game.stats.shotsHit += 1;
      game.hitMarkers.push({ at: now, head: charHit.part === 'head' });
    }
    results.push({ from: { ...eye }, end, hit: hitInfo });
    game.effects.push({ kind: 'tracer', from: { ...eye }, to: end, until: now + 0.06 });
  }
  game.stats.shotsFired += weapon.pellets;
  game.lastGunshotAt = now;
  addAlert(game, weapon.id === 'shotgun' ? 0.22 : 0.14);
  return results;
}

function applyHit(game, charHit, weapon) {
  const target = charHit.character;
  const dmg = weapon.damage[charHit.part] || weapon.damage.body;
  if (target.isHostage) {
    game.hostage.health -= dmg;
    if (game.hostage.health <= 0 && game.hostage.alive) {
      game.hostage.alive = false;
      game.status = 'lost';
      game.failReason = '关键目标（被俘人员）被击杀，任务失败。';
    }
    return { hostage: true, damage: dmg, part: charHit.part };
  }
  target.health -= dmg;
  target.lastSawAt = game.elapsed;
  target.lastKnownPlayer = { x: game.player.pos.x, z: game.player.pos.z };
  if (target.state !== 'engage') {
    target.state = 'engage';
    target.stateChangedAt = game.elapsed;
  }
  let killed = false;
  if (target.health <= 0 && !target.dead) {
    killEnemy(target, game.elapsed);
    game.player.kills += 1;
    game.stats.kills += 1;
    addAlert(game, 0.1);
    killed = true;
  }
  return { enemyId: target.id, damage: dmg, part: charHit.part, killed };
}

export function addAlert(game, amount) {
  const before = game.alert;
  game.alert = clamp(game.alert + amount, 0, 1);
  if (before < 0.3 && game.alert >= 0.3) game.stats.alertsTriggered += 1;
}

export function updatePlayerMovement(game, input, dt) {
  const p = game.player;
  if (!p.alive) return;
  const fwd = { x: Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const right = { x: Math.cos(p.yaw), z: Math.sin(p.yaw) };
  let ix = 0;
  let iz = 0;
  if (input.forward) { ix += fwd.x; iz += fwd.z; }
  if (input.back) { ix -= fwd.x; iz -= fwd.z; }
  if (input.right) { ix += right.x; iz += right.z; }
  if (input.left) { ix -= right.x; iz -= right.z; }
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }
  p.crouching = !!input.crouch;
  p.running = !!input.run && !p.crouching && input.forward && !p.aiming;
  p.aiming = !!input.aim;
  let speed = p.speed;
  if (p.crouching) speed *= 0.5;
  if (p.running) speed *= 1.7;
  if (p.aiming) speed *= 0.65;
  const targetVx = ix * speed;
  const targetVz = iz * speed;
  p.vel.x += (targetVx - p.vel.x) * Math.min(1, dt * 12);
  p.vel.z += (targetVz - p.vel.z) * Math.min(1, dt * 12);

  const solids = solidsList(game);
  moveWithCollision(p.pos, p.vel.x * dt, p.vel.z * dt, p.radius, solids, game.map.bounds);

  if (input.jump && p.onGround && !p.crouching) {
    p.vel.y = 5.4;
    p.onGround = false;
  }
  p.vel.y -= 16 * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.onGround = true;
  }
  getEyeHeight(p);
  updateHitboxes(p);

  if (p.running && len > 0) {
    for (const e of game.enemies) {
      if (e.dead) continue;
      if (dist2d(p.pos.x, p.pos.z, e.pos.x, e.pos.z) < 7) addAlert(game, dt * 0.02);
    }
  }
}

export function reload(game) {
  return tryReload(game.player, game.elapsed);
}

export function selectWeapon(game, id) {
  return switchWeapon(game.player, id);
}

export function nearestInteraction(game) {
  const p = game.player;
  let best = null;
  const consider = (cand) => {
    if (!best || cand.dist < best.dist) best = cand;
  };
  for (const d of game.map.doors) {
    const dist = dist2d(p.pos.x, p.pos.z, d.x, d.z);
    if (dist < 2.6) consider({ kind: 'door', id: d.id, label: `${d.open ? '关闭' : '打开'} ${d.name}`, dist });
  }
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    const dist = dist2d(p.pos.x, p.pos.z, pk.pos.x, pk.pos.z);
    if (dist < 1.9) consider({ kind: 'pickup', id: pk.id, label: `拾取 ${ITEM_TYPES[pk.type].name}`, dist });
  }
  for (const [id, obj] of Object.entries(game.map.objectives)) {
    if (game.objectives[id].done) continue;
    const dist = dist2d(p.pos.x, p.pos.z, obj.zone.x, obj.zone.z);
    if (dist > obj.zone.radius + 0.8) continue;
    if (id === 'hostage') {
      if (game.hostage.tied) consider({ kind: 'objective', id, label: '解开被俘人员束缚 (按住 E)', dist });
    } else if (id === 'intel') {
      if (!hasItem(p.inventory, 'data_drive')) {
        consider({ kind: 'hint', id, label: '终端需要“加密数据盘”，先在设施内搜寻', dist });
      } else {
        consider({ kind: 'objective', id, label: '上传情报资料 (按住 E)', dist });
      }
    } else {
      consider({ kind: 'objective', id, label: '关闭干扰设备 (按住 E)', dist });
    }
  }
  return best;
}

function completeObjective(game, id) {
  if (game.objectives[id].done) return;
  game.objectives[id].done = true;
  game.stats.objectivesDone += 1;
  const names = { intel: '取得情报资料', device: '关闭通讯干扰设备', hostage: '救出被俘人员' };
  notify(game, `任务目标完成：${names[id]}`, 3.5);
  if (game.objectives.intel.done && game.objectives.device.done && game.objectives.hostage.done) {
    game.extractionOpen = true;
    notify(game, '所有目标完成！前往北侧撤离点 (绿色信号烟雾)', 5);
  }
}

export function interact(game, held) {
  const target = nearestInteraction(game);
  game.interactPrompt = target ? target.label : '';
  if (!held) {
    for (const key of Object.keys(game.objectives)) game.objectives[key].hold = 0;
    return;
  }
  if (!target) return;
  if (target.kind === 'door') {
    const door = game.map.doors.find((d) => d.id === target.id);
    door.open = !door.open;
    notify(game, `${door.open ? '打开' : '关闭'}：${door.name}`, 1.2);
    return;
  }
  if (target.kind === 'pickup') {
    const pk = game.pickups.find((x) => x.id === target.id);
    if (!pk.taken && canCarry(game.player.inventory, pk.type)) {
      addItem(game.player.inventory, pk.type);
      pk.taken = true;
      notify(game, `已拾取：${ITEM_TYPES[pk.type].name}`, 1.5);
    } else if (!canCarry(game.player.inventory, pk.type)) {
      notify(game, '背包空间不足，无法拾取', 1.5);
    }
    return;
  }
  if (target.kind === 'objective') {
    const def = game.map.objectives[target.id];
    const state = game.objectives[target.id];
    state.hold += 1 / 60;
    if (state.hold >= (def.holdSeconds || 1.5)) {
      state.hold = 0;
      if (target.id === 'intel') {
        if (removeOne(game.player.inventory, 'data_drive')) completeObjective(game, 'intel');
      } else if (target.id === 'hostage') {
        game.hostage.tied = false;
        game.hostage.following = true;
        completeObjective(game, 'hostage');
      } else {
        completeObjective(game, 'device');
      }
    }
  }
}

export function useInventoryItem(game, slotIndex) {
  const p = game.player;
  const slot = p.inventory.slots[slotIndex];
  if (!slot) return false;
  const def = ITEM_TYPES[slot.type];
  if (def.heal && p.health >= p.maxHealth) {
    notify(game, '生命值已满', 1.2);
    return false;
  }
  if (def.heal) {
    healPlayer(p, def.heal);
    removeOne(p.inventory, slot.type);
    notify(game, `使用：${def.name}，恢复 ${def.heal} 生命`, 1.5);
    return true;
  }
  if (def.armor) {
    addArmor(p, def.armor);
    removeOne(p.inventory, slot.type);
    notify(game, `装备：${def.name}，护甲 +${def.armor}`, 1.5);
    return true;
  }
  if (slot.type.startsWith('ammo_')) {
    addReserveAmmo(p, slot.type, def.amount);
    removeOne(p.inventory, slot.type);
    notify(game, `装填备用弹药：${def.name} +${def.amount}`, 1.5);
    return true;
  }
  notify(game, `${def.name} 无法直接使用`, 1.5);
  return false;
}

export function dropInventoryItem(game, slotIndex) {
  const type = dropItem(game.player.inventory, slotIndex);
  if (!type) return false;
  const p = game.player;
  game.pickups.push({
    id: `pk_drop_${Date.now()}`,
    type,
    pos: { x: p.pos.x, y: 0, z: p.pos.z },
    taken: false,
  });
  notify(game, `丢弃：${ITEM_TYPES[type].name}`, 1.2);
  return true;
}

function updateHostage(game, dt, solids) {
  const h = game.hostage;
  if (!h.alive || !h.following) return;
  const p = game.player;
  const dist = dist2d(h.pos.x, h.pos.z, p.pos.x, p.pos.z);
  h.stuckTime = h.stuckTime || 0;
  // Teleport catch-up: if the player is far ahead for a while (long detour),
  // the rescued person rejoins the squad at a free spot near the player.
  if (dist > 13) {
    const spot = findFreeSpot(game, p.pos.x, p.pos.z, 2.5);
    h.pos.x = spot.x;
    h.pos.z = spot.z;
    h.stuckTime = 0;
    return;
  }
  if (dist > 1.8) {
    const dx = p.pos.x - h.pos.x;
    const dz = p.pos.z - h.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    const speed = 5.2;
    // Open any door directly along the path.
    for (const door of game.map.doors) {
      const dd = dist2d(h.pos.x, h.pos.z, door.x, door.z);
      if (dd < 2.6 && !door.open) door.open = true;
    }
    const solidsNow = solidsList(game);
    const start = { x: h.pos.x, z: h.pos.z };
    moveWithCollision(h.pos, nx * speed * dt, nz * speed * dt, h.radius, solidsNow, game.map.bounds);
    const moved = Math.hypot(h.pos.x - start.x, h.pos.z - start.z);
    if (moved < speed * dt * 0.35) {
      h.stuckTime += dt;
      // Probe several angles toward the player to route around corners.
      let best = null;
      for (const ang of [-0.9, 0.9, -1.6, 1.6, Math.PI / 2, -Math.PI / 2]) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const wx = nx * ca - nz * sa;
        const wz = nx * sa + nz * ca;
        const trial = { x: start.x, z: start.z };
        moveWithCollision(trial, wx * speed * dt, wz * speed * dt, h.radius, solidsNow, game.map.bounds);
        const md = Math.hypot(trial.x - start.x, trial.z - start.z);
        if (md > 0.001 && (!best || md > best.md)) best = { md, x: trial.x, z: trial.z };
      }
      if (best) {
        h.pos.x = best.x;
        h.pos.z = best.z;
      }
      if (h.stuckTime > 1.2 && dist < 8) {
        const spot = findFreeSpot(game, p.pos.x, p.pos.z, 1.6);
        h.pos.x = spot.x;
        h.pos.z = spot.z;
        h.stuckTime = 0;
      }
    } else {
      h.stuckTime = 0;
    }
  }
}

function findFreeSpot(game, x, z, radius) {
  const solids = solidsList(game);
  for (let attempt = 0; attempt < 16; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const r = radius + Math.random() * 2.5;
    const tx = x + Math.cos(ang) * r;
    const tz = z + Math.sin(ang) * r;
    let clear = true;
    for (const b of solids) {
      if (
        tx > b.minX - 0.35 && tx < b.maxX + 0.35 &&
        tz > b.minZ - 0.35 && tz < b.maxZ + 0.35
      ) {
        clear = false;
        break;
      }
    }
    if (clear) return { x: tx, z: tz };
  }
  return { x, z };
}

// Main fixed-ish step. input: movement flags.
export function updateGame(game, input, dt) {
  if (game.status !== 'playing') return;
  game.elapsed += dt;
  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    game.status = 'lost';
    game.failReason = '任务时间结束，未能在时限内撤离。';
    return;
  }

  updatePlayerMovement(game, input, dt);
  tickReload(game.player, game.elapsed);

  const solids = solidsList(game);
  let anySees = false;
  for (const enemy of game.enemies) {
    const ev = updateEnemy(enemy, game.player, game.elapsed, dt, solids, game.map.bounds, game.rng, game.alert);
    if (ev.sawPlayer) anySees = true;
    for (const shot of ev.shots) {
      if (shot.hit && game.player.alive) {
        applyDamage(game.player, shot.damage, undefined);
        game.stats.damageTaken = game.player.damageTaken;
        if (!game.player.alive) {
          game.status = 'lost';
          game.failReason = '你在战斗中阵亡，任务失败。';
        }
      }
    }
  }
  if (anySees) addAlert(game, dt * 0.06);

  // Alert decays when nobody sees the player and no recent gunfire.
  if (!anySees && game.elapsed - game.lastGunshotAt > 4) {
    game.alert = clamp(game.alert - dt * 0.03, 0, 1);
  }

  updateHostage(game, dt, solids);
  interact(game, !!input.interact);

  // Extraction.
  if (game.extractionOpen) {
    const ex = game.map.extraction;
    const playerAt = dist2d(game.player.pos.x, game.player.pos.z, ex.x, ex.z) < ex.radius;
    const hostageAt = !game.hostage.alive ||
      dist2d(game.hostage.pos.x, game.hostage.pos.z, ex.x, ex.z) < ex.radius + 1.5;
    if (playerAt && hostageAt) {
      game.status = 'won';
      game.extracted = true;
      game.timeLeft = Math.round(game.timeLeft);
    }
  }

  // Expire transient effects.
  game.effects = game.effects.filter((e) => game.elapsed < e.until);
  game.hitMarkers = game.hitMarkers.filter((h) => game.elapsed - h.at < 0.12);
  game.notifications = game.notifications.filter((n) => game.elapsed < n.until);
}

export function getAccuracy(game) {
  if (game.stats.shotsFired === 0) return 0;
  return Math.round((game.stats.shotsHit / game.stats.shotsFired) * 100);
}
