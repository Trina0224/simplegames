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
const PLATE_HZ = 2500;              // where a light tap on this pane sits
const PLATE_Q = 3.4;                // mounted glass is damped by its frame
const OUTSIDE_HZ = 4200;            // one thin pane rolls the outside off gently

const BIN_S = 0.02;                 // impacts are gathered into 20 ms windows
const MAX_VOICES = 26;
// How many taps a listener can actually pick out of the roar. Past this point
// more drops make the texture denser, not the individual taps more numerous.
const TAPS_MAX_PER_S = 150;
const MAX_SALIENT_PER_BIN = Math.max(1, Math.round(TAPS_MAX_PER_S * BIN_S));
const REF_ENERGY = 7.5e-5;          // a 2 mm drop at terminal velocity, in joules

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.rate = 0;
    this.visibleAreaMm2 = 1;
    this.multiplier = 1;
    // Live voices are tracked by when they are *scheduled* to end, not by their
    // onended callbacks. A callback only fires when the main thread is free, so
    // during a long frame or a GC pause a callback-counted budget stays full and
    // the engine goes silent exactly when the rain is heaviest. The scheduler
    // knows when each voice stops; ask it.
    this.busy = [];
    this.pending = [];
    this.binAt = 0;
    this.wetness = 0;
    this.targets = {};              // last value asked of each bed parameter
    this.heard = 0;                 // salient impacts voiced, for the tests
    this.clustered = 0;             // ...and impacts folded into the texture
  }

  /** Voices still sounding, by the clock rather than by callbacks. */
  get voices() {
    if (!this.ready) return 0;
    const t = this.ctx.currentTime;
    let k = 0;
    for (const end of this.busy) if (end > t) this.busy[k++] = end;
    this.busy.length = k;
    return k;
  }

  /** Must be called from a user gesture. */
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

    // One noise buffer, reused by everything. Generating it once costs a few
    // milliseconds; generating one per impact would allocate at seventy hertz.
    const n = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i += 1) {
      const w = Math.random() * 2 - 1;
      last = 0.86 * last + 0.14 * w;   // a gentle tilt towards pink
      d[i] = last * 2.4;
    }

    // --- Layer A: the rain field outside, heard through one pane of glass.
    // Two sources at slightly different rates, so there is no loop to hear.
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

    // --- Layer B, the unresolved part: the hundreds of drops a second on the
    // pane that are too many to voice individually. They are a texture, not a
    // bed — brighter and closer than the outside, and granular rather than
    // smooth, because it is still made of separate taps.
    this.patterGain = ctx.createGain();
    this.patterGain.gain.value = 0;
    this.patterBand = ctx.createBiquadFilter();
    this.patterBand.type = 'bandpass';
    this.patterBand.frequency.value = PLATE_HZ;
    this.patterBand.Q.value = 0.9;
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
      // setTargetAtTime approaches zero without reaching it, and "almost
      // silent" is not silent. Ramp, then pin it.
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

  /** The simulation's own impacts. Everything here is physical, not rendered. */
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
    // Anything that arrived while hidden is stale: a backlog of old impacts
    // played on return is worse than silence.
    this.pending.length = 0;
  }

  /** Called once a frame. Flushes one bin's worth of impacts. */
  update(now) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this._beds(t);
    if (now - this.binAt < BIN_S * 1000) return;
    this.binAt = now;
    this._flush(t);
  }

  /**
   * The exterior bed and the patter texture both follow the rainfall rate, but
   * they are not the same curve: the outside is a wash that grows steadily and
   * gets darker as the rain gets heavier, and the patter is the pane's own
   * surface, which is quiet in drizzle and becomes a roar. The patter also dulls
   * as the glass wets over, because a film damps the contact.
   *
   * This runs every frame, so it does two things carefully. It re-schedules a
   * parameter only when its target has actually moved, rather than laying down
   * three hundred automation events a second on each of five parameters. And
   * when a target reaches zero it *pins* it there: setTargetAtTime approaches a
   * value without ever arriving, so a bed left to decay towards zero keeps
   * hissing forever. Rain that has stopped has to be silent, not nearly silent.
   */
  _beds(t) {
    const r = this.rate;
    const wash = r <= 0 ? 0 : Math.min(1, Math.pow(r / 90, 0.55));
    const patter = r <= 0 ? 0 : Math.min(1, Math.pow(r / 130, 0.75));
    const wet = Math.min(1, this.wetness * 1.6);
    this._ramp('outGain', this.outsideGain.gain, 0.16 * wash, 0.35);
    this._ramp('outTone', this.outsideTone.frequency, OUTSIDE_HZ * (1 - 0.35 * wash), 0.5);
    this._ramp('patGain', this.patterGain.gain, 0.20 * patter, 0.25);
    this._ramp('patTone', this.patterBand.frequency, PLATE_HZ * (1 - 0.30 * wet) * (1 - 0.15 * patter), 0.4);
    this._ramp('patQ', this.patterBand.Q, 0.9 + 0.5 * (1 - wet), 0.4);
  }

  _ramp(key, param, target, tau) {
    const was = this.targets[key];
    if (was !== undefined && Math.abs(target - was) < Math.max(1e-4, Math.abs(was) * 0.01)) return;
    this.targets[key] = target;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.setTargetAtTime(target, t, tau);
    // Five time constants is within a thousandth; pin it so it truly arrives.
    // Only gains are ever asked for zero here — a filter frequency pinned to
    // zero would be a very different bug, so keep frequency targets off it.
    if (target === 0) param.setValueAtTime(0, t + tau * 5);
  }

  /**
   * One bin.
   *
   * The window is three hundred times the patch on screen, so at a downpour it
   * is taking thousands of drops a second. Drawing thousands of size variates a
   * second would be absurd, and so would voicing them.
   *
   * What you can actually pick out of the roar is a few taps a second, and the
   * ones you pick out are the loud ones. So this voices at most one tap per drop
   * the simulation really put on the glass, choosing which drops those are by
   * energy, without replacement. Everything else the window received — the
   * on-screen population times the area multiplier, minus what was voiced — is
   * never instantiated at all: it is the patter texture.
   *
   * Note what this does *not* do. It does not consult the declared rainfall
   * rate. An earlier version drew the tap count from the rate, which meant a
   * drop that demonstrably hit the glass made no sound whenever the rate said it
   * shouldn't have — the sound stopped following the simulation and started
   * following a number beside it. The rate belongs in the beds, which are a
   * statistical wash; an impact is an event, and events are heard.
   */
  _flush(t) {
    const bin = this.pending;
    if (!bin.length) return;
    const budget = Math.max(0, MAX_VOICES - this.voices);
    const n = Math.min(bin.length, MAX_SALIENT_PER_BIN, budget);

    let total = 0;
    for (const ev of bin) total += ev.energy;
    for (let i = 0; i < n; i += 1) {
      // pick one of the bin's remaining drops, weighted by energy
      let pick = Math.random() * total;
      let at = bin.length - 1;
      for (let k = 0; k < bin.length; k += 1) {
        pick -= bin[k].energy;
        if (pick <= 0) { at = k; break; }
      }
      const ev = bin[at];
      total -= ev.energy;
      bin[at] = bin[bin.length - 1];
      bin.length -= 1;
      // Spread the bin's taps across it rather than firing them together: they
      // did not arrive at the same instant, and stacked onsets read as one loud
      // click instead of several drops.
      this._tap(t + (i + Math.random()) * (BIN_S / MAX_SALIENT_PER_BIN), ev, Math.random());
      this.heard += 1;
    }
    this.clustered += Math.max(0, (bin.length + n) * this.multiplier - n);
    bin.length = 0;
  }

  /**
   * One drop on the glass.
   *
   * Two parts, because the impact is two things: the contact itself, which is a
   * very short broadband crack, and the pane answering it, which is a short
   * ring at the plate's own frequency. Dry glass gives you both; a film mutes
   * the crack and drops the ring, which is the difference the acoustics
   * literature reports between a drop landing on a dry solid and one landing in
   * standing liquid. It is a continuous morph, not two sounds.
   */
  _tap(when, ev, atX) {
    const ctx = this.ctx;
    const e = Math.min(6, ev.energy / REF_ENERGY);
    if (e < 0.02) return;
    // How much of the drop's sound the water already there takes away. The
    // controlling quantity is the film's depth relative to the *drop*, not an
    // absolute thickness: a tenth of a millimetre is a puddle to drizzle and
    // nothing to a storm drop. A film a quarter of the drop's diameter deep
    // mutes it completely. A merely damp pane with no standing film barely
    // changes it, so the two are taken as the larger of the pair rather than
    // added — they are two views of the same water, and summing them saturated
    // ordinary wet glass to total silence.
    const film = Math.min(1, ev.thickness / (0.25 * Math.max(0.3, ev.diameter)));
    const wet = Math.min(1, Math.max(film, ev.wetness * 0.35));
    const loud = Math.min(0.5, 0.11 * Math.pow(e, 0.55)) * (1 - 0.45 * wet);

    // A bigger drop reaches lower into the pane's modes; the jitter is there so
    // that a stream of drops is not a scale.
    const jitter = 0.82 + Math.random() * 0.36;
    // Dry glass rings near the plate's own frequency. A film mass-loads and
    // damps the contact, so the answer drops well down and loses its edge —
    // this is the difference the impact-acoustics work reports between a drop
    // landing on a dry solid and one landing in standing liquid, and it has to
    // be large enough to hear, not a few per cent.
    const freq = PLATE_HZ * jitter * (1 - 0.30 * Math.min(1, e / 3)) * (1 - 0.62 * wet);
    const decay = (0.020 + 0.055 * Math.min(1, e / 2)) * (1 - 0.45 * wet);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const offset = Math.random() * (this.noise.duration - 0.3);

    const ring = ctx.createBiquadFilter();
    ring.type = 'bandpass';
    ring.frequency.value = freq;
    ring.Q.value = PLATE_Q * (1 - 0.5 * wet);

    // The contact crack: the first thing a film kills, and most of what makes
    // dry glass sound like glass.
    const crack = ctx.createBiquadFilter();
    crack.type = 'highpass';
    crack.frequency.value = 4200 * (1 - 0.30 * wet);

    const gRing = ctx.createGain();
    const gCrack = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = ((atX === undefined ? ev.x : atX) - 0.5) * 0.5;   // a pane in front of you, not an arcade

    src.connect(ring).connect(gRing);
    src.connect(crack).connect(gCrack);
    const out = pan || this.master;
    gRing.connect(out);
    gCrack.connect(out);
    if (pan) pan.connect(this.master);

    const a = 0.0008;
    gRing.gain.setValueAtTime(0, when);
    gRing.gain.linearRampToValueAtTime(loud, when + a);
    gRing.gain.exponentialRampToValueAtTime(0.0001, when + a + decay);
    // the contact crack is shorter than the ring, and the first thing a film kills
    const crackLoud = loud * 1.15 * Math.pow(1 - wet, 2.2) + 1e-5;
    gCrack.gain.setValueAtTime(0, when);
    gCrack.gain.linearRampToValueAtTime(crackLoud, when + 0.0004);
    gCrack.gain.exponentialRampToValueAtTime(0.0001, when + 0.004 + 0.006 * (1 - wet));

    const stop = when + a + decay + 0.03;
    src.start(when, offset, stop - when + 0.02);
    this.busy.push(stop);
    // onended only tears the graph down; it is not what counts the voice.
    src.onended = () => {
      src.disconnect(); ring.disconnect(); crack.disconnect();
      gRing.disconnect(); gCrack.disconnect();
      if (pan) pan.disconnect();
    };
  }
}
