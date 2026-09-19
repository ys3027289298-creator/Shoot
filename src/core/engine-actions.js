// Weapon, interaction and per-frame update actions operating on a game instance.
import { clamp, dist2D, moveWithCollisions } from './math.js';
import { updatePlayer, eyePosition } from './player.js';
import { updateEnemyAI } from './ai.js';
import { shootWeapon, aimDirection } from './combat.js';
import { allComplete, updateHoldObjective } from './objectives.js';
import { addItem, removeItem, canAdd, ITEM_DEFS } from './items.js';
import { damagePlayer } from './player.js';
import { doorBox } from './engine.js';

function startReload(game, def, ws) {
  if (ws.reloading || ws.ammo >= def.magSize) return;
  const reserve = game.inventory.reserve[def.ammoType] || 0;
  if (reserve <= 0) { game.notify('No reserve ammo'); return; }
  ws.reloading = true;
  ws.reloadElapsed = 0;
  ws.reloadTotal = def.reloadTime;
}

export function tickReload(game, def, ws, dt) {
  if (!ws.reloading) return;
  ws.reloadElapsed += dt;
  if (def.reloadShell) {
    if (ws.reloadElapsed >= def.reloadTime) {
      ws.reloadElapsed = 0;
      if (game.inventory.reserve[def.ammoType] > 0 && ws.ammo < def.magSize) {
        game.inventory.reserve[def.ammoType] -= 1;
        ws.ammo += 1;
      }
      if (ws.ammo >= def.magSize || game.inventory.reserve[def.ammoType] <= 0) ws.reloading = false;
    }
  } else if (ws.reloadElapsed >= ws.reloadTotal) {
    const need = def.magSize - ws.ammo;
    const take = Math.min(need, game.inventory.reserve[def.ammoType] || 0);
    game.inventory.reserve[def.ammoType] -= take;
    ws.ammo += take;
    ws.reloading = false;
  }
}

export function switchWeapon(game, id) {
  if (!game.arsenal.owned[id] || game.arsenal.current === id) return;
  game.arsenal.current = id;
  for (const ws of Object.values(game.arsenal.owned)) ws.reloading = false;
}

export function tryShoot(game) {
  const p = game.player;
  if (!p.alive || game.status !== 'playing') return;
  const id = game.arsenal.current;
  const def = game.weaponDefs[id];
  const ws = game.arsenal.owned[id];
  if (ws.reloading) return;
  const interval = 60 / def.rpm;
  if (game.time - ws.lastShotTime < interval) return;
  if (ws.ammo <= 0) {
    game.events.push({ type: 'dryFire', t: performance.now() });
    ws.lastShotTime = game.time;
    return;
  }
  ws.ammo -= 1;
  game.aimDir = aimDirection(p);
  game.eye = eyePosition(p);
  const wasAlive = new Set(game.enemies.filter((e) => e.alive).map((e) => e.id));
  shootWeapon(game, id);
  p.pitch = clamp(p.pitch + def.recoil * (p.ads ? 0.6 : 1), -1.45, 1.45);
  const noise = def.id === 'shotgun' ? 34 : 24;
  hearNoiseLocal(game, noise, def.id === 'shotgun' ? 0.34 : 0.22);
  game.events.push({ type: 'playerShot', weapon: id, t: performance.now() });
}

import { hearNoise } from './ai.js';
function hearNoiseLocal(game, radius, alertAdd) {
  hearNoise(game.enemies, game.player.pos[0], game.player.pos[2], radius, game.activeBoxes(), game.player);
  game.alert = clamp(game.alert + alertAdd, 0, 1);
}

export function reloadCurrent(game) {
  const id = game.arsenal.current;
  startReload(game, game.weaponDefs[id], game.arsenal.owned[id]);
}

function nearestDoor(game) {
  let best = null;
  let bestD = 2.2;
  const p = game.player.pos;
  for (const d of game.map.doors) {
    const dd = Math.hypot(p[0] - d.at, p[2] - d.fixed);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best;
}

function nearestPickup(game) {
  let best = null;
  let bestD = 1.8;
  const p = game.player.pos;
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    const dd = Math.hypot(p[0] - pk.x, p[2] - pk.z);
    if (dd < bestD) { bestD = dd; best = pk; }
  }
  return best;
}

export function interact(game) {
  if (game.status !== 'playing') return;
  const door = nearestDoor(game);
  if (door) {
    door.open = !door.open;
    game.notify(door.open ? `Opened: ${door.name}` : `Closed: ${door.name}`);
    game.events.push({ type: 'door', open: door.open, t: performance.now() });
    return;
  }
  const pk = nearestPickup(game);
  if (pk) {
    if (!canAdd(game.inventory, pk.itemId)) { game.notify('Backpack full'); return; }
    addItem(game.inventory, pk.itemId);
    pk.taken = true;
    game.notify(`Picked up ${ITEM_DEFS[pk.itemId].name}`);
    game.events.push({ type: 'pickup', item: pk.itemId, t: performance.now() });
    if (pk.itemId === 'dataDrive') {
      const obj = game.objectives.find((o) => o.id === 'data');
      obj.complete = true;
      obj.state = 'done';
      obj.progress = 1;
      game.alert = Math.min(1, game.alert + 0.25);
      game.notify('Objective complete: data drive acquired');
      for (const e of game.enemies) {
        if (e.alive && e.state === 'patrol') {
          e.state = 'suspicious';
          e.stateTime = 0;
          e.investigateTarget = [pk.x, pk.z];
        }
      }
    }
    return;
  }
  const h = game.hostage;
  if (h.alive && !h.freed && dist2D(h.pos, game.player.pos) < 2) {
    h.freed = true;
    game.notify('Detainee freed - escort them to extraction');
    game.alert = Math.min(1, game.alert + 0.3);
  }
}

export function useMedkit(game) {
  if (game.player.health <= 0) return;
  const idx = game.inventory.items.findIndex((i) => i.id === 'medkit');
  if (idx === -1) { game.notify('No medkit'); return; }
  if (game.player.health >= 100) { game.notify('Health already full'); return; }
  game.inventory.items.splice(idx, 1);
  game.player.health = Math.min(100, game.player.health + ITEM_DEFS.medkit.heal);
  game.notify('Medkit used (+50 HP)');
  game.events.push({ type: 'heal', t: performance.now() });
}

export function dropItem(game, uid) {
  const it = removeItem(game.inventory, uid);
  if (!it) return;
  const p = game.player.pos;
  game.pickups.push({
    id: `dropped_${uid}_${Math.floor(Math.random() * 1e6)}`,
    itemId: it.id, x: p[0], z: p.z + 1, taken: false,
  });
  game.notify(`Dropped ${ITEM_DEFS[it.id].name}`);
}

function updateHostage(game, dt, solids) {
  const h = game.hostage;
  if (!h.alive || !h.freed) return;
  const p = game.player.pos;
  const d = dist2D(h.pos, p);
  if (d > 1.2 && d < 40) {
    const dx = p[0] - h.pos[0];
    const dz = p[2] - h.pos[2];
    const speed = 3.4;
    const s = Math.min(speed, Math.max(0, (d - 0.6) / dt));
    const vel = [(dx / d) * s, h.vel[1], (dz / d) * s];
    vel[1] -= 15 * dt;
    const res = moveWithCollisions(h.pos, vel, dt, 0.35, 1.7, solids);
    h.pos = res.pos;
    h.vel = vel;
    if (res.onGround && vel[1] < 0) vel[1] = 0;
    if (h.pos[1] < 0) { h.pos[1] = 0; vel[1] = 0; }
    h.yaw = Math.atan2(-dx, -dz);
  }
  if (d > 40) game.notify('The detainee is being left behind!', 1.5);
}

function processEvents(game) {
  let spotted = false;
  let damageTaken = 0;
  for (const ev of game.events) {
    if (ev._seen) continue;
    ev._seen = true;
    if (ev.type === 'spotted') spotted = true;
    else if (ev.type === 'playerHit') damageTaken += ev.amount;
    else if (ev.type === 'hostageHit') game.hostage.alive = false;
  }
  if (spotted) {
    game.alert = clamp(game.alert + 0.2, 0, 1);
    for (const e of game.enemies) {
      if (e.alive && e.state === 'patrol' && dist2D(e.pos, game.player.pos) < 20) {
        e.state = 'suspicious';
        e.stateTime = 0;
        e.investigateTarget = [game.player.pos[0], game.player.pos[2]];
      }
    }
  }
  if (damageTaken > 0) game.stats.damageTaken += damageTaken;
}

function checkExtraction(game) {
  const z = game.map.zones.extraction;
  const dPlayer = Math.hypot(game.player.pos[0] - z.x, game.player.pos[2] - z.z);
  const hostageObj = game.objectives.find((o) => o.id === 'hostage');
  // hostage objective completes when the freed escort reaches the zone with the player
  if (!hostageObj.complete) {
    if (game.hostage.freed && game.hostage.alive) {
      const dH = Math.hypot(game.hostage.pos[0] - z.x, game.hostage.pos[2] - z.z);
      if (dPlayer < z.radius + 0.5 && dH < z.radius + 1.5) {
        hostageObj.complete = true;
        hostageObj.state = 'done';
        game.notify('Detainee extracted');
      }
    }
    game.extractionActive = false;
    return;
  }
  game.extractionActive = true;
  if (dPlayer < z.radius) {
    game.status = 'won';
    game.notices.push({ text: 'Extraction successful', ttl: 5 });
  }
}

export function updateGame(game, dt) {
  if (game.status !== 'playing') return;
  dt = Math.min(dt, 0.05);
  game.time += dt;
  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    game.status = 'lost';
    game.lossReason = 'Mission timer expired';
    return;
  }

  const solids = game.activeBoxes();
  updatePlayer(game.player, game.input, dt, solids);
  game.eye = eyePosition(game.player);

  const currentId = game.arsenal.current;
  tickReload(game, game.weaponDefs[currentId], game.arsenal.owned[currentId], dt);

  for (const e of game.enemies) {
    updateEnemyAI(e, game.player, dt, {
      solidBoxes: solids, map: game.map, alert: game.alert, events: game.events, time: game.time,
      hostage: game.hostage,
    });
  }

  updateHostage(game, dt, solids);

  if (updateHoldObjective(game, dt)) {
    game.notify('Objective complete: comms jammer disabled');
    game.alert = clamp(game.alert + 0.2, 0, 1);
  }

  processEvents(game);
  checkExtraction(game);

  if (!game.hostage.alive && game.status === 'playing') {
    game.status = 'lost';
    game.lossReason = 'The detainee was killed';
  }
  if (!game.player.alive && game.status === 'playing') {
    game.status = 'lost';
    game.lossReason = 'You were killed in action';
  }

  const anyAlerted = game.enemies.some((e) => e.alive && (e.state === 'engage' || e.state === 'search'));
  if (!anyAlerted) game.alert = Math.max(0, game.alert - dt * 0.012);

  for (const n of game.notices) n.ttl -= dt;
  game.notices = game.notices.filter((n) => n.ttl > 0);

  game.input.interactPressed = false;
  game.events = game.events.filter((e) => performance.now() - (e.t || 0) < 150);
}
