// audio.js — the sound of the same rain that is on the glass.
//
// There is no separate rain-sound generator here. Every tap you can pick out is
// a drop the simulation really put on the pane, with that drop's own energy and
// that spot's own wetness. Nothing is sampled or looped; it is all synthesised,
// so the timbre moves continuously with drop size, impact energy and how wet the
// glass already is, which a fixed set of recordings cannot do.
//
// See AUDIO_SPEC.md. This is the first milestone: the exterior bed, the impact
// layer (dry through to wet), and a mute. Runoff and edge drainage come later,
// once their solver metrics have thresholds measured rather than guessed.

// --- the acoustic pane ------------------------------------------------------
//
// The screen is a close-up: at fifteen pixels per millimetre it shows a patch of
// glass the size of a playing card, about 37 cm². A patch that size is almost
// silent — even in a downpour it takes about a hundred drops a second, which
// reads as a rattle of separate taps, not as rain.
//
// So what you *hear* is the whole window, not the patch you are looking at: a
// big single-glazed one, about 1.2 m², three hundred-odd times the visible area.
// That larger population is never instantiated — inventing a second rain process
// beside the one on screen is exactly what the contract forbids. It is only a
// count, and it sets how loud and how dense the unresolved texture is. The taps
// with identity, the ones you hear as individual drops, are all real drops off
// the glass in front of you.
const ACOUSTIC_AREA_MM2 = 1.2e6;

// Cheap float glass in a wooden frame, deliberately. Laminated or double
// glazing — a good hotel window — is built to damp exactly what we want to
// hear: the interlayer is a constrained damping layer, so it kills the pane's
// own modes and stops most of the rain field outside. The result is a dull
// thud and nothing else. Single 4 mm glass in a poorly sealed frame lets the
// exterior through and rings.
//
// Keep the pane response broad and short. Earlier high-Q versions sounded like
// castanets; an earlier sharper transient sounded like little explosions. The
// foreground impacts do, however, need a little spectral space of their own or
// they disappear into the unresolved patter. The patter is therefore kept lower
// and broader while the identifiable pane response sits slightly above it.
const PLATE_HZ = 1320;
const PLATE_Q = 2.0;                // colour, not pitch
const PATTER_HZ = 760;              // keep the unresolved bed out of the tap band

// How the three parts of a tap are balanced, in units where 1.0 is the ring's
// own gain. The splash still leads, but the pane is now present enough for a few
// impacts to read as distinct drops instead of disappearing into the bed.
const RING_MIX = 0.55;
const SECOND_MIX = 0.09;
const SPLASH_MIX = 1.08;
// The splash runs through a LOWPASS while the ring runs through a bandpass, so
// equal gain is not equal loudness. Keep the trim conservative.
const SPLASH_TRIM = 0.46;
const OUTSIDE_HZ = 4200;            // one thin pane rolls the outside off gently

const BIN_S = 0.02;                 // impacts are gathered into 20 ms windows
const MAX_VOICES = 26;
// How many taps a listener can actually pick out of the roar. Past this point
// more drops make the texture denser, not the individual taps more numerous.
const TAPS_MAX_PER_S = 40;
const REF_ENERGY = 7.5e-5;          // a 2 mm drop at terminal velocity, in joules
// The acoustic energy the window takes in a downpour, MEASURED off the solver.
const REF_FLUX = 6.3;               // joules a second onto 1.2 m2 at 180 mm/h
const RECENT = 64;                  // drops kept as a sample of the population
const RECENT_MAX_S = 8;             // ...and how stale one may be

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.rate = 0;
    this.visibleAreaMm2 = 1;
    this.multiplier = 1;
    this.busy = [];
    this.pending = [];
    this.binAt = 0;
    this.wetness = 0;
    this.flux = 0;
    this.recent = [];
    this.owed = 0;
    this.flushAt = 0;
    this.meanGap = 0;
    this.lastArrival = 0;
    this.targets = {};
    this.heard = 0;
    this.clustered = 0;
  }

  get voices() {
    if (!this.ready) return 0;
    const t = this.ctx.currentTime;
    let k = 0;
    for (const end of this.busy) if (end > t) this.busy[k++] = end;
    this.busy.length = k;
    return k;
  }

  async start() {
    if (this.ready) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (_) { return false; }
    this._build();
    this.ready = true;
    return true;
  }

  _build() {
    const ctx = this.ctx;
    this.targets = {};
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    const n = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i += 1) {
      const w = Math.random() * 2 - 1;
      last = 0.86 * last + 0.14 * w;
      d[i] = last * 2.4;
    }

    // Layer A: exterior rain field.
    this.outsideGain = ctx.createGain();
    this.outsideGain.gain.value = 0;
    this.outsideTone = ctx.createBiquadFilter();
    this.outsideTone.type = 'lowpass';
    this.outsideTone.frequency.value = OUTSIDE_HZ;
    this.outsideTone.Q.value = 0.5;
    this.outsideTone.connect(this.outsideGain).connect(this.master);
    this.outside = [0.97, 1.13].map((rate) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g).connect(this.outsideTone);
      src.start(ctx.currentTime + Math.random() * 0.3);
      return { src, g };
    });

    // Layer B: unresolved impacts. Keep it broad, warm and below the foreground
    // pane-response band so the identifiable real impacts are not masked by a
    // continuous strip of noise at exactly the same frequency.
    this.patterGain = ctx.createGain();
    this.patterGain.gain.value = 0;
    this.patterBand = ctx.createBiquadFilter();
    this.patterBand.type = 'bandpass';
    this.patterBand.frequency.value = PATTER_HZ;
    this.patterBand.Q.value = 0.75;
    this.patterBand.connect(this.patterGain).connect(this.master);
    this.patter = ctx.createBufferSource();
    this.patter.buffer = this.noise;
    this.patter.loop = true;
    this.patter.playbackRate.value = 1.31;
    this.patter.connect(this.patterBand);
    this.patter.start(ctx.currentTime + Math.random() * 0.2);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (this.muted) {
      g.setTargetAtTime(0, t, 0.015);
      g.setValueAtTime(0, t + 0.09);
    } else {
      g.setTargetAtTime(1, t, 0.02);
    }
  }

  setPane(visibleAreaMm2) {
    this.visibleAreaMm2 = Math.max(1, visibleAreaMm2);
    this.multiplier = ACOUSTIC_AREA_MM2 / this.visibleAreaMm2;
  }

  setRate(mmPerHour) {
    this.rate = Math.max(0, mmPerHour);
  }

  handleImpact(ev) {
    if (!this.ready || this.pending.length > 400) return;
    this.pending.push(ev);
  }

  updateMetrics(m) {
    if (m && typeof m.wetFraction === 'number') this.wetness = m.wetFraction;
  }

  suspend() {
    if (this.ready && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
    this.pending.length = 0;
    this.owed = 0;
    this.recent.length = 0;
    this.meanGap = 0;
    this.lastArrival = 0;
  }

  update(now) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this._beds(t);
    if (now - this.binAt < BIN_S * 1000) return;
    this.binAt = now;
    const dt = this.flushAt ? Math.min(0.25, t - this.flushAt) : BIN_S;
    this.flushAt = t;
    this._flush(t, dt);
  }

  _beds(t) {
    const heardFlux = Math.min(this.flux, this.salientRate() * REF_ENERGY);
    const texture = Math.min(1, Math.sqrt(Math.max(0, this.flux - heardFlux) / REF_FLUX));
    const wash = Math.min(1, Math.sqrt(this.flux / REF_FLUX));
    const wet = Math.min(1, this.wetness * 1.6);
    this._ramp('outGain', this.outsideGain.gain, 0.16 * wash, 0.35);
    this._ramp('outTone', this.outsideTone.frequency, OUTSIDE_HZ * (1 - 0.35 * wash), 0.5);
    // Slightly quieter than before, and deliberately separated from PLATE_HZ.
    this._ramp('patGain', this.patterGain.gain, 0.16 * texture, 0.25);
    this._ramp('patTone', this.patterBand.frequency, PATTER_HZ * (1 - 0.15 * wet) * (1 - 0.08 * texture), 0.4);
    this._ramp('patQ', this.patterBand.Q, 0.75 + 0.25 * (1 - wet), 0.4);
  }

  _ramp(key, param, target, tau) {
    const was = this.targets[key];
    if (was !== undefined && Math.abs(target - was) < Math.max(1e-4, Math.abs(was) * 0.01)) return;
    this.targets[key] = target;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.setTargetAtTime(target, t, tau);
    if (target === 0) param.setValueAtTime(0, t + tau * 5);
  }

  salientRate() {
    return Math.min(TAPS_MAX_PER_S, this.flux / REF_ENERGY);
  }

  _flush(t, dt = BIN_S) {
    const bin = this.pending;
    for (const ev of bin) { ev.at = t; this.recent.push(ev); }
    if (bin.length) {
      const d = Math.min(4, this.lastArrival ? (t - this.lastArrival) / bin.length : BIN_S);
      this.meanGap = this.meanGap ? this.meanGap + (d - this.meanGap) * 0.15 : d;
      this.lastArrival = t;
    }
    bin.length = 0;

    const cutoff = t - RECENT_MAX_S;
    let k = 0;
    for (const ev of this.recent) if (ev.at >= cutoff) this.recent[k++] = ev;
    this.recent.length = k;
    if (k > RECENT) this.recent.splice(0, k - RECENT);

    let energy = 0;
    for (const ev of this.recent) energy += ev.energy;
    if (!this.recent.length) { this.flux = 0; return; }
    const span = Math.max(BIN_S, t - this.recent[0].at + BIN_S);

    const scale = Math.max(this.meanGap, dt);
    const idle = t - this.lastArrival;
    const eased = scale > 0 ? Math.exp(-Math.max(0, idle - 3 * scale) / (3 * scale)) : 1;
    this.flux = (energy / span) * this.multiplier * eased;

    const most = Math.max(1, Math.ceil(TAPS_MAX_PER_S * dt));
    this.owed = Math.min(most, this.owed + this.salientRate() * dt);
    const budget = Math.max(0, MAX_VOICES - this.voices);
    const n = Math.min(Math.floor(this.owed), most, budget);
    if (n <= 0) return;
    this.owed -= n;

    let total = 0;
    for (const ev of this.recent) total += Math.sqrt(ev.energy);
    for (let i = 0; i < n; i += 1) {
      let pick = Math.random() * total;
      let ev = this.recent[this.recent.length - 1];
      for (const cand of this.recent) {
        pick -= Math.sqrt(cand.energy);
        if (pick <= 0) { ev = cand; break; }
      }
      this._tap(t + (i + Math.random()) * (dt / most), ev, Math.random());
      this.heard += 1;
    }
    this.clustered += Math.max(0, this.flux / REF_ENERGY - n / dt) * dt;
  }

  tapParams(ev) {
    const e = Math.min(6, ev.energy / REF_ENERGY);
    if (e < 0.001) return null;

    const film = Math.min(1, ev.thickness / (0.25 * Math.max(0.3, ev.diameter)));
    const wet = Math.min(1, Math.max(film, ev.wetness * 0.35));
    const loud = Math.min(0.5, 0.11 * Math.pow(e, 0.55)) * (1 - 0.45 * wet);

    const jitter = 0.65 + Math.random() * 0.7;
    // Wet glass should be duller, not have its identifiable band collapse all
    // the way into the unresolved texture. Keep the mass-loading effect but make
    // it less extreme than the previous 62% drop.
    const freq = PLATE_HZ * jitter * (1 - 0.30 * Math.min(1, e / 3)) * (1 - 0.48 * wet);
    const q = PLATE_Q * (1 - 0.45 * wet);
    const shape = Math.pow(freq / PLATE_HZ, 0.03) * Math.pow(q / PLATE_Q, 0.39);

    return {
      wet,
      peak: loud * shape * RING_MIX,
      freq,
      q,
      decay: (0.006 + 0.016 * Math.min(1, e / 2)) * (1 - 0.38 * wet),
      second: freq * 2.1,
      secondPeak: loud * shape * SECOND_MIX * (1 - 0.6 * wet),
      contactPeak: loud * shape * SPLASH_MIX * SPLASH_TRIM * (0.85 + 0.5 * wet),
      contactHz: 2100 * (1 - 0.25 * wet),
      contactDecay: 0.004 + 0.005 * (1 - wet),
    };
  }

  _tap(when, ev, atX) {
    const ctx = this.ctx;
    const p = this.tapParams(ev);
    if (!p) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const offset = Math.random() * (this.noise.duration - 0.3);

    const ring = ctx.createBiquadFilter();
    ring.type = 'bandpass';
    ring.frequency.value = p.freq;
    ring.Q.value = p.q;

    const two = ctx.createBiquadFilter();
    two.type = 'bandpass';
    two.frequency.value = p.second;
    two.Q.value = p.q * 0.8;

    const contact = ctx.createBiquadFilter();
    contact.type = 'lowpass';
    contact.frequency.value = p.contactHz;

    const gRing = ctx.createGain();
    const gTwo = ctx.createGain();
    const gContact = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = ((atX === undefined ? ev.x : atX) - 0.5) * 0.5;

    src.connect(ring).connect(gRing);
    src.connect(two).connect(gTwo);
    src.connect(contact).connect(gContact);
    const out = pan || this.master;
    gRing.connect(out);
    gTwo.connect(out);
    gContact.connect(out);
    if (pan) pan.connect(this.master);

    // Slightly faster than the prior 2.5 ms rise, but still far from the old
    // sub-millisecond click. This gives the ear an onset without making a nail
    // strike or castanet out of the drop.
    const a = 0.0018;
    const env = (g, peak, atk, dec) => {
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak + 1e-6, when + atk);
      g.gain.exponentialRampToValueAtTime(Math.max(1e-7, peak * 0.002), when + atk + dec);
    };
    env(gRing, p.peak, a, p.decay);
    env(gTwo, p.secondPeak, a * 0.6, p.decay * 0.5);
    env(gContact, p.contactPeak, 0.0006, p.contactDecay);

    const stop = when + a + p.decay + 0.03;
    src.start(when, offset, stop - when + 0.02);
    this.busy.push(stop);
    src.onended = () => {
      src.disconnect(); ring.disconnect(); two.disconnect(); contact.disconnect();
      gRing.disconnect(); gTwo.disconnect(); gContact.disconnect();
      if (pan) pan.disconnect();
    };
  }
}
