import { describe, it, expect } from 'vitest';
import { createGame, updateGame, tryShoot, interact, useMedkit, dropItem } from '../src/core/index.js';
import { hasLineOfSight } from '../src/core/ai.js';
import { box } from '../src/core/math.js';
import { addItem, usedSlots, BACKPACK_CAPACITY } from '../src/core/items.js';
import { saveToSlot, loadFromSlot, applyState } from '../src/core/saves.js';
import { eyePosition } from '../src/core/player.js';

function step(game, n = 1, dt = 0.05) {
  for (let i = 0; i < n; i++) updateGame(game, dt);
}

describe('enemy detection and AI', () => {
  it('sees a standing player in the open with clear LOS', () => {
    const g = createGame({ seed: 1 });
    const e = g.enemies[0];
    e.pos = [0, 0, 18];
    e.yaw = 0;
    g.player.pos = [0, 0, 22];
    expect(hasLineOfSight(e, g.player, g.activeBoxes(), 30)).toBe(true);
  });

  it('cannot see the player through a wall', () => {
    const g = createGame({ seed: 1 });
    const e = g.enemies[0];
    e.pos = [0, 0, 16];
    e.yaw = 0;
    g.player.pos = [0, 0, 20];
    g.map.cover.push(box(0, 1.5, 18.5, 4, 3, 0.4, 'wall', 'wallblock'));
    expect(hasLineOfSight(e, g.player, g.activeBoxes(), 30)).toBe(false);
  });

  it('enters engage when the player stands in view, and searches after losing LOS', () => {
    const g = createGame({ seed: 1 });
    const e = g.enemies[0];
    e.pos = [0, 0, 18];
    e.yaw = 0;
    e.route = [[0, 18]];
    g.player.pos = [0, 0, 22];
    step(g, 40, 0.05);
    expect(['engage', 'suspicious']).toContain(e.state);
    g.map.cover.push(box(0, 1.5, 20, 5, 3, 0.5, 'wall', 'hidewall'));
    step(g, 120, 0.05);
    expect(['search', 'patrol', 'suspicious']).toContain(e.state);
  });

  it('dead enemies stop moving and attacking', () => {
    const g = createGame({ seed: 1 });
    const e = g.enemies[0];
    e.pos = [0, 0, 18];
    e.yaw = 0;
    g.player.pos = [0, 0, 22];
    const before = g.stats.damageTaken;
    step(g, 10);
    const pos0 = [...e.pos];
    e.alive = false;
    e.state = 'dead';
    step(g, 40);
    expect(g.stats.damageTaken).toBe(before);
    expect(e.pos).toEqual(pos0);
  });
});

describe('stealth and alert', () => {
  it('crouch emits less noise than sprint', () => {
    const g = createGame({ seed: 1 });
    g.input.crouch = true;
    g.input.forward = 1;
    step(g, 10);
    const crouchNoise = g.player.noiseLevel;
    const g2 = createGame({ seed: 1 });
    g2.input.sprint = true;
    g2.input.forward = 1;
    step(g2, 10);
    expect(g2.player.noiseLevel).toBeGreaterThan(crouchNoise);
  });

  it('gunfire raises facility alert level', () => {
    const g = createGame({ seed: 1 });
    g.player.pitch = -0.5;
    g.eye = eyePosition(g.player);
    g.aimDir = [0, -1, 0];
    const a0 = g.alert;
    tryShoot(g);
    expect(g.alert).toBeGreaterThan(a0);
  });
});

describe('objectives and extraction', () => {
  it('completes the data objective by picking up the drive', () => {
    const g = createGame({ seed: 1 });
    const drive = g.pickups.find((p) => p.id === 'data_drive');
    g.player.pos = [drive.x, 0, drive.z];
    interact(g);
    expect(g.objectives.find((o) => o.id === 'data').complete).toBe(true);
  });

  it('jammer requires holding interaction for 3 seconds', () => {
    const g = createGame({ seed: 1 });
    const c = g.map.zones.console;
    g.player.pos = [c.x, 0, c.z];
    g.input.interactHeld = true;
    const obj = g.objectives.find((o) => o.id === 'jammer');
    step(g, 40, 0.05);
    expect(obj.complete).toBe(false);
    step(g, 40, 0.05);
    expect(obj.complete).toBe(true);
  });

  it('wins only when all objectives are complete and player reaches extraction', () => {
    const g = createGame({ seed: 1 });
    g.player.pos = [0, 0, 0]; // away from extraction (spawn is inside the zone)
    for (const o of g.objectives) { o.complete = true; o.state = 'done'; }
    g.hostage.alive = true;
    step(g, 4);
    expect(g.status).toBe('playing');
    g.player.pos = [0, 0, 28.5];
    step(g, 4);
    expect(g.status).toBe('won');
  });

  it('fails with a reason when the player dies or the timer expires', () => {
    const g = createGame({ seed: 1 });
    g.player.alive = false;
    g.player.dead = true;
    step(g, 2);
    expect(g.status).toBe('lost');
    expect(g.lossReason).toMatch(/killed/i);

    const g2 = createGame({ seed: 1 });
    g2.timeLeft = 0.01;
    step(g2, 2);
    expect(g2.status).toBe('lost');
    expect(g2.lossReason).toMatch(/timer/i);
  });

  it('fails when the hostage is killed', () => {
    const g = createGame({ seed: 1 });
    g.hostage.alive = false;
    step(g, 2);
    expect(g.status).toBe('lost');
    expect(g.lossReason).toMatch(/detainee/i);
  });
});

describe('inventory and supplies', () => {
  it('enforces backpack capacity', () => {
    const g = createGame({ seed: 1 });
    expect(addItem(g.inventory, 'medkit')).toBe(true);
    let added = 1;
    while (addItem(g.inventory, 'medkit')) added++;
    expect(usedSlots(g.inventory)).toBeLessThanOrEqual(BACKPACK_CAPACITY);
    expect(added).toBe(6);
  });

  it('uses and drops items; supplies are finite per map', () => {
    const g = createGame({ seed: 1 });
    g.player.health = 30;
    addItem(g.inventory, 'medkit');
    useMedkit(g);
    expect(g.player.health).toBe(80);
    const before = g.pickups.length;
    addItem(g.inventory, 'pistolAmmo');
    const uid = g.inventory.items[g.inventory.items.length - 1].uid;
    dropItem(g, uid);
    expect(g.pickups.length).toBe(before + 1);
    expect(g.pickups.filter((p) => p.itemId === 'rifleAmmo').length).toBeLessThanOrEqual(4);
  });
});

describe('saves', () => {
  it('round-trips a game through a save slot', () => {
    const storage = new Map();
    const ls = {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
    const g = createGame({ seed: 42 });
    g.player.health = 73;
    g.timeLeft = 200;
    saveToSlot(2, g, ls);
    const data = loadFromSlot(2, ls);
    expect(data.seed).toBe(42);
    const restored = createGame({ seed: data.seed });
    applyState(restored, data.state);
    expect(restored.player.health).toBe(73);
    expect(restored.timeLeft).toBeCloseTo(200);
  });

  it('throws a clear error on corrupted save data', () => {
    const storage = new Map([['tac_fps_save_v1_1', '{not json']]);
    const ls = {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
    expect(() => loadFromSlot(1, ls)).toThrow(/corrupt/i);
  });
});
