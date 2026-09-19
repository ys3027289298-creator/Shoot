// Procedural sound effects via WebAudio (no external assets required).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.settings = { masterVolume: 0.8, sfxVolume: 0.9 };
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.masterVolume;
    this.master.connect(this.ctx.destination);
  }

  setSettings(s) {
    this.settings = { ...this.settings, ...s };
    if (this.master) this.master.gain.value = this.settings.masterVolume;
  }

  volume() {
    return this.settings.masterVolume * this.settings.sfxVolume;
  }

  noiseBuffer(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  gunshot(kind) {
    this.ensure();
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = this.volume() * (kind === 'shotgun' ? 0.9 : kind === 'rifle' ? 0.6 : 0.45);
    out.connect(this.master);
    const dur = kind === 'shotgun' ? 0.32 : 0.16;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'pistol' ? 2600 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + dur);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(out);
    src.start(t);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(kind === 'rifle' ? 140 : 110, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    og.gain.value = this.volume() * 0.25;
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  blip(freq, duration = 0.08, gain = 0.2, type = 'sine') {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = this.volume() * gain;
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  reload() {
    this.blip(500, 0.05, 0.15, 'square');
    setTimeout(() => this.blip(380, 0.05, 0.15, 'square'), 120);
  }

  hit(kill) {
    this.blip(kill ? 880 : 620, kill ? 0.14 : 0.07, 0.25, 'triangle');
  }

  hurt() {
    this.ensure();
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.value = this.volume() * 0.4;
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  objective() {
    this.blip(660, 0.12, 0.25, 'sine');
    setTimeout(() => this.blip(990, 0.18, 0.25, 'sine'), 130);
  }

  enemyShot() {
    this.blip(180 + Math.random() * 40, 0.06, 0.08, 'square');
  }
}
