// Tactical minimap: walls, doors, objectives, extraction and the player.
// Enemies are NOT shown globally: only briefly when they have recently spotted you.
import { dist2D } from '../core/math.js';

const SCALE = 2.7; // world units -> px on 180px canvas (shows ~66 units... we zoom to ~33 radius)

export function drawMinimap(canvas, game) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,18,14,.92)';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const toX = (x) => cx + (x - game.player.pos[0]) * SCALE;
  const toY = (z) => cy + (z - game.player.pos[2]) * SCALE;

  // walls
  ctx.fillStyle = 'rgba(150,170,145,.7)';
  for (const b of game.map.walls) {
    const x = toX(b.min[0]);
    const y = toY(b.min[2]);
    const w = (b.max[0] - b.min[0]) * SCALE;
    const h = (b.max[2] - b.min[2]) * SCALE;
    if (x + w < 0 || y + h < 0 || x > W || y > H) continue;
    ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
  }
  // cover
  ctx.fillStyle = 'rgba(120,135,110,.55)';
  for (const b of game.map.cover) {
    const x = toX(b.min[0]);
    const y = toY(b.min[2]);
    const w = (b.max[0] - b.min[0]) * SCALE;
    const h = (b.max[2] - b.min[2]) * SCALE;
    if (x + w < 0 || y + h < 0 || x > W || y > H) continue;
    ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
  }

  // extraction zone
  const ez = game.map.zones.extraction;
  ctx.fillStyle = game.extractionActive ? '#66ff8a' : '#4a8fb0';
  ctx.beginPath();
  ctx.arc(toX(ez.x), toY(ez.z), ez.radius * SCALE, 0, Math.PI * 2);
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;

  // data drive if not taken
  const drive = game.pickups.find((p) => p.id === 'data_drive' && !p.taken);
  if (drive) {
    ctx.fillStyle = '#66e0ff';
    ctx.fillRect(toX(drive.x) - 3, toY(drive.z) - 3, 6, 6);
  }
  // console
  if (!game.objectives.find((o) => o.id === 'jammer').complete) {
    ctx.fillStyle = '#e2c24b';
    const c = game.map.zones.console;
    ctx.fillRect(toX(c.x) - 3, toY(c.z) - 3, 6, 6);
  }

  // hostage: show position only when freed (needs escort)
  if (game.hostage.alive && game.hostage.freed) {
    ctx.fillStyle = '#ff9a3d';
    ctx.beginPath();
    ctx.arc(toX(game.hostage.pos[0]), toY(game.hostage.pos[2]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies: only those within 14m AND currently aware (engage/search/suspicious)
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const aware = e.state !== 'patrol';
    const d = dist2D(e.pos, game.player.pos);
    if (aware && d < 16) {
      ctx.fillStyle = e.state === 'engage' ? '#ff5347' : '#e2c24b';
      ctx.beginPath();
      ctx.arc(toX(e.pos[0]), toY(e.pos[2]), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // player arrow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-game.player.yaw + Math.PI);
  ctx.fillStyle = '#d8ffb0';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
