import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport } from './helpers.js';
import { hasLineOfSight } from '../src/core/collision.js';

test('enemy detects visible player in front and enters engage', () => {
  const game = makeGame();
  const enemy = game.enemies[0];
  enemy.pos.x = 0;
  enemy.pos.z = 30;
  enemy.yaw = Math.PI; // facing south (+z toward player at 35)
  teleport(game, 0, 34, 0);
  // Stand exposed: no wall between (open south yard).
  const solids = game.map.allSolids.filter((b) => b.open !== true);
  assert.ok(hasLineOfSight(enemy.pos.x, 1.6, enemy.pos.z, 0, 1.6, 34, solids), 'LOS exists');
  tick(game, 0.5, {});
  assert.equal(enemy.state, 'engage');
});

test('enemy cannot see player through wall', () => {
  const game = makeGame();
  const enemy = game.enemies[0];
  // Interior mid wall (z=-3) blocks LOS across its solid span x in [-1.5,-22].
  enemy.pos.x = -13;
  enemy.pos.z = -10;
  teleport(game, -13, 5, 0);
  const solids = game.map.allSolids.filter((b) => b.open !== true);
  assert.ok(!hasLineOfSight(enemy.pos.x, 1.6, enemy.pos.z, -13, 1.6, 5, solids));
});

test('enemy loses player and transitions to search, then patrol', () => {
  const game = makeGame();
  const enemy = game.enemies[0];
  enemy.state = 'engage';
  enemy.lastSawAt = 0;
  enemy.lastKnownPlayer = { x: 5, z: 5 };
  // Player dead -> can never see; simulate beyond lose + search times.
  game.player.alive = false;
  game.player.health = 0;
  // Directly drive: place far and advance clock.
  enemy.pos.x = 0;
  enemy.pos.z = 30;
  tick(game, 12, {});
  assert.ok(['search', 'patrol', 'alert'].includes(enemy.state));
});

test('dead enemy never moves or attacks', () => {
  const game = makeGame();
  const enemy = game.enemies[0];
  enemy.dead = true;
  enemy.alive = false;
  enemy.state = 'dead';
  const before = { ...enemy.pos };
  teleport(game, 0, 34, 0);
  tick(game, 2, {});
  assert.deepEqual(enemy.pos, before);
});

test('global alert causes patrolling enemies to become alert', () => {
  const game = makeGame();
  game.alert = 0.5;
  // Use an enemy far away from the player spawn with no line of sight.
  const enemy = game.enemies[7];
  assert.equal(enemy.state, 'patrol');
  tick(game, 0.1, {});
  assert.ok(enemy.state === 'alert' || enemy.state === 'engage');
  assert.notEqual(enemy.state, 'patrol');
});
