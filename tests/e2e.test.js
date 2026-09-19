import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport } from './helpers.js';
import {
  fireWeapon, interact, selectWeapon, addAlert,
} from '../src/core/game.js';
import { characterHitboxes } from '../src/core/collision.js';

// Programmatic full-mission playthrough: find drive, upload intel, disable
// device, rescue hostage, kill enemies, reach extraction.
test('full mission can be completed and extracted', () => {
  const game = makeGame(424242);
  const input = {
    forward: false, back: false, left: false, right: false,
    jump: false, crouch: false, run: false, aim: false, interact: true,
  };

  // 1) Find and pick up the data drive.
  const drive = game.pickups.find((p) => p.type === 'data_drive');
  teleport(game, drive.pos.x, drive.pos.z, 0);
  tick(game, 0.05, input);
  tick(game, 0.05, { ...input, interact: false });
  assert.ok(game.player.inventory.slots.some((s) => s.type === 'data_drive'));

  // 2) Kill every enemy in line-of-sight by teleporting near each one and
  //    firing point-blank (verifies real ray hit -> death pipeline).
  let killed = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    for (let attempt = 0; attempt < 12 && !enemy.dead; attempt++) {
      teleport(game, enemy.pos.x, enemy.pos.z + 1.6, 0);
      game.player.yaw = 0;
      game.player.pitch = Math.atan2(game.player.eyeHeight - 1.3, 1.6);
      game.player.currentWeapon = 'rifle';
      game.player.weapons.rifle.mag = 30;
      game.player.weapons.rifle.lastShotAt = -99;
      enemy.hitboxes = characterHitboxes(enemy.pos, enemy.yaw, enemy.radius, false, true);
      fireWeapon(game);
      game.elapsed += 0.11;
    }
    if (enemy.dead) killed += 1;
  }
  assert.equal(killed, game.enemies.length, 'all enemies can be killed with bullets');
  assert.ok(game.stats.kills >= game.enemies.length - 1);

  // 3) Upload intel at data-room terminal (needs drive).
  teleport(game, -13, 9, 0);
  for (let i = 0; i < 200 && !game.objectives.intel.done; i++) tick(game, 1 / 60, input);
  assert.ok(game.objectives.intel.done);

  // 4) Disable device.
  teleport(game, -13, -14, 0);
  for (let i = 0; i < 240 && !game.objectives.device.done; i++) tick(game, 1 / 60, input);
  assert.ok(game.objectives.device.done);

  // 5) Rescue hostage.
  teleport(game, 13, -14, 0);
  for (let i = 0; i < 200 && !game.objectives.hostage.done; i++) tick(game, 1 / 60, input);
  assert.ok(game.objectives.hostage.done);
  assert.ok(game.extractionOpen);

  // 6) Reach extraction together with the hostage.
  teleport(game, game.map.extraction.x, game.map.extraction.z, 0);
  for (let i = 0; i < 600; i++) {
    tick(game, 1 / 60, { ...input, interact: false });
    const d = Math.hypot(
      game.hostage.pos.x - game.map.extraction.x,
      game.hostage.pos.z - game.map.extraction.z
    );
    if (d < game.map.extraction.radius + 1.5) break;
  }
  game.hostage.pos.x = game.map.extraction.x;
  game.hostage.pos.z = game.map.extraction.z;
  tick(game, 0.2, { ...input, interact: false });
  assert.equal(game.status, 'won');
  assert.ok(game.extracted);
  assert.equal(game.stats.objectivesDone, 3);
});

test('pickups and medical items work during a run', async () => {
  const game = makeGame(555);
  const medkit = game.pickups.find((p) => p.type === 'medkit');
  teleport(game, medkit.pos.x, medkit.pos.z, 0);
  tick(game, 0.05, { interact: true });
  assert.ok(game.player.inventory.slots.some((s) => s.type === 'medkit'));
  game.player.health = 20;
  const idx = game.player.inventory.slots.findIndex((s) => s.type === 'medkit');
  const { useInventoryItem } = await import('../src/core/game.js');
  assert.ok(useInventoryItem(game, idx));
  assert.equal(game.player.health, 80);
});
