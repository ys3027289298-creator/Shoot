// Weapon definitions. Weapons differ across many dimensions, not just one number.

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'M9 Pistol',
    slot: 1,
    damage: 26,
    rpm: 360, // shots per minute
    magSize: 12,
    reloadTime: 1.1,
    pellets: 1,
    spreadHip: 0.022,
    spreadADS: 0.004,
    recoil: 0.028,
    range: 60,
    automatic: false,
    falloffStart: 18,
    falloffEnd: 50,
    falloffMin: 0.45,
    moveSpeed: 1.0,
    ammoType: 'pistolAmmo',
  },
  rifle: {
    id: 'rifle',
    name: 'AK-74 Rifle',
    slot: 2,
    damage: 24,
    rpm: 600,
    magSize: 30,
    reloadTime: 2.3,
    pellets: 1,
    spreadHip: 0.04,
    spreadADS: 0.008,
    recoil: 0.022,
    range: 110,
    automatic: true,
    falloffStart: 35,
    falloffEnd: 100,
    falloffMin: 0.6,
    moveSpeed: 0.9,
    ammoType: 'rifleAmmo',
  },
  shotgun: {
    id: 'shotgun',
    name: 'M870 Shotgun',
    slot: 3,
    damage: 17, // PER PELLET
    rpm: 80,
    magSize: 6, // shells
    reloadTime: 0.55, // per shell; reloads incrementally
    reloadShell: true,
    pellets: 8,
    spreadHip: 0.09,
    spreadADS: 0.05,
    recoil: 0.09,
    range: 22,
    automatic: false,
    falloffStart: 6,
    falloffEnd: 20,
    falloffMin: 0.25,
    moveSpeed: 0.85,
    ammoType: 'shotgunAmmo',
  },
};

export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun'];

// multipliers for hit zones
export const ZONE_MULTIPLIER = { head: 2.4, body: 1.0, limb: 0.65 };

export function damageAtRange(def, dist) {
  if (dist <= def.falloffStart) return def.damage;
  if (dist >= def.falloffEnd) return def.damage * def.falloffMin;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - t * (1 - def.falloffMin));
}

export function createWeaponState(id) {
  const def = WEAPONS[id];
  return {
    id,
    ammo: def.magSize,
    reloading: false,
    reloadElapsed: 0,
    reloadTotal: 0,
    lastShotTime: -1,
    recovered: true, // recoil recovery
  };
}

export function createArsenal() {
  return {
    current: 'pistol',
    owned: {
      pistol: createWeaponState('pistol'),
      rifle: createWeaponState('rifle'),
      shotgun: createWeaponState('shotgun'),
    },
  };
}
