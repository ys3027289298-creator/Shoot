import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick } from './helpers.js';
import { applyDamage } from '../src/core/player.js';

test('player takes damage and dies at zero health', () => {
  const game = makeGame();
  const p = game.player;
  applyDamage(p, 40, 0);
  assert.equal(p.health, 60);
  assert.ok(p.alive);
  applyDamage(p, 70, 0);
  assert.equal(p.health, 0);
  assert.ok(!p.alive);
});

test('armor absorbs part of damage', () => {
  const game = makeGame();
  const p = game.player;
  p.armor = 100;
  applyDamage(p, 100, 0);
  assert.ok(p.health > 0, 'armor reduced lethal damage');
  assert.ok(p.armor < 100, 'armor was consumed');
});

test('death ends mission with failed status', () => {
  const game = makeGame();
  applyDamage(game.player, 200, 0);
  tick(game, 0.1);
  assert.equal(game.status, 'lost');
  assert.match(game.failReason, /阵亡/);
});

test('time running out causes mission failure', () => {
  const game = makeGame();
  game.timeLeft = 0.1;
  tick(game, 0.3);
  assert.equal(game.status, 'lost');
  assert.match(game.failReason, /时间/);
});
