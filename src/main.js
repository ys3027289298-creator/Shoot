import { Renderer } from './render/renderer.js';
import { InputController } from './render/input.js';
import { drawMinimap } from './render/minimap.js';
import { AudioEngine } from './audio/audio.js';
import {
  createGame, updateGame, tryShoot, reloadCurrent, switchWeapon,
  interact, useMedkit, dropItem, WEAPON_ORDER, ITEM_DEFS, usedSlots,
} from './core/index.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { saveToSlot, loadFromSlot, applyState, listSaves, clearSlot, SAVE_SLOTS } from './core/saves.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#game-canvas');

const state = {
  settings: loadSettings(),
  game: null,
  renderer: null,
  input: null,
  audio: new AudioEngine(),
  mode: 'menu', // menu | playing | paused | bag | ended
  lastHurt: 0,
  lastHealth: 100,
  autoFireAcc: 0,
  saveMode: 'save', // 'save' | 'load'
  returnScreen: 'pause',
};

// ---------- screen helpers ----------
const screens = {
  menu: $('#main-menu'), saves: $('#saves-screen'), settings: $('#settings-screen'),
  pause: $('#pause-screen'), bag: $('#bag-screen'), end: $('#end-screen'), quit: $('#quit-screen'),
};
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  $('#hud').classList.toggle('hidden', name !== null && state.mode !== 'playing');
}
function showOnlyMenu() {
  state.mode = 'menu';
  show('menu');
}
function hideAllScreens() {
  for (const el of Object.values(screens)) el.classList.add('hidden');
  $('#hud').classList.remove('hidden');
}

function toast(text) {
  const t = $('#save-toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------- game lifecycle ----------
function startNewGame() {
  state.game = createGame({});
  state.lastHealth = 100;
  launchGame();
}

function continueGame(slot) {
  try {
    const data = loadFromSlot(slot);
    state.game = createGame({ seed: data.seed });
    applyState(state.game, data.state);
    state.lastHealth = state.game.player.health;
    launchGame();
  } catch (err) {
    openSaves('load');
    renderSaveSlots(err.message);
  }
}

function launchGame() {
  if (!state.renderer) {
    state.renderer = new Renderer(canvas, state.settings);
    state.input = new InputController(canvas, state.settings);
    state.input.onMouseMove = (dx, dy) => {
      const p = state.game.player;
      p.yaw -= dx;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy));
    };
    state.input.onLockChange = (locked) => {
      if (!locked && state.mode === 'playing') pauseGame();
    };
    addEventListener('resize', () => state.renderer?.resize());
  } else {
    // rebuild world visuals for new game
  }
  state.renderer.settings = state.settings;
  state.renderer.buildFromGame(state.game);
  state.renderer.camera.fov = state.settings.fov;
  state.mode = 'playing';
  hideAllScreens();
  state.audio.ensure();
  state.input.requestLock();
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  show('pause');
}
function resumeGame() {
  state.mode = 'playing';
  hideAllScreens();
  state.input.requestLock();
}

// ---------- saves UI ----------
function openSaves(mode) {
  state.saveMode = mode;
  $('#saves-title').textContent = mode === 'save' ? 'Save Game' : 'Load Game';
  renderSaveSlots();
  show('saves');
}

function renderSaveSlots(error = '') {
  const wrap = $('#save-slots');
  wrap.innerHTML = '';
  const saves = listSaves();
  saves.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'save-slot' + (s.corrupted ? ' corrupt' : '');
    let html = `<div class="slot-main">Slot ${s.slot}`;
    if (s.empty) html += ` <span class="muted">- empty</span>`;
    html += `</div>`;
    if (s.corrupted) html += `<div class="slot-sub">Save corrupted - delete to reuse</div>`;
    else if (!s.empty) {
      const t = new Date(s.savedAt).toLocaleString();
      const mins = Math.floor((s.timeLeft || 0) / 60);
      const secs = Math.floor((s.timeLeft || 0) % 60);
      html += `<div class="slot-sub">${t} · ${mins}:${String(secs).padStart(2, '0')} left · kills ${s.kills ?? 0}</div>`;
    }
    div.innerHTML = html;
    const acts = document.createElement('div');
    acts.className = 'slot-actions';
    if (s.corrupted) {
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.onclick = () => { clearSlot(s.slot); renderSaveSlots(); };
      acts.appendChild(del);
    } else if (state.saveMode === 'save') {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = s.empty ? 'Save' : 'Overwrite';
      b.onclick = () => {
        try {
          saveToSlot(s.slot, state.game);
          toast(`Saved to slot ${s.slot}`);
          renderSaveSlots();
        } catch {
          renderSaveSlots('Could not write save (storage unavailable)');
        }
      };
      acts.appendChild(b);
      if (!s.empty) {
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.onclick = () => { clearSlot(s.slot); renderSaveSlots(); };
        acts.appendChild(del);
      }
    } else {
      const b = document.createElement('button');
      b.className = s.empty ? 'ghost' : 'primary';
      b.textContent = 'Load';
      b.disabled = s.empty;
      if (!s.empty) b.onclick = () => continueGame(s.slot);
      acts.appendChild(b);
    }
    div.appendChild(acts);
    wrap.appendChild(div);
  });
  $('#settings-error')?.classList.add('hidden');
  const errEl = $('#saves-error');
  if (errEl) { errEl.textContent = error || ''; errEl.classList.toggle('hidden', !error); }
}

// ---------- settings UI ----------
function syncSettingsUI() {
  const s = state.settings;
  $('#set-volume').value = s.volume;
  $('#set-volume-val').textContent = Math.round(s.volume * 100);
  $('#set-quality').value = s.quality;
  $('#set-sensitivity').value = s.sensitivity;
  $('#set-sensitivity-val').textContent = s.sensitivity.toFixed(2);
  $('#set-fov').value = s.fov;
  $('#set-fov-val').textContent = s.fov;
}
function readSettingsUI() {
  state.settings.volume = parseFloat($('#set-volume').value);
  state.settings.quality = $('#set-quality').value;
  state.settings.sensitivity = parseFloat($('#set-sensitivity').value);
  state.settings.fov = parseInt($('#set-fov').value, 10);
  saveSettings(state.settings);
  state.audio.setVolume(state.settings.volume);
  state.renderer?.applyQuality(state.settings.quality);
  toast('Settings applied');
}

// ---------- HUD update ----------
function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateHUD(g) {
  const p = g.player;
  $('#hp-fill').style.width = p.health + '%';
  $('#hp-text').textContent = Math.ceil(p.health);
  $('#armor-fill').style.width = p.armor + '%';
  $('#armor-text').textContent = Math.ceil(p.armor);

  const timer = $('#timer');
  timer.textContent = fmtTime(g.timeLeft);
  timer.classList.toggle('low', g.timeLeft < 60);

  const def = g.weaponDefs[g.arsenal.current];
  const ws = g.arsenal.owned[g.arsenal.current];
  $('#weapon-name').textContent = def.name;
  $('#ammo-mag').textContent = ws.ammo;
  $('#ammo-reserve').textContent = g.inventory.reserve[def.ammoType] ?? 0;
  $('#reload-indicator').classList.toggle('hidden', !ws.reloading);

  $('#alert-fill').style.width = Math.round(g.alert * 100) + '%';
  const at = $('#alert-text');
  if (g.alert < 0.25) { at.textContent = 'Calm'; at.style.color = '#8fbf7a'; }
  else if (g.alert < 0.55) { at.textContent = 'Suspicious'; at.style.color = '#e2c24b'; }
  else if (g.alert < 0.8) { at.textContent = 'Alert'; at.style.color = '#e08a4f'; }
  else { at.textContent = 'COMBAT'; at.style.color = '#e0584f'; }

  const list = $('#objectives-list');
  list.innerHTML = '';
  for (const o of g.objectives) {
    const li = document.createElement('li');
    let label = o.name;
    if (o.id === 'jammer' && !o.complete) label += ` (${Math.floor(o.progress)}/3s)`;
    if (o.id === 'hostage' && g.hostage.freed && !o.complete) label += ' — escort to extraction';
    li.textContent = label;
    if (o.complete) li.classList.add('done');
    list.appendChild(li);
  }

  // notices
  const nw = $('#notices');
  const key = g.notices.map((n) => n.text).join('|');
  if (nw.dataset.key !== key) {
    nw.dataset.key = key;
    nw.innerHTML = '';
    for (const n of g.notices) {
      const d = document.createElement('div');
      d.className = 'notice';
      d.textContent = n.text;
      nw.appendChild(d);
    }
  }

  // crosshair spread / ads
  const ch = $('#crosshair');
  ch.classList.toggle('hip', !p.ads);
  ch.style.display = p.ads ? 'none' : 'block';

  // interact prompt
  const prompt = $('#interact-prompt');
  const hp = $('#hold-progress');
  let label = null;
  for (const d of g.map.doors) {
    if (Math.hypot(p.pos[0] - d.at, p.pos[2] - d.fixed) < 2.2) {
      label = `<b>E</b> ${d.open ? 'Close' : 'Open'} ${d.name}`;
    }
  }
  let nearestPk = null;
  for (const pk of g.pickups) {
    if (!pk.taken && Math.hypot(p.pos[0] - pk.x, p.pos[2] - pk.z) < 1.8) nearestPk = pk;
  }
  if (nearestPk) label = `<b>E</b> Pick up ${ITEM_DEFS[nearestPk.itemId].name}`;
  if (g.hostage.alive && !g.hostage.freed &&
      Math.hypot(p.pos[0] - g.hostage.pos[0], p.pos[2] - g.hostage.pos[2]) < 2) {
    label = `<b>E</b> Free the detainee`;
  }
  const c = g.map.zones.console;
  const jammer = g.objectives.find((o) => o.id === 'jammer');
  const nearConsole = Math.hypot(p.pos[0] - c.x, p.pos[2] - c.z) < 1.8;
  if (nearConsole && !jammer.complete) {
    label = `<b>Hold E</b> Disable comms jammer`;
    hp.classList.remove('hidden');
    $('#hold-fill').style.width = Math.min(100, (jammer.progress / 3) * 100) + '%';
  } else {
    hp.classList.add('hidden');
  }
  if (label) { prompt.innerHTML = label; prompt.classList.remove('hidden'); }
  else prompt.classList.add('hidden');

  // damage vignette
  if (p.health < state.lastHealth - 0.01) {
    state.audio.hurt();
    const v = $('#hurt-vignette');
    v.classList.add('hit');
    setTimeout(() => v.classList.remove('hit'), 220);
  }
  state.lastHealth = p.health;
  $('#lowhp-vignette').style.opacity = p.health < 30 ? 1 : 0;
}

function showEndScreen(g) {
  state.mode = 'ended';
  state.input.exitLock();
  show('end');
  const win = g.status === 'won';
  const title = $('#end-title');
  title.textContent = win ? 'Mission Complete' : 'Mission Failed';
  title.className = win ? 'win' : 'lose';
  $('#end-reason').textContent = win
    ? 'All objectives secured and extraction successful.'
    : g.lossReason || 'Mission failed.';
  const acc = g.stats.shotsFired > 0
    ? Math.round((g.stats.shotsHit / g.stats.shotsFired) * 100) : 0;
  const rows = [
    ['Result', win ? 'SUCCESS' : 'FAILED'],
    ['Accuracy', acc + '%'],
    ['Kills', g.stats.kills],
    ['Damage taken', Math.round(g.stats.damageTaken)],
    ['Damage dealt', Math.round(g.stats.damageDealt)],
    ['Time remaining', fmtTime(g.timeLeft)],
    ['Extracted', win ? 'Yes' : 'No'],
  ];
  $('#end-stats').innerHTML = rows.map(([k, v]) =>
    `<div class="stat-line"><span>${k}</span><b>${v}</b></div>`).join('');
  win ? state.audio.win() : state.audio.lose();
}

// ---------- backpack ----------
function openBag() {
  state.mode = 'bag';
  state.input.exitLock();
  const g = state.game;
  $('#bag-slots').textContent = `${usedSlots(g.inventory)}/${g.inventory.capacity}`;
  $('#bag-reserves').innerHTML =
    `Pistol ammo: ${g.inventory.reserve.pistolAmmo} · ` +
    `Rifle ammo: ${g.inventory.reserve.rifleAmmo} · ` +
    `Shells: ${g.inventory.reserve.shotgunAmmo}`;
  const ul = $('#bag-list');
  ul.innerHTML = '';
  if (g.inventory.items.length === 0) {
    ul.innerHTML = '<li><span class="bag-name muted">Backpack is empty</span></li>';
  }
  for (const it of g.inventory.items) {
    const def = ITEM_DEFS[it.id];
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.innerHTML = `<span class="bag-name">${def.name}</span><span class="bag-size">${def.size} slot${def.size > 1 ? 's' : ''}</span>`;
    const actions = document.createElement('span');
    if (it.id === 'medkit') {
      const use = document.createElement('button');
      use.textContent = 'Use';
      use.onclick = () => { useMedkit(g); state.audio.pickup(); openBag(); };
      actions.appendChild(use);
    }
    const drop = document.createElement('button');
    drop.textContent = 'Drop';
    drop.onclick = () => { dropItem(g, it.uid); openBag(); };
    actions.appendChild(drop);
    li.append(left, actions);
    ul.appendChild(li);
  }
  show('bag');
}
function closeBag() {
  if (state.game.status !== 'playing') { state.mode = 'paused'; show('pause'); return; }
  state.mode = 'playing';
  hideAllScreens();
  state.input.requestLock();
}

// ---------- game events -> audio / fx ----------
function processGameEvents(g) {
  for (const ev of g.events) {
    if (ev._uiSeen) continue;
    ev._uiSeen = true;
    switch (ev.type) {
      case 'playerShot':
        state.audio.shot(ev.weapon);
        state.renderer.flashMuzzle();
        state.renderer.recoilKick(g.weaponDefs[ev.weapon].recoil * 0.18);
        state.renderer.addTracer(g.eye, g.aimDir, ev.weapon);
        break;
      case 'dryFire': state.audio.dryFire(); break;
      case 'enemyShot':
        state.audio.enemyShot();
        state.renderer.addTracer(ev.from, ev.dir, ev.weapon, true);
        // damage direction indicator relative to view yaw
        if (state.game) {
          const pp = state.game.player.pos;
          let ang = Math.atan2(-(ev.from[0] - pp[0]), -(ev.from[2] - pp[2]));
          let rel = ang - state.game.player.yaw;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          const deg = (rel * 180) / Math.PI;
          let dirId = 'dmg-top';
          if (deg > 45 && deg <= 135) dirId = 'dmg-right';
          else if (deg < -45 && deg >= -135) dirId = 'dmg-left';
          else if (Math.abs(deg) > 135) dirId = 'dmg-bottom';
          const el = document.getElementById(dirId);
          el.classList.add('flash');
          clearTimeout(el._tm);
          el._tm = setTimeout(() => el.classList.remove('flash'), 260);
        }
        break;
      case 'enemyDamaged': {
        const marker = $('#hitmarker');
        marker.classList.add('show');
        clearTimeout(marker._tm);
        marker._tm = setTimeout(() => marker.classList.remove('show'), 120);
        state.audio.hitMarker();
        break;
      }
      case 'enemyKilled': {
        const marker = $('#hitmarker');
        marker.classList.add('show', 'kill');
        clearTimeout(marker._tm);
        marker._tm = setTimeout(() => marker.classList.remove('show', 'kill'), 220);
        state.audio.killMarker();
        break;
      }
      case 'wall': break;
      case 'wallSpark': state.renderer.addSpark(ev.point, 0xffc46a); break;
      case 'pickup': state.audio.pickup(); break;
      case 'door': state.audio.interact(); break;
      case 'heal': state.audio.pickup(); break;
      default: break;
    }
  }
  // wall sparks: combat results aren't events; sample shots via tracer only
}

// ---------- per-frame weapon handling ----------
function handleWeaponInput(g, dt) {
  const inp = state.input;
  // weapon switching
  for (let i = 0; i < WEAPON_ORDER.length; i++) {
    if (inp.consumePressed('Digit' + (i + 1))) {
      switchWeapon(g, WEAPON_ORDER[i]);
      state.audio.interact();
    }
  }
  if (inp.consumePressed('KeyR')) { reloadCurrent(g); state.audio.reload(); }
  if (inp.consumePressed('KeyQ')) {
    // quick cycle
    const idx = WEAPON_ORDER.indexOf(g.arsenal.current);
    switchWeapon(g, WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length]);
  }
  if (inp.consumePressed('KeyH')) useMedkit(g);

  if (inp.consumePressed('KeyE')) interact(g);

  const def = g.weaponDefs[g.arsenal.current];
  if (inp.mouseDown && state.mode === 'playing') {
    if (def.automatic) {
      state.autoFireAcc += dt;
      const interval = 60 / def.rpm;
      while (state.autoFireAcc >= interval) {
        tryShoot(g);
        state.autoFireAcc -= interval;
      }
    } else if (!inp._firedThisClick) {
      tryShoot(g);
      inp._firedThisClick = true;
    }
  }
  if (!inp.mouseDown) inp._firedThisClick = false;
}

// ---------- main loop ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.mode === 'playing' && state.game) {
    const g = state.game;
    state.input.applyTo(g);
    handleWeaponInput(g, dt);
    updateGame(g, dt);
    processGameEvents(g);
    state.renderer.update(g, dt);
    state.renderer.setWeaponView(g.arsenal.current, g.player.ads);
    updateHUD(g);
    drawMinimap($('#minimap'), g);
    if (g.status !== 'playing') showEndScreen(g);
  } else if (state.game && state.renderer && (state.mode === 'paused' || state.mode === 'ended' || state.mode === 'bag')) {
    // keep rendering a frozen frame behind menus
    state.renderer.update(state.game, 0);
  }
}
requestAnimationFrame(frame);

// ---------- menu wiring ----------
$('#btn-start').onclick = () => { state.audio.ensure(); startNewGame(); };
$('#btn-continue').onclick = () => { openSaves('load'); };
$('#btn-settings').onclick = () => { syncSettingsUI(); state.returnScreen = 'menu'; show('settings'); };
$('#btn-quit').onclick = () => { show('quit'); };
$('#btn-quit-back').onclick = () => showOnlyMenu();

$('#btn-resume').onclick = resumeGame;
$('#btn-save').onclick = () => openSaves('save');
$('#btn-pause-settings').onclick = () => { syncSettingsUI(); state.returnScreen = 'pause'; show('settings'); };
$('#btn-restart').onclick = () => startNewGame();
$('#btn-quit-menu').onclick = () => { state.mode = 'menu'; showOnlyMenu(); };

$('#btn-settings-apply').onclick = readSettingsUI;
$('#set-volume').oninput = (e) => { $('#set-volume-val').textContent = Math.round(e.target.value * 100); };
$('#set-sensitivity').oninput = (e) => { $('#set-sensitivity-val').textContent = parseFloat(e.target.value).toFixed(2); };
$('#set-fov').oninput = (e) => { $('#set-fov-val').textContent = e.target.value; };

document.querySelectorAll('[data-back]').forEach((b) => {
  b.onclick = () => {
    if (state.mode === 'menu') return showOnlyMenu();
    show(state.returnScreen === 'pause' ? 'pause' : 'menu');
  };
});

$('#btn-bag-close').onclick = closeBag;
$('#btn-end-restart').onclick = () => startNewGame();
$('#btn-end-menu').onclick = () => showOnlyMenu();

document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && state.game && (state.mode === 'playing' || state.mode === 'bag')) {
    e.preventDefault();
    if (state.mode === 'playing') openBag();
    else closeBag();
  }
  if (e.code === 'Escape') {
    if (state.mode === 'bag') closeBag();
  }
});

// click canvas to re-lock when playing
canvas.addEventListener('click', () => {
  if (state.mode === 'playing' && state.input && !state.input.locked) state.input.requestLock();
});

showOnlyMenu();
