// Procedural sound effects via WebAudio (no asset files needed).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  noiseBuffer(duration) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  burst(duration, freq, type = 'square', gain = 0.3, sweepTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  noiseHit(duration, gain = 0.25, filterFreq = 1200) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  shot(weaponId) {
    if (!this.ctx) return;
    if (weaponId === 'pistol') {
      this.burst(0.12, 320, 'square', 0.35, 90);
      this.noiseHit(0.1, 0.18, 1800);
    } else if (weaponId === 'rifle') {
      this.burst(0.09, 260, 'sawtooth', 0.3, 70);
      this.noiseHit(0.08, 0.2, 2400);
    } else {
      this.burst(0.28, 140, 'sawtooth', 0.5, 40);
      this.noiseHit(0.25, 0.4, 900);
    }
  }

  dryFire() { this.burst(0.04, 900, 'square', 0.12, 700); }
  reload() { this.burst(0.06, 500, 'square', 0.12, 300); setTimeout(() => this.burst(0.06, 350, 'square', 0.1, 240), 120); }
  hitMarker() { this.burst(0.05, 1400, 'sine', 0.14, 1800); }
  killMarker() { this.burst(0.07, 900, 'triangle', 0.2, 1500); }
  hurt() { this.burst(0.18, 180, 'sawtooth', 0.3, 70); }
  pickup() { this.burst(0.09, 700, 'sine', 0.18, 1100); }
  interact() { this.burst(0.07, 420, 'square', 0.14, 260); }
  objective() { this.burst(0.12, 600, 'sine', 0.2, 900); setTimeout(() => this.burst(0.16, 900, 'sine', 0.2, 1200), 130); }
  enemyShot() { this.noiseHit(0.06, 0.06, 3000); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.burst(0.25, f, 'sine', 0.22), i * 160)); }
  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this.burst(0.3, f, 'sawtooth', 0.2, f * 0.8), i * 200));
  }
}
