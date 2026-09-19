import './ui/style.css';
import { GameRenderer } from './render/renderer.js';
import { AudioEngine } from './core/audio.js';
import {
  newGame, updateGame, fireWeapon, reload, selectWeapon,
  useInventoryItem, dropInventoryItem, getAccuracy,
} from './core/game.js';
import { restoreGame } from './core/restore.js';
import {
  loadSettings, saveSettings, saveGame, loadGameRaw, listSaves,
  deleteSave,
} from './core/saves.js';
import { WEAPONS } from './core/weapons.js';
import { updateHud, drawMinimap, flashHitmarker } from './ui/hud.js';

const $ = (id) => document.getElementById(id);

const state = {
  mode: 'menu',
  game: null,
  renderer: null,
  audio: new AudioEngine(),
  settings: loadSettings(),
  keys: {},
  input: { forward: false, back: false, left: false, right: false, jump: false, crouch: false, run: false, aim: false, interact: false },
  fireHeld: false,
  lastFrame: 0,
  slotMode: 'load',
  settingsReturn: 'menu',
};

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function show(screenId) {
  for (const id of ['main-menu', 'load-screen', 'pause-screen', 'settings-screen', 'end-screen']) {
    $(id).classList.toggle('hidden', id !== screenId);
  }
}

function hideAllScreens() {
  for (const id of ['main-menu', 'load-screen', 'pause-screen', 'settings-screen', 'end-screen']) {
    $(id).classList.add('hidden');
  }
}

function buildRenderer(game) {
  if (state.renderer) {
    state.renderer.renderer.dispose();
    state.renderer.renderer.forceContextLoss?.();
    state.renderer.renderer.domElement.remove();
  }
  const c = document.createElement('canvas');
  c.id = 'game-canvas';
  document.body.insertBefore(c, document.body.firstChild);
  state.renderer = new GameRenderer(c, state.settings);
  state.renderer.buildWorld(game.map);
  state.renderer.buildObjectiveMarkers(game.map);
  for (const e of game.enemies) state.renderer.buildEnemy(e);
  state.renderer.buildHostage();
  for (const pk of game.pickups) if (!pk.taken) state.renderer.buildPickup(pk);
  state.renderer.buildViewModel();
  state.renderer.resize();
}

function startGame(game) {
  state.game = game;
  buildRenderer(game);
  state.mode = 'playing';
  $('hud').classList.remove('hidden');
  hideAllScreens();
  requestLock();
}

function requestLock() {
  const c = state.renderer?.renderer?.domElement;
  if (c && document.pointerLockElement !== c) c.requestPointerLock?.();
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  state.fireHeld = false;
  show('pause-screen');
  if (document.pointerLockElement) document.exitPointerLock();
}

// ---------- Input ----------
document.addEventListener('keydown', (e) => {
  state.keys[e.code] = true;
  if (!state.game || state.mode !== 'playing') return;
  const g = state.game;
  if (e.code === 'KeyW') state.input.forward = true;
  if (e.code === 'KeyS') state.input.back = true;
  if (e.code === 'KeyA') state.input.left = true;
  if (e.code === 'KeyD') state.input.right = true;
  if (e.code === 'ControlLeft' || e.code === 'KeyC') state.input.crouch = true;
  if (e.code === 'ShiftLeft') state.input.run = true;
  if (e.code === 'Space') { state.input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') state.input.interact = true;
  if (e.code === 'KeyR' && reload(g)) state.audio.reload();
  if (e.code === 'Digit1') selectWeapon(g, 'pistol');
  if (e.code === 'Digit2') selectWeapon(g, 'rifle');
  if (e.code === 'Digit3') selectWeapon(g, 'shotgun');
  if (e.code === 'KeyF') {
    const idx = g.player.inventory.slots.findIndex((s) =>
      ['medkit', 'bandage', 'armor', 'ammo_pistol', 'ammo_rifle', 'ammo_shotgun'].includes(s.type));
    if (idx >= 0 && useInventoryItem(g, idx)) state.audio.blip(700, 0.1, 0.2);
  }
  if (e.code === 'KeyG' && g.player.inventory.slots.length) {
    dropInventoryItem(g, g.player.inventory.slots.length - 1);
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') state.input.forward = false;
  if (e.code === 'KeyS') state.input.back = false;
  if (e.code === 'KeyA') state.input.left = false;
  if (e.code === 'KeyD') state.input.right = false;
  if (e.code === 'ControlLeft' || e.code === 'KeyC') state.input.crouch = false;
  if (e.code === 'ShiftLeft') state.input.run = false;
  if (e.code === 'Space') state.input.jump = false;
  if (e.code === 'KeyE') state.input.interact = false;
});

document.addEventListener('mousemove', (e) => {
  if (state.mode !== 'playing' || document.pointerLockElement !== state.renderer?.renderer?.domElement) return;
  const g = state.game;
  const sens = 0.0022 * state.settings.sensitivity;
  g.player.yaw += e.movementX * sens;
  // Camera renders rotation.x = pitch (positive looks down). Moving the
  // mouse down (positive movementY) must decrease pitch to look up... but
  // standard FPS: mouse down -> look down, so pitch increases with movementY.
  const yMul = state.settings.invertY ? -1 : 1;
  g.player.pitch = Math.max(-1.45, Math.min(1.45, g.player.pitch + e.movementY * sens * yMul));
});

document.addEventListener('mousedown', (e) => {
  if (state.mode !== 'playing') return;
  if (document.pointerLockElement !== state.renderer?.renderer?.domElement) {
    requestLock();
    return;
  }
  if (e.button === 2) state.input.aim = true;
  if (e.button === 0) {
    state.fireHeld = true;
    tryShoot();
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 2) state.input.aim = false;
  if (e.button === 0) state.fireHeld = false;
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state.mode === 'playing') pauseGame();
});

function tryShoot() {
  const g = state.game;
  if (!g || g.status !== 'playing') return;
  const w = WEAPONS[g.player.currentWeapon];
  const results = fireWeapon(g);
  if (!results.length) return;
  state.audio.gunshot(w.id);
  state.renderer.recoil += w.recoil * (g.player.aiming ? 0.6 : 1);
  state.renderer.setMuzzle();
  for (const r of results) {
    state.renderer.addTracer(r.from, r.end);
    if (!r.hit) state.renderer.addImpact(r.end);
    else state.audio.hit(r.hit.killed || (r.hit.damage || 0) >= 50);
  }
}

let prevHealth = 100;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (state.lastFrame || now)) / 1000);
  state.lastFrame = now;

  if (state.mode === 'playing' && state.game) {
    const g = state.game;
    if (state.fireHeld) tryShoot();
    updateGame(g, state.input, dt);
    if (g.player.health < prevHealth - 0.01) state.audio.hurt();
    prevHealth = g.player.health;
    state.renderer.update(g, dt);
    updateHud(g, state.settings);
    drawMinimap(g);
    flashHitmarker(g);
    if (g.status !== 'playing') endGame();
  } else if (state.renderer && state.game) {
    state.renderer.update(state.game, dt);
  }
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => state.renderer?.resize());

// ---------- Menus ----------
function refreshContinueInfo() {
  const saves = listSaves();
  const valid = saves.filter((s) => !s.empty && !s.corrupt);
  const btn = $('btn-continue');
  if (valid.length) {
    const latest = valid.sort((a, b) => b.savedAt - a.savedAt)[0];
    btn.disabled = false;
    btn.dataset.slot = latest.slot;
    $('save-quick-info').textContent =
      `最近存档：位置 ${latest.slot + 1} · 剩余 ${latest.timeLeft} 秒 · 目标 ${latest.objectives}/3`;
  } else {
    btn.disabled = true;
    btn.dataset.slot = '';
    $('save-quick-info').textContent = '暂无存档，开始新游戏后可随时保存。';
  }
}

function renderSlots(mode) {
  state.slotMode = mode;
  $('slots-title').textContent = mode === 'load' ? '读取存档' : '保存进度';
  const list = $('slots-list');
  list.innerHTML = '';
  for (const s of listSaves()) {
    const div = document.createElement('div');
    div.className = 'save-slot';
    if (s.corrupt) {
      div.innerHTML = `<div class="info"><strong>存档位 ${s.slot + 1}</strong><div class="corrupt">存档已损坏，无法读取</div></div>`;
      const del = document.createElement('button');
      del.textContent = '删除';
      del.onclick = () => { deleteSave(s.slot); renderSlots(mode); refreshContinueInfo(); };
      div.appendChild(del);
    } else if (s.empty) {
      div.innerHTML = `<div class="info"><strong>存档位 ${s.slot + 1}</strong><div class="empty">（空）</div></div>`;
      if (mode === 'save') {
        const b = document.createElement('button');
        b.textContent = '保存';
        b.onclick = () => doSave(s.slot);
        div.appendChild(b);
      }
    } else {
      const date = new Date(s.savedAt);
      div.innerHTML = `<div class="info"><strong>存档位 ${s.slot + 1}</strong>
        <div>${date.toLocaleString()} · 剩余 ${s.timeLeft} 秒 · 目标 ${s.objectives}/3</div></div>`;
      if (mode === 'load') {
        const b = document.createElement('button');
        b.textContent = '读取';
        b.onclick = () => doLoad(s.slot);
        div.appendChild(b);
      } else {
        const b = document.createElement('button');
        b.textContent = '覆盖保存';
        b.onclick = () => doSave(s.slot);
        div.appendChild(b);
      }
      const del = document.createElement('button');
      del.textContent = '删除';
      del.onclick = () => { deleteSave(s.slot); renderSlots(mode); refreshContinueInfo(); };
      div.appendChild(del);
    }
    list.appendChild(div);
  }
  show('load-screen');
}

function doSave(slot) {
  try {
    saveGame(slot, state.game);
    toast(`已保存到存档位 ${slot + 1}`);
    renderSlots('save');
    refreshContinueInfo();
  } catch (e) {
    toast('保存失败：' + e.message);
  }
}

function doLoad(slot) {
  try {
    const data = loadGameRaw(slot);
    const game = restoreGame(data);
    prevHealth = game.player.health;
    startGame(game);
    toast(`已读取存档位 ${slot + 1}`);
  } catch (e) {
    toast(e.message, 4000);
  }
}

// Settings screen controls.
function syncSettingsControls() {
  $('set-master').value = state.settings.masterVolume;
  $('set-sfx').value = state.settings.sfxVolume;
  $('set-sens').value = state.settings.sensitivity;
  $('set-fov').value = state.settings.fov;
  $('set-quality').value = state.settings.quality;
  $('set-invert').value = state.settings.invertY ? '1' : '0';
}

function bindSettings() {
  const apply = () => {
    state.settings.masterVolume = parseFloat($('set-master').value);
    state.settings.sfxVolume = parseFloat($('set-sfx').value);
    state.settings.sensitivity = parseFloat($('set-sens').value);
    state.settings.fov = parseInt($('set-fov').value, 10);
    state.settings.quality = $('set-quality').value;
    state.settings.invertY = $('set-invert').value === '1';
    saveSettings(state.settings);
    state.audio.setSettings(state.settings);
    state.renderer?.applySettings(state.settings);
  };
  for (const id of ['set-master', 'set-sfx', 'set-sens', 'set-fov', 'set-quality', 'set-invert']) {
    $(id).addEventListener('input', apply);
  }
}

$('btn-new').onclick = () => {
  state.audio.ensure();
  const game = newGame();
  prevHealth = 100;
  startGame(game);
};
$('btn-continue').onclick = () => {
  const slot = $('btn-continue').dataset.slot;
  if (slot !== '') doLoad(parseInt(slot, 10));
};
$('btn-load').onclick = () => renderSlots('load');
$('btn-slots-back').onclick = () => show('main-menu');
$('btn-settings').onclick = () => {
  state.settingsReturn = 'menu';
  syncSettingsControls();
  show('settings-screen');
};
$('btn-pause-settings').onclick = () => {
  state.settingsReturn = 'pause';
  syncSettingsControls();
  show('settings-screen');
};
$('btn-settings-back').onclick = () => {
  show(state.settingsReturn === 'pause' ? 'pause-screen' : 'main-menu');
};
$('btn-quit').onclick = () => {
  // Browsers cannot close arbitrary tabs; show a clear goodbye overlay instead.
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b0e12;color:#9fb4c9;font-family:sans-serif;flex-direction:column;gap:12px"><h2>已退出任务</h2><p>你可以关闭此标签页，或<a href="." style="color:#6fa8d8">重新加载页面</a>返回游戏。</p></div>';
};

$('btn-resume').onclick = () => resumeGame();
$('btn-quicksave').onclick = () => {
  try {
    saveGame(0, state.game);
    toast('已快速保存到存档位 1');
    refreshContinueInfo();
  } catch (e) {
    toast('保存失败：' + e.message);
  }
};
$('btn-save-as').onclick = () => renderSlots('save');
$('btn-restart').onclick = () => {
  const seed = state.game.seed;
  const game = newGame(seed);
  prevHealth = 100;
  startGame(game);
};
$('btn-abandon').onclick = () => returnToMenu();

$('btn-end-restart').onclick = () => {
  const game = newGame();
  prevHealth = 100;
  startGame(game);
};
$('btn-end-menu').onclick = () => returnToMenu();

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (state.mode === 'playing') pauseGame();
  else if (state.mode === 'paused') resumeGame();
});

bindSettings();
syncSettingsControls();
state.audio.setSettings(state.settings);
refreshContinueInfo();
show('main-menu');

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  hideAllScreens();
  requestLock();
}

function returnToMenu() {
  state.mode = 'menu';
  state.game = null;
  $('hud').classList.add('hidden');
  refreshContinueInfo();
  show('main-menu');
  if (document.pointerLockElement) document.exitPointerLock();
}

function endGame() {
  state.mode = 'end';
  const g = state.game;
  const won = g.status === 'won';
  $('end-title').textContent = won ? '任务成功 — 已撤离' : '任务失败';
  $('end-reason').textContent = won
    ? '全部目标完成，人员安全撤离。'
    : g.failReason || '任务失败。';
  $('end-screen').querySelector('.menu-box').className = `menu-box ${won ? 'won' : 'lost'}`;
  const mins = Math.floor(g.elapsed / 60);
  const secs = Math.floor(g.elapsed % 60);
  $('end-stats').innerHTML = `
    <div><span class="k">命中率：</span>${getAccuracy(g)}%</div>
    <div><span class="k">击杀数：</span>${g.stats.kills}</div>
    <div><span class="k">受到伤害：</span>${Math.round(g.stats.damageTaken)}</div>
    <div><span class="k">用时：</span>${mins}分${secs}秒</div>
    <div><span class="k">剩余时间：</span>${Math.round(g.timeLeft)} 秒</div>
    <div><span class="k">完成目标：</span>${g.stats.objectivesDone}/3</div>
    <div><span class="k">成功撤离：</span>${won ? '是' : '否'}</div>
    <div><span class="k">触发警戒次数：</span>${g.stats.alertsTriggered}</div>
  `;
  show('end-screen');
  if (document.pointerLockElement) document.exitPointerLock();
}
