// Mission objectives: not all are "click a button".
// 1) Data theft: find drive in one of 3 random secured rooms, pick it up.
// 2) Disable comms jammer: hold interaction at console for 3 seconds (exposed).
// 3) Rescue hostage: open cell door, escort the hostage out with you.

export const OBJECTIVE_DEFS = [
  { id: 'data', name: 'Steal the encrypted data drive', type: 'item' },
  { id: 'jammer', name: 'Disable the communications jammer', type: 'hold' },
  { id: 'hostage', name: 'Rescue the detainee', type: 'escort' },
];

export function createObjectives() {
  return OBJECTIVE_DEFS.map((d) => ({ ...d, state: 'active', progress: 0, complete: false }));
}

export function allComplete(objectives) {
  return objectives.every((o) => o.complete);
}

export function updateHoldObjective(game, dt) {
  const obj = game.objectives.find((o) => o.id === 'jammer');
  if (!obj || obj.complete) return false;
  const c = game.map.zones.console;
  const d = Math.hypot(game.player.pos[0] - c.x, game.player.pos[2] - c.z);
  if (d < 1.8 && game.input.interactHeld) {
    obj.progress += dt;
    if (obj.progress >= 3) {
      obj.complete = true;
      obj.state = 'done';
      return true;
    }
  } else if (obj.progress > 0) {
    obj.progress = Math.max(0, obj.progress - dt * 0.5);
  }
  return false;
}
