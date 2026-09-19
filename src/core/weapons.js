// Weapon definitions: distinct damage / fire rate / ammo / reload / recoil /
// range / spread / pellet behaviour.
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'M9 战术手枪',
    slot: 1,
    damage: { head: 58, body: 26, limb: 16 },
    rpm: 300,
    magSize: 12,
    reserveAmmo: 60,
    reloadTime: 1.1,
    range: 60,
    spread: 0.008,
    aimSpread: 0.002,
    moveSpread: 0.02,
    pellets: 1,
    recoil: 0.022,
    recoilKick: 0.9,
    auto: false,
    ammoType: 'ammo_pistol',
  },
  rifle: {
    id: 'rifle',
    name: 'AK 突击步枪',
    slot: 2,
    damage: { head: 80, body: 34, limb: 20 },
    rpm: 620,
    magSize: 30,
    reserveAmmo: 120,
    reloadTime: 2.3,
    range: 110,
    spread: 0.014,
    aimSpread: 0.004,
    moveSpread: 0.035,
    pellets: 1,
    recoil: 0.014,
    recoilKick: 0.6,
    auto: true,
    ammoType: 'ammo_rifle',
  },
  shotgun: {
    id: 'shotgun',
    name: 'M870 战术霰弹枪',
    slot: 3,
    damage: { head: 22, body: 14, limb: 9 },
    rpm: 75,
    magSize: 6,
    reserveAmmo: 24,
    reloadTime: 3.2,
    range: 26,
    spread: 0.075,
    aimSpread: 0.045,
    moveSpread: 0.09,
    pellets: 8,
    recoil: 0.075,
    recoilKick: 2.4,
    auto: false,
    ammoType: 'ammo_shotgun',
  },
};

export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun'];

export function createWeaponState(id) {
  const w = WEAPONS[id];
  return {
    id,
    mag: w.magSize,
    reserve: w.reserveAmmo,
    reloading: false,
    reloadEndsAt: 0,
    lastShotAt: -999,
  };
}

export function canFire(state, w, now) {
  return (
    !state.reloading &&
    state.mag > 0 &&
    now - state.lastShotAt >= 60 / w.rpm
  );
}

// Returns number of rounds moved.
export function reloadWeapon(state, w, now) {
  if (state.reloading || state.mag >= w.magSize || state.reserve <= 0) return 0;
  state.reloading = true;
  state.reloadEndsAt = now + w.reloadTime;
  return 1;
}

export function finishReload(state, w) {
  if (!state.reloading) return false;
  const need = w.magSize - state.mag;
  const take = Math.min(need, state.reserve);
  state.mag += take;
  state.reserve -= take;
  state.reloading = false;
  return true;
}

export function consumeRound(state) {
  if (state.mag <= 0) return false;
  state.mag -= 1;
  return true;
}
