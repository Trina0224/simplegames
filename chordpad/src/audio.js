// audio.js — Web Audio engine: instruments, envelopes, reverb, master chain.
// Every voice is created from an instrument definition so adding a sound is data, not plumbing.

import { midiToFreq } from './theory.js';

export const INSTRUMENTS = [
  { id: 'piano',  name: 'Piano' },
  { id: 'guitar', name: 'Acoustic Guitar' },
  { id: 'organ',  name: 'Organ' },
  { id: 'strings', name: 'Strings' },
  { id: 'pad',    name: 'Soft Pad' },
];

const DEFS = {
  piano: {
    kind: 'additive',
    gain: 0.5,
    reverb: 0.16,
    attack: 0.004,
    release: 0.28,
    sustaining: false,
    partials: [
      { ratio: 1, gain: 1.0, decay: 3.4 },
      { ratio: 2, gain: 0.38, decay: 1.9 },
      { ratio: 3, gain: 0.14, decay: 1.1 },
      { ratio: 4.02, gain: 0.07, decay: 0.7 },
      { ratio: 5.9, gain: 0.03, decay: 0.45 },
    ],
    tone: 4200,
  },
  guitar: {
    kind: 'karplus',
    gain: 0.6,
    reverb: 0.18,
    release: 0.16,
    sustaining: false,
    damping: 0.4,
    tone: 3600,
  },
  organ: {
    kind: 'additive',
    gain: 0.34,
    reverb: 0.22,
    attack: 0.02,
    release: 0.14,
    sustaining: true,
    partials: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.28 },
      { ratio: 4, gain: 0.16 },
      { ratio: 6, gain: 0.08 },
    ],
    tone: 3200,
  },
  strings: {
    kind: 'sub',
    gain: 0.26,
    reverb: 0.34,
    attack: 0.26,
    release: 0.7,
    sustaining: true,
    waves: [
      { type: 'sawtooth', detune: -7, gain: 1 },
      { type: 'sawtooth', detune: 7, gain: 1 },
    ],
    filter: { start: 900, peak: 2400, sustain: 1900, q: 0.7 },
    vibrato: { rate: 5.2, depth: 4 },
  },
  pad: {
    kind: 'sub',
    gain: 0.24,
    reverb: 0.42,
    attack: 0.85,
    release: 1.6,
    sustaining: true,
    waves: [
      { type: 'triangle', detune: -9, gain: 1 },
      { type: 'sine', detune: 9, gain: 0.8 },
      { type: 'triangle', detune: 0, gain: 0.5 },
    ],
    filter: { start: 500, peak: 1500, sustain: 1150, q: 0.6 },
    vibrato: { rate: 3.4, depth: 3 },
  },
};

// The densest accompaniment figures schedule nearly thirty notes a bar, and a
// piano note rings for about four seconds, so voices pile up faster than they
// decay. Steal the oldest rather than letting an old device run out of breath.
const MAX_VOICES = 48;

function makeImpulse(ctx, seconds = 2.4, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 40 ? i / 40 : 1);
    }
  }
  return buffer;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.instrumentId = 'piano';
    this.volume = 0.8;
    this.ksCache = new Map();
    this.activeVoices = new Set();
  }

  // Must be called from a user gesture (iOS/Safari autoplay policy).
  async start() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this._buildGraph();
    }
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (_) { /* retried on next gesture */ }
    }
    this.ready = this.ctx.state === 'running';
    return this.ready;
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.18;

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.2;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);

    this.dry.connect(this.master);
    this.wet.connect(this.reverb);
    this.reverb.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  setInstrument(id) {
    if (DEFS[id]) {
      this.instrumentId = id;
      this.ksCache.clear();
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(v, now, 0.02);
    }
  }

  get def() { return DEFS[this.instrumentId]; }

  get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }

  // Instruments whose sound decays on its own ignore hold length.
  get sustaining() { return !!this.def.sustaining; }

  _ksBuffer(midi) {
    const key = `${this.instrumentId}:${midi}`;
    if (this.ksCache.has(key)) return this.ksCache.get(key);
    const ctx = this.ctx;
    const freq = midiToFreq(midi);
    const sr = ctx.sampleRate;
    const period = Math.max(2, Math.round(sr / freq));
    const length = Math.floor(sr * 2.6);
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    // Excite with lightly low-passed noise, then run the Karplus-Strong string loop.
    let last = 0;
    for (let i = 0; i < period; i += 1) {
      const n = Math.random() * 2 - 1;
      last = last * 0.55 + n * 0.45;
      data[i] = last;
    }
    const damp = this.def.damping ?? 0.4;
    const loss = 0.9965 - damp * 0.004;
    for (let i = period; i < length; i += 1) {
      data[i] = loss * 0.5 * (data[i - period] + data[i - period + 1]);
    }
    const tail = Math.floor(sr * 0.05);
    for (let i = 0; i < tail; i += 1) data[length - 1 - i] *= i / tail;
    this.ksCache.set(key, buffer);
    return buffer;
  }

  /**
   * Start one note. Returns a handle with release(time).
   * `velocity` 0..1, `time` in AudioContext seconds.
   */
  /** Release the oldest voices so the engine never exceeds its polyphony. */
  _reap() {
    while (this.activeVoices.size >= MAX_VOICES) {
      const oldest = this.activeVoices.values().next().value;
      if (!oldest) break;
      this.activeVoices.delete(oldest);
      oldest.release(this.ctx.currentTime);
    }
  }

  noteOn(midi, time, velocity = 1) {
    if (!this.ready) return null;
    this._reap();
    const ctx = this.ctx;
    const def = this.def;
    const t = Math.max(time, ctx.currentTime);
    const freq = midiToFreq(midi);
    const out = ctx.createGain();
    out.gain.value = 1;
    const level = ctx.createGain();
    // Tilt: the top of an arpeggio is rolled off so it does not poke out, and
    // the bass is lifted, because the ear hears low notes as much quieter at
    // the same amplitude.
    const tilt = midi >= 60
      ? 1 - Math.min(0.35, (midi - 60) * 0.012)
      : 1 + Math.min(0.6, (60 - midi) * 0.02);
    const vel = velocity * def.gain * tilt;
    level.gain.value = 0;
    out.connect(level);
    level.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = def.reverb;
    level.connect(send);
    send.connect(this.wet);

    const nodes = [];
    let naturalEnd = null;

    if (def.kind === 'additive') {
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = def.tone;
      tone.connect(out);
      for (const p of def.partials) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * p.ratio;
        const g = ctx.createGain();
        if (p.decay) {
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p.gain), t + (def.attack || 0.005));
          g.gain.setTargetAtTime(0.0001, t + (def.attack || 0.005), p.decay / 3.2);
        } else {
          g.gain.value = p.gain;
        }
        osc.connect(g);
        g.connect(tone);
        osc.start(t);
        nodes.push(osc);
      }
      if (!def.sustaining) {
        const longest = Math.max(...def.partials.map((p) => p.decay || 0));
        naturalEnd = t + longest + 0.6;
      }
    } else if (def.kind === 'karplus') {
      const src = ctx.createBufferSource();
      src.buffer = this._ksBuffer(midi);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = def.tone;
      src.connect(tone);
      tone.connect(out);
      src.start(t);
      nodes.push(src);
      naturalEnd = t + src.buffer.duration;
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = def.filter.q;
      filter.frequency.setValueAtTime(def.filter.start, t);
      filter.frequency.linearRampToValueAtTime(def.filter.peak, t + def.attack);
      filter.frequency.setTargetAtTime(def.filter.sustain, t + def.attack, 0.6);
      filter.connect(out);
      let depth = null;
      if (def.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = def.vibrato.rate;
        depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(def.vibrato.depth, t + def.attack + 0.4);
        lfo.connect(depth);
        lfo.start(t);
        nodes.push(lfo);
      }
      for (const w of def.waves) {
        const osc = ctx.createOscillator();
        osc.type = w.type;
        osc.frequency.value = freq;
        osc.detune.value = w.detune;
        if (depth) depth.connect(osc.detune);
        const g = ctx.createGain();
        g.gain.value = w.gain;
        osc.connect(g);
        g.connect(filter);
        osc.start(t);
        nodes.push(osc);
      }
    }

    // A phone or tablet speaker cannot reproduce a 50 Hz fundamental at all.
    // Sounding the octave above it lets the ear supply the root itself, which
    // is what makes a bass note read as powerful rather than merely present.
    if (midi < 48) {
      const depth = Math.min(1, (48 - midi) / 14);
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.value = freq * 2;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.34 * depth;
      if (!def.sustaining) {
        // Decaying instruments must not leave the reinforcement ringing on
        // underneath, or a piano bass turns into an organ.
        const decay = def.partials ? (def.partials[0].decay || 2.2) : 2.2;
        bodyGain.gain.setValueAtTime(0.34 * depth, t);
        bodyGain.gain.setTargetAtTime(0.0001, t, decay / 3.2);
      }
      body.connect(bodyGain);
      bodyGain.connect(out);
      body.start(t);
      nodes.push(body);
    }

    const attack = def.attack || 0.004;
    level.gain.setValueAtTime(0.0001, t);
    level.gain.exponentialRampToValueAtTime(Math.max(0.0005, vel), t + attack);

    const handle = {
      endTime: naturalEnd,
      released: false,
      release: (when) => {
        if (handle.released) return;
        handle.released = true;
        const r = Math.max(when ?? ctx.currentTime, t + attack + 0.005);
        const rel = def.release;
        level.gain.cancelScheduledValues(r);
        level.gain.setValueAtTime(Math.max(0.0002, level.gain.value), r);
        level.gain.setTargetAtTime(0.0001, r, rel / 3.5);
        const stopAt = r + rel + 0.2;
        for (const n of nodes) { try { n.stop(stopAt); } catch (_) { /* already stopped */ } }
        setTimeout(() => {
          try { level.disconnect(); send.disconnect(); out.disconnect(); } catch (_) { /* noop */ }
          this.activeVoices.delete(handle);
        }, Math.max(0, (stopAt - ctx.currentTime) * 1000) + 60);
      },
    };

    if (naturalEnd != null) {
      // Decaying instruments free themselves even if nothing releases them.
      for (const n of nodes) { try { n.stop(naturalEnd + 0.1); } catch (_) { /* noop */ } }
      setTimeout(() => {
        try { level.disconnect(); send.disconnect(); out.disconnect(); } catch (_) { /* noop */ }
        this.activeVoices.delete(handle);
      }, Math.max(0, (naturalEnd - ctx.currentTime) * 1000) + 200);
    }

    this.activeVoices.add(handle);
    return handle;
  }

  /** Release everything currently sounding. */
  allOff(time) {
    const t = time ?? this.currentTime;
    for (const v of [...this.activeVoices]) v.release(t);
  }
}
