import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport } from './helpers.js';
import { moveWithCollision } from '../src/core/collision.js';

test('WASD movement translates the player forward', () => {
  const game = makeGame();
  const startZ = game.player.pos.z;
  game.player.yaw = 0; // facing -z
  tick(game, 0.5, { forward: true });
  assert.ok(game.player.pos.z < startZ, 'player moved north');
});

test('walls block movement - player cannot leave compound through perimeter', () => {
  const game = makeGame();
  // Push player against south gate wall segment by moving into x far outside.
  teleport(game, 29.5, 0, 0);
  tick(game, 0.5, { right: true });
  assert.ok(game.player.pos.x < 30, 'player stays inside east perimeter');
});

test('crates block movement via circle/AABB resolution', () => {
  const game = makeGame();
  const solids = game.map.allSolids.filter((b) => b.open !== true);
  // Crate at (0,27) is 2.2 x 1.6 -> x spans [-1.1,1.1]. Circle starting to its
  // west must remain outside after attempting to move east through the crate.
  const pos2 = { x: -1.6, z: 27 };
  moveWithCollision(pos2, 2, 0, 0.4, solids, game.map.bounds);
  assert.ok(pos2.x <= -1.5, `crate stops penetration, got x=${pos2.x}`);
  // Moving parallel along the crate face is allowed.
  const pos3 = { x: -2.0, z: 26.9 };
  moveWithCollision(pos3, 0, -1.5, 0.4, solids, game.map.bounds);
  assert.ok(pos3.z < 26.9, 'lateral movement still works');
});

test('jump applies gravity and returns to ground', () => {
  const game = makeGame();
  tick(game, 0.05, { jump: true });
  assert.ok(game.player.pos.y > 0, 'player leaves ground');
  tick(game, 1.2, {});
  assert.ok(Math.abs(game.player.pos.y) < 0.01, 'player lands again');
});

test('crouching reduces eye height and speed', () => {
  const game = makeGame();
  const standEye = game.player.eyeHeight;
  tick(game, 0.3, { crouch: true });
  assert.ok(game.player.eyeHeight < standEye, 'eye height lowers');
});
