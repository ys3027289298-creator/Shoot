// Inventory items with backpack space. Ammo stacks; single magazines/medkits are discrete.

export const ITEM_DEFS = {
  medkit: { id: 'medkit', name: 'First Aid Kit', size: 2, stackable: false, heal: 50 },
  pistolAmmo: { id: 'pistolAmmo', name: 'Pistol Ammo (x24)', size: 1, stackable: true, amount: 24 },
  rifleAmmo: { id: 'rifleAmmo', name: 'Rifle Ammo (x30)', size: 2, stackable: true, amount: 30 },
  shotgunAmmo: { id: 'shotgunAmmo', name: 'Shotgun Shells (x8)', size: 1, stackable: true, amount: 8 },
  dataDrive: { id: 'dataDrive', name: 'Encrypted Data Drive', size: 1, stackable: false },
};

export const BACKPACK_CAPACITY = 12;

export function createInventory() {
  return {
    capacity: BACKPACK_CAPACITY,
    items: [], // {uid, id}
    // ammo reserve pool per ammo type
    reserve: { pistolAmmo: 48, rifleAmmo: 60, shotgunAmmo: 16 },
    nextUid: 1,
  };
}

export function usedSlots(inv) {
  let total = 0;
  for (const it of inv.items) total += ITEM_DEFS[it.id].size;
  return total;
}

export function canAdd(inv, itemId) {
  const def = ITEM_DEFS[itemId];
  if (def.stackable && inv.items.some((i) => i.id === itemId)) return true;
  return usedSlots(inv) + def.size <= inv.capacity;
}

export function addItem(inv, itemId) {
  if (!canAdd(inv, itemId)) return false;
  inv.items.push({ uid: inv.nextUid++, id: itemId });
  return true;
}

export function removeItem(inv, uid) {
  const idx = inv.items.findIndex((i) => i.uid === uid);
  if (idx === -1) return null;
  const [removed] = inv.items.splice(idx, 1);
  return removed;
}

export function countItem(inv, itemId) {
  return inv.items.filter((i) => i.id === itemId).length;
}
