// Pickup / inventory items.
export const ITEM_TYPES = {
  medkit: { id: 'medkit', name: '医疗包', size: 2, useTime: 2, heal: 60, stackable: false },
  bandage: { id: 'bandage', name: '止血绷带', size: 1, useTime: 1.2, heal: 25, stackable: false },
  armor: { id: 'armor', name: '防弹护甲', size: 3, useTime: 1.5, armor: 50, stackable: false },
  ammo_pistol: { id: 'ammo_pistol', name: '手枪弹药', size: 1, amount: 24, stackable: true },
  ammo_rifle: { id: 'ammo_rifle', name: '步枪弹药', size: 1, amount: 30, stackable: true },
  ammo_shotgun: { id: 'ammo_shotgun', name: '霰弹枪弹药', size: 1, amount: 8, stackable: true },
  data_drive: { id: 'data_drive', name: '加密数据盘', size: 1, mission: true, stackable: false },
};

export const INVENTORY_CAPACITY = 8;

export function createInventory() {
  return { capacity: INVENTORY_CAPACITY, used: 0, slots: [] };
}

export function canCarry(inv, type) {
  const def = ITEM_TYPES[type];
  if (def.stackable && inv.slots.some((s) => s.type === type)) return true;
  return inv.used + def.size <= inv.capacity;
}

export function addItem(inv, type) {
  const def = ITEM_TYPES[type];
  if (def.stackable) {
    const existing = inv.slots.find((s) => s.type === type);
    if (existing) {
      existing.qty += 1;
      return true;
    }
  }
  if (inv.used + def.size > inv.capacity) return false;
  inv.slots.push({ type, qty: 1, size: def.size });
  inv.used += def.size;
  return true;
}

export function dropItem(inv, slotIndex) {
  const slot = inv.slots[slotIndex];
  if (!slot) return null;
  if (slot.qty > 1) {
    slot.qty -= 1;
    return slot.type;
  }
  inv.slots.splice(slotIndex, 1);
  inv.used -= slot.size;
  return slot.type;
}

export function removeOne(inv, type) {
  const idx = inv.slots.findIndex((s) => s.type === type);
  if (idx === -1) return false;
  dropItem(inv, idx);
  return true;
}

export function hasItem(inv, type) {
  return inv.slots.some((s) => s.type === type);
}
