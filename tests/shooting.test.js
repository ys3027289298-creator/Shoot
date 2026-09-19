import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, tick, teleport, facePoint } from './helpers.js';
import { fireWeapon } from '../src/core/game.js';
import { reloadWeapon, finishReload, canFire, createWeaponState } from '../src/core/weapons.js';
import { WEAPONS } from '../src/core/weapons.js';
import { characterHitboxes } from '../src/core/collision.js';

test('firing consumes ammo and produces pellets for shotgun', () => {
  const game = makeGame();
  game.player.currentWeapon = 'shotgun';
  const ws = game.player.weapons.shotgun;
  const magBefore = ws.mag;
  const results = fireWeapon(game);
  assert.equal(results.length, 8, 'shotgun fires 8 pellets');
  assert.equal(ws.mag, magBefore - 1, 'one shell consumed');
});

test('empty magazine cannot fire', () => {
  const game = makeGame();
  const ws = game.player.weapons.rifle;
  ws.mag = 0;
  const results = fireWeapon(game);
  assert.equal(results.length, 0, 'no shots on empty mag');
});

test('reload refills magazine from reserve and completes after time', () => {
  const state = createWeaponState('rifle');
  const w = WEAPONS.rifle;
  state.mag = 10;
  state.reserve = 60;
  assert.equal(reloadWeapon(state, w, 0), 1);
  assert.ok(state.reloading);
  // Reload finishes only after reloadTime.
  assert.equal(finishReload({ ...state, reloading: false }, w), false);
  state.reloadEndsAt = w.reloadTime;
  finishReload(state, w);
  assert.equal(state.mag, 30);
  assert.equal(state.reserve, 40);
});

test('bullet hits enemy in open sightline and applies body/head damage', () => {
  const game = makeGame();
  // First enemy anchor is (0,30) in the south yard.
  const enemy = game.enemies[0];
  enemy.pos.x = 0;
  enemy.pos.z = 30;
  enemy.patrol = [{ x: 0, z: 30 }];
  enemy.patrolIndex = 0;
  teleport(game, 0, 35, 0);
  facePoint(game, 0, 30);
  game.player.pitch = Math.atan2(game.player.eyeHeight - 1.3, 5);
  const hpBefore = enemy.health;
  // Fire enough rifle magazines-ish via repeated attempts; restore ammo.
  let anyHit = false;
  for (let i = 0; i < 30; i++) {
    game.player.weapons.rifle.mag = 30;
    game.player.weapons.rifle.lastShotAt = -999;
    enemy.pos.x = 0;
    enemy.pos.z = 30;
    enemy.state = 'patrol';
    enemy.lastSawAt = -99;
    enemy.hitboxes = characterHitboxes(enemy.pos, enemy.yaw, enemy.radius, false, true);
    const results = fireWeapon(game);
    game.elapsed += 0.11;
    if (results.some((r) => r.hit && r.hit.enemyId === enemy.id)) anyHit = true;
    if (enemy.dead) break;
  }
  assert.ok(anyHit, 'at least one bullet connected with the enemy');
  assert.ok(enemy.health < hpBefore);
});

test('wall blocks bullets: enemy behind wall takes no damage', () => {
  const game = makeGame();
  // South perimeter wall at z=42 is solid. Place enemy just beyond it outside.
  const enemy = game.enemies[0];
  enemy.pos.x = -20;
  enemy.pos.z = 43.5;
  teleport(game, -20, 40.5, 0);
  facePoint(game, -20, 43.5);
  game.player.pitch = -0.02;
  const hp = enemy.health;
  for (let i = 0; i < 10; i++) {
    game.player.weapons.rifle.mag = 30;
    game.player.weapons.rifle.lastShotAt = -999;
    fireWeapon(game);
    game.elapsed += 0.2;
  }
  assert.equal(enemy.health, hp, 'wall absorbs all shots');
});
