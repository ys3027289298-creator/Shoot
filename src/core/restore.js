import { newGame } from './game.js';

export function restoreGame(data) {
  const game = newGame(data.seed);
  game.elapsed = data.elapsed;
  game.timeLeft = data.timeLeft;
  game.alert = data.alert;

  const p = game.player;
  p.pos = { ...data.player.pos };
  p.yaw = data.player.yaw;
  p.pitch = data.player.pitch;
  p.health = data.player.health;
  p.armor = data.player.armor;
  p.currentWeapon = data.player.currentWeapon;
  p.kills = data.player.kills;
  p.shotsFired = data.player.shotsFired;
  p.shotsHit = data.player.shotsHit;
  p.damageTaken = data.player.damageTaken;
  p.inventory = data.player.inventory;
  for (const [id, ws] of Object.entries(data.player.weapons)) {
    if (p.weapons[id]) Object.assign(p.weapons[id], ws);
  }

  data.enemies.forEach((ed, i) => {
    const e = game.enemies[i];
    if (!e) return;
    e.pos = { ...ed.pos };
    e.yaw = ed.yaw;
    e.health = ed.health;
    e.dead = !!ed.dead;
    e.alive = !ed.dead;
    e.state = ed.dead ? 'dead' : ed.state;
    e.patrolIndex = ed.patrolIndex || 0;
  });

  const restoredPickups = new Map(data.pickups.map((pk) => [pk.id, pk]));
  for (const pk of game.pickups) {
    const saved = restoredPickups.get(pk.id);
    if (saved) {
      pk.taken = saved.taken;
      pk.pos = { ...saved.pos };
    } else {
      pk.taken = true;
    }
  }
  for (const saved of data.pickups) {
    if (!game.pickups.some((pk) => pk.id === saved.id)) {
      game.pickups.push({ ...saved, pos: { ...saved.pos } });
    }
  }

  Object.assign(game.hostage, data.hostage);
  game.hostage.pos = { ...data.hostage.pos };
  Object.assign(game.objectives, data.objectives);
  game.extractionOpen = data.extractionOpen;
  Object.assign(game.stats, data.stats);
  for (const dd of data.doors) {
    const door = game.map.doors.find((d) => d.id === dd.id);
    if (door) door.open = dd.open;
  }
  return game;
}
