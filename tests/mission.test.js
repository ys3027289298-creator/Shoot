import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport } from './helpers.js';
import { interact, useInventoryItem, addAlert } from '../src/core/game.js';
import { addItem, removeOne, hasItem, createInventory, canCarry } from '../src/core/items.js';

test('data drive pickup into inventory then completing intel objective consumes it', () => {
  const game = makeGame();
  const drive = game.pickups.find((p) => p.type === 'data_drive');
  teleport(game, drive.pos.x, drive.pos.z, 0);
  interact(game, true);
  interact(game, false);
  assert.ok(hasItem(game.player.inventory, 'data_drive'), 'drive carried');

  // Intel terminal.
  teleport(game, -13, 9, 0);
  interact(game, true);
  for (let i = 0; i < 200; i++) {
    interact(game, true);
    tick(game, 1 / 60, { interact: true });
    if (game.objectives.intel.done) break;
  }
  assert.ok(game.objectives.intel.done, 'intel objective complete');
  assert.ok(!hasItem(game.player.inventory, 'data_drive'), 'drive consumed');
});

test('device objective completes after holding interact at terminal', () => {
  const game = makeGame();
  teleport(game, -13, -14, 0);
  for (let i = 0; i < 260; i++) {
    tick(game, 1 / 60, { interact: true });
    if (game.objectives.device.done) break;
  }
  assert.ok(game.objectives.device.done);
});

test('hostage rescue marks objective and hostage follows player', () => {
  const game = makeGame();
  teleport(game, 13, -14, 0);
  for (let i = 0; i < 200; i++) {
    tick(game, 1 / 60, { interact: true });
    if (game.objectives.hostage.done) break;
  }
  assert.ok(game.objectives.hostage.done);
  assert.ok(game.hostage.following);
});

test('extraction only succeeds with hostage present and all objectives done', () => {
  const game = makeGame();
  // Complete objectives via direct flags plus hostage follow state.
  for (const k of Object.keys(game.objectives)) game.objectives[k].done = true;
  game.stats.objectivesDone = 3;
  game.extractionOpen = true;
  game.hostage.tied = false;
  game.hostage.following = true;
  teleport(game, game.map.extraction.x, game.map.extraction.z, 0);
  game.hostage.pos.x = game.map.extraction.x;
  game.hostage.pos.z = game.map.extraction.z;
  tick(game, 0.2);
  assert.equal(game.status, 'won');
  assert.ok(game.extracted);
});

test('killing hostage fails mission as key target destroyed', async () => {
  const game = makeGame();
  game.hostage.health = 5;
  // Simulate a bullet hitting hostage.
  teleport(game, 13, -10.5, 0);
  game.player.pitch = Math.atan2(game.player.eyeHeight - 1.2, 3.5);
  game.player.currentWeapon = 'pistol';
  for (let i = 0; i < 6; i++) {
    game.player.weapons.pistol.mag = 12;
    game.player.weapons.pistol.lastShotAt = -999;
    const { fireWeapon } = await import('../src/core/game.js');
    fireWeapon(game);
    game.elapsed += 0.3;
    if (!game.hostage.alive) break;
  }
  assert.ok(!game.hostage.alive, 'hostage was killed');
  assert.equal(game.status, 'lost');
});

test('inventory capacity limits pickup and items can be dropped', () => {
  const inv = createInventory();
  for (let i = 0; i < 4; i++) assert.ok(addItem(inv, 'medkit')); // 2*4=8
  assert.ok(!canCarry(inv, 'bandage'), 'full inventory rejects item');
  assert.ok(removeOne(inv, 'medkit'));
  assert.ok(canCarry(inv, 'bandage'));
});

test('medical item heals the player', () => {
  const game = makeGame();
  game.player.health = 40;
  addItem(game.player.inventory, 'medkit');
  useInventoryItem(game, 0);
  assert.equal(game.player.health, 100);
});
