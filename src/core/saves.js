// Save / load across 3 slots. Geometry is rebuilt from the seed; dynamic state is serialized.
const PREFIX = 'tac_fps_save_v1_';
export const SAVE_SLOTS = 3;

export function listSaves(storage = localStorage) {
  const out = [];
  for (let i = 1; i <= SAVE_SLOTS; i++) {
    const raw = storage.getItem(PREFIX + i);
    if (!raw) { out.push({ slot: i, empty: true }); continue; }
    try {
      const data = JSON.parse(raw);
      out.push({ slot: i, empty: false, savedAt: data.savedAt, seed: data.seed,
        timeLeft: data.state?.timeLeft, kills: data.state?.stats?.kills });
    } catch {
      out.push({ slot: i, empty: false, corrupted: true });
    }
  }
  return out;
}

export function saveToSlot(slot, game, storage = localStorage) {
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    seed: game.seed,
    state: serialize(game),
  };
  storage.setItem(PREFIX + slot, JSON.stringify(data));
}

export function clearSlot(slot, storage = localStorage) {
  storage.removeItem(PREFIX + slot);
}

export function loadFromSlot(slot, storage = localStorage) {
  const raw = storage.getItem(PREFIX + slot);
  if (!raw) throw new Error(`Save slot ${slot} is empty`);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Save data is corrupted and could not be read');
  }
  if (!data || data.version !== 1 || !data.state || typeof data.seed !== 'number') {
    throw new Error('Save data is incompatible or damaged');
  }
  return data;
}

function serialize(g) {
  return {
    time: g.time,
    timeLeft: g.timeLeft,
    alert: g.alert,
    status: g.status,
    player: {
      pos: g.player.pos, vel: g.player.vel, yaw: g.player.yaw, pitch: g.player.pitch,
      health: g.player.health, armor: g.player.armor,
    },
    arsenal: g.arsenal,
    inventory: g.inventory,
    objectives: g.objectives,
    doors: g.map.doors.map((d) => ({ id: d.id, open: d.open })),
    pickups: g.pickups.map((pk) => ({ id: pk.id, taken: pk.taken })),
    enemies: g.enemies.map((e) => ({
      id: e.id, pos: e.pos, health: e.health, alive: e.alive, state: e.state,
      yaw: e.yaw, spotted: e.spotted,
    })),
    hostage: { pos: g.hostage.pos, freed: g.hostage.freed, alive: g.hostage.alive },
    stats: g.stats,
  };
}

export function applyState(game, state) {
  game.time = state.time;
  game.timeLeft = state.timeLeft;
  game.alert = state.alert;
  game.status = state.status;
  Object.assign(game.player, {
    pos: state.player.pos, vel: state.player.vel, yaw: state.player.yaw, pitch: state.player.pitch,
    health: state.player.health, armor: state.player.armor,
  });
  game.arsenal.current = state.arsenal.current;
  Object.assign(game.arsenal.owned.pistol, state.arsenal.owned.pistol);
  Object.assign(game.arsenal.owned.rifle, state.arsenal.owned.rifle);
  Object.assign(game.arsenal.owned.shotgun, state.arsenal.owned.shotgun);
  game.inventory.capacity = state.inventory.capacity;
  game.inventory.items = state.inventory.items;
  game.inventory.reserve = state.inventory.reserve;
  game.inventory.nextUid = state.inventory.nextUid;
  game.objectives = state.objectives;
  for (const d of state.doors) {
    const door = game.map.doors.find((x) => x.id === d.id);
    if (door) door.open = d.open;
  }
  for (const pk of state.pickups) {
    const live = game.pickups.find((x) => x.id === pk.id);
    if (live) live.taken = pk.taken;
  }
  for (const es of state.enemies) {
    const e = game.enemies.find((x) => x.id === es.id);
    if (e) Object.assign(e, { pos: es.pos, health: es.health, alive: es.alive, state: es.alive ? es.state : 'dead', yaw: es.yaw, spotted: es.spotted });
  }
  Object.assign(game.hostage, state.hostage);
  Object.assign(game.stats, state.stats);
}
