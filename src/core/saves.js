const SAVE_PREFIX = 'tae_save_';
export const SAVE_SLOTS = 3;
const SETTINGS_KEY = 'tae_settings';

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  quality: 'medium', // low | medium | high
  sensitivity: 1,
  fov: 75,
  invertY: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function serialize(game) {
  return {
    version: 1,
    savedAt: Date.now(),
    seed: game.seed,
    elapsed: game.elapsed,
    timeLeft: game.timeLeft,
    alert: game.alert,
    player: {
      pos: game.player.pos,
      yaw: game.player.yaw,
      pitch: game.player.pitch,
      health: game.player.health,
      armor: game.player.armor,
      currentWeapon: game.player.currentWeapon,
      weapons: game.player.weapons,
      inventory: game.player.inventory,
      kills: game.player.kills,
      shotsFired: game.player.shotsFired,
      shotsHit: game.player.shotsHit,
      damageTaken: game.player.damageTaken,
    },
    enemies: game.enemies.map((e) => ({
      typeId: e.typeId,
      pos: e.pos,
      yaw: e.yaw,
      health: e.health,
      dead: e.dead,
      state: e.state,
      patrolIndex: e.patrolIndex,
    })),
    pickups: game.pickups.filter((p) => !p.taken || p.id.startsWith('pk_drop')).map((p) => ({
      id: p.id, type: p.type, pos: p.pos, taken: p.taken,
    })),
    hostage: { pos: game.hostage.pos, alive: game.hostage.alive, health: game.hostage.health, tied: game.hostage.tied, following: game.hostage.following },
    objectives: game.objectives,
    extractionOpen: game.extractionOpen,
    doors: game.map.doors.map((d) => ({ id: d.id, open: d.open })),
    stats: game.stats,
  };
}

function validate(data) {
  if (!data || typeof data !== 'object' || data.version !== 1) return false;
  if (!data.player || !Array.isArray(data.enemies) || !data.objectives) return false;
  return true;
}

export function saveGame(slot, game) {
  if (slot < 0 || slot >= SAVE_SLOTS) throw new Error('无效的存档位置');
  const data = serialize(game);
  localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
  return { slot, savedAt: data.savedAt, elapsed: data.elapsed };
}

export function loadGameRaw(slot) {
  const raw = localStorage.getItem(SAVE_PREFIX + slot);
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`存档 ${slot + 1} 已损坏，无法读取（数据格式错误）。`);
  }
  if (!validate(data)) {
    throw new Error(`存档 ${slot + 1} 已损坏或版本不兼容，无法继续。`);
  }
  return data;
}

export function deleteSave(slot) {
  localStorage.removeItem(SAVE_PREFIX + slot);
}

export function listSaves() {
  const list = [];
  for (let i = 0; i < SAVE_SLOTS; i++) {
    const raw = localStorage.getItem(SAVE_PREFIX + i);
    if (!raw) {
      list.push({ slot: i, empty: true });
      continue;
    }
    try {
      const data = JSON.parse(raw);
      if (!validate(data)) {
        list.push({ slot: i, empty: false, corrupt: true });
      } else {
        list.push({
          slot: i,
          empty: false,
          savedAt: data.savedAt,
          timeLeft: Math.round(data.timeLeft),
          objectives: Object.values(data.objectives).filter((o) => o.done).length,
        });
      }
    } catch {
      list.push({ slot: i, empty: false, corrupt: true });
    }
  }
  return list;
}
