// sound.js — a synthesised wooden clack. No audio files, no network.

const MIN_GAP = 0.028;   // seconds between clacks, so a fast fidget rattles

export class Clack {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = 0;
    this.noise = null;
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(this.ctx.destination);
    const length = Math.floor(this.ctx.sampleRate * 0.12);
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  /** `speed` is the slat's closing speed in degrees per second. */
  play(speed) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.last < MIN_GAP) return;
    this.last = now;
    const level = Math.min(1, speed / 260);
    if (level < 0.06) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.35;

    const body = this.ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 1500 + Math.random() * 700;
    body.Q.value = 1.6;

    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 5200;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * level, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    src.connect(body);
    body.connect(damp);
    damp.connect(gain);
    gain.connect(this.out);
    src.start(now);
    src.stop(now + 0.14);
  }
}
