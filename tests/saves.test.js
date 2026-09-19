import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport } from './helpers.js';

// Minimal localStorage shim for Node tests.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const { saveGame, loadGameRaw, listSaves, deleteSave, SAVE_SLOTS } = await import('../src/core/saves.js');
const { restoreGame } = await import('../src/core/restore.js');

test('game saves and restores progress across a reload cycle', () => {
  const game = makeGame(777);
  teleport(game, 5, 10, 1.2);
  game.player.health = 63;
  game.timeLeft = 300;
  game.objectives.device.done = true;
  saveGame(1, game);
  const data = loadGameRaw(1);
  assert.equal(data.timeLeft, 300);
  const restored = restoreGame(data);
  assert.equal(restored.player.health, 63);
  assert.equal(restored.player.pos.x, 5);
  assert.ok(restored.objectives.device.done);
});

test('three save slots are supported and empty slots read as null', () => {
  localStorage.clear();
  assert.equal(loadGameRaw(0), null);
  const g = makeGame();
  saveGame(0, g);
  saveGame(2, g);
  const list = listSaves();
  assert.equal(list.length, 3);
  assert.ok(!list[0].empty);
  assert.ok(list[1].empty);
  assert.ok(!list[2].empty);
});

test('corrupt save throws a clear error', () => {
  localStorage.clear();
  localStorage.setItem('tae_save_0', '{not valid json');
  assert.throws(() => loadGameRaw(0), /损坏/);
  localStorage.setItem('tae_save_0', JSON.stringify({ version: 99 }));
  assert.throws(() => loadGameRaw(0), /损坏|兼容/);
});

test('deleting a save frees the slot', () => {
  localStorage.clear();
  const g = makeGame();
  saveGame(0, g);
  deleteSave(0);
  assert.equal(loadGameRaw(0), null);
});
