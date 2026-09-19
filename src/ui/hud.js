import { ITEM_TYPES } from '../core/items.js';
import { WEAPONS } from '../core/weapons.js';

const $ = (id) => document.getElementById(id);

export function updateHud(game, settings) {
  const p = game.player;
  $('hp-text').textContent = Math.ceil(p.health);
  $('hp-bar').style.width = `${p.health}%`;
  $('ar-text').textContent = Math.ceil(p.armor);
  $('ar-bar').style.width = `${p.armor}%`;
  $('alert-bar').style.width = `${game.alert * 100}%`;
  const at = $('alert-text');
  if (game.alert < 0.25) {
    at.textContent = '隐蔽';
    at.style.color = '#9fd3a0';
  } else if (game.alert < 0.6) {
    at.textContent = '警戒';
    at.style.color = '#ffd84d';
  } else {
    at.textContent = '交火中';
    at.style.color = '#ff7a66';
  }

  const mins = Math.floor(game.timeLeft / 60);
  const secs = Math.floor(game.timeLeft % 60);
  const timer = $('timer');
  timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  timer.classList.toggle('urgent', game.timeLeft < 60);

  const w = WEAPONS[p.currentWeapon];
  const ws = p.weapons[p.currentWeapon];
  $('weapon-name').textContent = w.name;
  $('ammo-mag').textContent = ws.mag;
  $('ammo-reserve').textContent = ws.reserve;
  $('ammo-display').style.color = ws.mag === 0 ? '#ff6655' : '#fff';
  $('reload-hint').classList.toggle('hidden', !ws.reloading);
  document.querySelectorAll('#weapon-slots span').forEach((el) => {
    el.classList.toggle('active', el.dataset.slot === p.currentWeapon);
  });

  const names = { intel: '取得情报资料 (需数据盘)', device: '关闭干扰设备', hostage: '救出被俘人员' };
  $('objective-list').innerHTML = Object.entries(game.objectives)
    .map(([id, s]) => `<li class="${s.done ? 'done' : ''}">${names[id]}</li>`)
    .join('');
  const ex = $('extraction-status');
  if (game.extractionOpen) {
    ex.textContent = '● 撤离点已开启：前往北侧绿色信号烟雾';
    ex.className = 'open';
  } else {
    ex.textContent = '撤离点：完成全部目标后开启';
    ex.className = '';
  }

  // Inventory.
  $('inv-used').textContent = `${p.inventory.used}/${p.inventory.capacity}`;
  $('inv-slots').innerHTML = p.inventory.slots.length
      ? p.inventory.slots.map((s, i) => {
        const def = ITEM_TYPES[s.type];
        const qty = s.qty > 1 ? ` x${s.qty}` : '';
        return `<div class="inv-slot"><span>${def.name}${qty} <span class="key">${def.size}格</span></span><span class="key">F使用 · G丢弃</span></div>`;
      }).join('')
    : '<div class="inv-slot"><span style="color:#667">（空）</span></div>';

  // Interact prompt.
  const prompt = $('interact-prompt');
  if (game.interactPrompt) {
    prompt.textContent = game.interactPrompt;
    prompt.classList.remove('hidden');
  } else {
    prompt.classList.add('hidden');
  }

  // Objective hold progress.
  let maxHold = 0;
  let hold = 0;
  for (const [id, s] of Object.entries(game.objectives)) {
    if (s.hold > 0) {
      hold = s.hold;
      maxHold = game.map.objectives[id].holdSeconds || 1.5;
    }
  }
  const prog = $('objective-progress');
  if (hold > 0) {
    prog.classList.remove('hidden');
    $('objective-progress-bar').style.width = `${Math.min(100, (hold / maxHold) * 100)}%`;
  } else {
    prog.classList.add('hidden');
  }

  // Notifications.
  const nc = $('notifications');
  const html = game.notifications
    .slice(-4)
    .map((n) => `<div class="note">${n.text}</div>`)
    .join('');
  if (nc.innerHTML !== html) nc.innerHTML = html;

  // Damage / low hp vignettes.
  const sinceHurt = game.elapsed - p.lastDamageAt;
  const dv = $('damage-vignette');
  const target = sinceHurt < 0.35 ? Math.max(0, 0.85 - sinceHurt) : 0;
  dv.style.opacity = target;
  $('lowhp-vignette').style.opacity = p.alive && p.health < 30 ? '' : '0';
}

export function drawMinimap(game) {
  const cv = $('minimap');
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const scale = W / 70;
  const cx = W / 2;
  const cy = H / 2;
  const toX = (x) => cx + (x - game.player.pos.x) * scale;
  const toY = (z) => cy + (z - game.player.pos.z) * scale;

  ctx.fillStyle = 'rgba(30,40,50,0.9)';
  ctx.fillRect(0, 0, W, H);

  // Walls.
  ctx.fillStyle = '#8fa3b8';
  for (const w of game.map.walls) {
    ctx.fillRect(toX(w.minX), toY(w.minZ), (w.maxX - w.minX) * scale, (w.maxZ - w.minZ) * scale);
  }
  // Crates.
  ctx.fillStyle = '#b58952';
  for (const c of game.map.crates) {
    ctx.fillRect(toX(c.minX), toY(c.minZ), Math.max(1, (c.maxX - c.minX) * scale), Math.max(1, (c.maxZ - c.minZ) * scale));
  }
  // Objectives (always visible as markers).
  const colors = { intel: '#33ccff', device: '#ff8833', hostage: '#ffdd44' };
  for (const [id, obj] of Object.entries(game.map.objectives)) {
    if (game.objectives[id].done) continue;
    ctx.fillStyle = colors[id];
    ctx.beginPath();
    ctx.arc(toX(obj.zone.x), toY(obj.zone.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Extraction.
  ctx.fillStyle = game.extractionOpen ? '#33ff77' : '#557766';
  ctx.beginPath();
  ctx.arc(toX(game.map.extraction.x), toY(game.map.extraction.z), game.extractionOpen ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();

  // Enemies: only those actively engaging / recently seen (not all positions).
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.state !== 'engage' && e.state !== 'search') continue;
    if (game.elapsed - e.lastSawAt > 6) continue;
    ctx.fillStyle = e.state === 'engage' ? '#ff4d4d' : '#ffaa4d';
    ctx.beginPath();
    ctx.arc(toX(e.pos.x), toY(e.pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pickups only when close.
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    const d = Math.hypot(pk.pos.x - game.player.pos.x, pk.pos.z - game.player.pos.z);
    if (d < 12) {
      ctx.fillStyle = pk.type === 'data_drive' ? '#33ffdd' : '#dddddd';
      ctx.fillRect(toX(pk.pos.x) - 1.5, toY(pk.pos.z) - 1.5, 3, 3);
    }
  }

  // Player arrow.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-game.player.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hostage (mission-critical, show when following).
  if (game.hostage.alive && game.hostage.following) {
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.arc(toX(game.hostage.pos.x), toY(game.hostage.pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function flashHitmarker(game) {
  const hm = $('hitmarker');
  const last = game.hitMarkers[game.hitMarkers.length - 1];
  if (last && game.elapsed - last.at < 0.12) {
    hm.classList.add('show');
    hm.classList.toggle('kill', last.head);
  } else {
    hm.classList.remove('show', 'kill');
  }
}
