import { newGame, updateGame, fireWeapon, viewDirection } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';

export function makeGame(seed = 12345) {
  return newGame(seed);
}

export function facePoint(game, x, z) {
  const p = game.player;
  p.yaw = Math.atan2(x - p.pos.x, -(z - p.pos.z));
  p.pitch = 0;
}

// Run frames of empty input.
export function tick(game, seconds, input = {}) {
  const steps = Math.max(1, Math.round(seconds / (1 / 60)));
  const dt = seconds / steps;
  const full = {
    forward: false, back: false, left: false, right: false,
    jump: false, crouch: false, run: false, aim: false, interact: false,
    ...input,
  };
  for (let i = 0; i < steps; i++) updateGame(game, full, dt);
}

// Teleport player (used in tests to set up scenarios).
export function teleport(game, x, z, yaw = 0) {
  game.player.pos.x = x;
  game.player.pos.z = z;
  game.player.yaw = yaw;
}
