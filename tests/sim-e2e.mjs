import { createGame, updateGame, interact } from '../src/core/index.js';
import { castShot } from '../src/core/combat.js';
import { damageEnemy, enemyZones } from '../src/core/enemy.js';
import { ZONE_MULTIPLIER, damageAtRange, WEAPONS } from '../src/core/weapons.js';

const g = createGame({ seed: 7 });
const def = WEAPONS.rifle;
let shots = 0;
let kills = 0;
Object.defineProperty(g.player, 'alive', { value: true, writable: true, configurable: true });
const solidsAt = () => g.activeBoxes();

for (const e of [...g.enemies]) {
  if (!e.alive) continue;
  // search for a clear 3m shot position around the enemy
  const offsets = [];
  for (const radius of [3, 4.5, 6]) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      offsets.push([Math.sin(a) * radius, Math.cos(a) * radius]);
    }
  }
  let guard = 0;
  let chosen = null;
  for (const [ox, oz] of offsets) {
    const px = e.pos[0] + ox;
    const pz = e.pos[2] + oz;
    const eye = [px, 1.62, pz];
    const dv = [e.pos[0] - px, 1.2 - 1.62, e.pos[2] - pz];
    const dn = Math.hypot(...dv);
    const dir = dv.map((x) => x / dn);
    const r = castShot(eye, dir, solidsAt(), g.enemies, def.range);
    if (r.kind === 'enemy' && r.enemy === e) { chosen = { px, pz, dir }; break; }
  }
  if (!chosen) { console.log('no LOS to enemy at', e.pos); continue; }
  g.player.pos = [chosen.px, 0, chosen.pz];
  g.eye = [chosen.px, 1.62, chosen.pz];
  g.aimDir = chosen.dir;
  while (e.alive && guard++ < 30) {
    const r = castShot(g.eye, chosen.dir, solidsAt(), g.enemies, def.range);
    shots++;
    if (r.kind === 'enemy') {
      const res = damageEnemy(r.enemy, damageAtRange(def, r.distance) * ZONE_MULTIPLIER[r.zone], r.zone);
      g.stats.shotsHit++;
      if (res.killed) { kills++; g.stats.kills++; }
    }
  }
}
console.log('alive after sweep:', g.enemies.filter((e) => e.alive).length, 'kills:', kills, 'shots:', shots);

const drive = g.pickups.find((p) => p.id === 'data_drive');
g.player.pos = [drive.x, 0, drive.z];
interact(g);
console.log('data complete:', g.objectives[0].complete);

const c = g.map.zones.console;
g.player.pos = [c.x, 0, c.z];
g.input.interactHeld = true;
for (let i = 0; i < 80; i++) updateGame(g, 0.05);
g.input.interactHeld = false;
console.log('jammer complete:', g.objectives[1].complete, 'status:', g.status, g.lossReason);

g.player.pos = [g.hostage.pos[0], 0, g.hostage.pos[2]];
interact(g);
console.log('freed:', g.hostage.freed);

g.hostage.pos = [0, 0, 23];
for (let i = 0; i < 1200 && g.status === 'playing'; i++) {
  // lead the hostage toward the extraction gate, ending inside the zone
  const targetZ = Math.min(28.5, 24 + i * 0.05);
  g.player.pos = [0, 0, targetZ];
  updateGame(g, 0.05);
}
console.log('hostage objective:', g.objectives[2].complete);
console.log('final status:', g.status, g.lossReason);
console.log('stats:', JSON.stringify(g.stats), 'timeLeft:', Math.round(g.timeLeft));

if (g.status !== 'won') process.exit(1);
