// Player state, movement physics, collision and health/armor.
import { clamp, moveWithCollisions } from './math.js';

export const PLAYER_CFG = {
  radius: 0.4,
  heightStand: 1.75,
  heightCrouch: 1.1,
  eyeStand: 1.62,
  eyeCrouch: 1.0,
  walkSpeed: 4.2,
  crouchSpeed: 2.0,
  sprintSpeed: 7.0,
  adsFactor: 0.55,
  jumpSpeed: 5.2,
  gravity: 15,
  maxHealth: 100,
  maxArmor: 100,
};

export function createPlayer(x = 0, z = 27) {
  return {
    pos: [x, 0, z], // feet position
    vel: [0, 0, 0],
    yaw: Math.PI, // face north (-z) toward facility
    pitch: 0,
    health: PLAYER_CFG.maxHealth,
    armor: 50,
    onGround: true,
    crouching: false,
    height: PLAYER_CFG.heightStand,
    eyeHeight: PLAYER_CFG.eyeStand,
    ads: false,
    sprinting: false,
    alive: true,
    dead: false,
    lastNoiseTime: -99,
    noiseLevel: 0, // 0..1 emitted this frame
  };
}

export function eyePosition(p) {
  return [p.pos[0], p.pos[1] + p.eyeHeight, p.pos[2]];
}

// damage from an enemy bullet; armor absorbs 55% until depleted
export function damagePlayer(p, amount) {
  if (!p.alive) return 0;
  let remaining = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, remaining * 0.55);
    p.armor = Math.max(0, p.armor - absorbed);
    remaining -= absorbed;
  }
  p.health = Math.max(0, p.health - remaining);
  if (p.health <= 0) {
    p.alive = false;
    p.dead = true;
  }
  return amount;
}

// input: {forward, strafe (-1..1), jump, crouch, sprint, ads}, dt seconds
export function updatePlayer(p, input, dt, solidBoxes) {
  if (!p.alive) return;

  // crouch transitions with headroom check
  const targetHeight = input.crouch ? PLAYER_CFG.heightCrouch : PLAYER_CFG.heightStand;
  if (targetHeight > p.height) {
    // try to stand: ensure nothing above head
    const head = {
      min: [p.pos[0] - PLAYER_CFG.radius, p.pos[1] + p.height, p.pos[2] - PLAYER_CFG.radius],
      max: [p.pos[0] + PLAYER_CFG.radius, p.pos[1] + targetHeight, p.pos[2] + PLAYER_CFG.radius],
    };
    const blocked = solidBoxes.some((b) =>
      b.min[0] < head.max[0] && b.max[0] > head.min[0] &&
      b.min[2] < head.max[2] && b.max[2] > head.min[2] &&
      b.min[1] < head.max[1] && b.max[1] > head.min[1]);
    if (!blocked) p.height = targetHeight;
  } else {
    p.height = targetHeight;
  }
  p.crouching = p.height === PLAYER_CFG.heightCrouch;
  p.eyeHeight = p.crouching ? PLAYER_CFG.eyeCrouch : PLAYER_CFG.eyeStand;
  p.ads = !!input.ads;
  p.sprinting = !!input.sprint && input.forward > 0 && !p.crouching && !p.ads;

  let speed = p.crouching ? PLAYER_CFG.crouchSpeed
    : p.sprinting ? PLAYER_CFG.sprintSpeed : PLAYER_CFG.walkSpeed;
  if (p.ads) speed *= PLAYER_CFG.adsFactor;

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // forward vector is (-sin*f, -cos*f) for yaw measured from -z axis
  const fx = -sin;
  const fz = -cos;
  const rx = cos;
  const rz = -sin;
  let mx = fx * input.forward + rx * input.strafe;
  let mz = fz * input.forward + rz * input.strafe;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }

  const targetVx = mx * speed;
  const targetVz = mz * speed;
  // smooth acceleration for weighty, responsive feel
  const accel = p.onGround ? 12 : 3;
  const k = Math.min(1, accel * dt);
  p.vel[0] += (targetVx - p.vel[0]) * k;
  p.vel[2] += (targetVz - p.vel[2]) * k;

  // jump + gravity
  if (input.jump && p.onGround && !p.crouching) {
    p.vel[1] = PLAYER_CFG.jumpSpeed;
    p.onGround = false;
  }
  p.vel[1] -= PLAYER_CFG.gravity * dt;

  // noise emission for stealth
  const horiz = Math.hypot(p.vel[0], p.vel[2]);
  p.noiseLevel = p.sprinting ? 1 : p.crouching ? 0.05 : clamp(horiz / PLAYER_CFG.walkSpeed, 0, 1) * 0.55;

  const res = moveWithCollisions(p.pos, p.vel, dt, PLAYER_CFG.radius, p.height, solidBoxes);
  p.pos = res.pos;
  if (res.onGround) {
    if (p.vel[1] <= 0) p.vel[1] = 0;
    p.onGround = true;
  } else {
    // check ground contact explicitly
    const probe = {
      min: [p.pos[0] - PLAYER_CFG.radius, p.pos[1] - 0.08, p.pos[2] - PLAYER_CFG.radius],
      max: [p.pos[0] + PLAYER_CFG.radius, p.pos[1], p.pos[2] + PLAYER_CFG.radius],
    };
    p.onGround = solidBoxes.some((b) =>
      b.min[0] < probe.max[0] && b.max[0] > probe.min[0] &&
      b.min[2] < probe.max[2] && b.max[2] > probe.min[2] &&
      b.min[1] < probe.max[1] && b.max[1] > probe.min[1]);
    if (p.onGround && p.vel[1] < 0) p.vel[1] = 0;
  }
  if (p.pos[1] < 0) { p.pos[1] = 0; if (p.vel[1] < 0) p.vel[1] = 0; p.onGround = true; }
}
