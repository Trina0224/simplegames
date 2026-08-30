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
// Where a drop on this pane sits. Not where a *fingernail* on this pane sits,
// which is what 2500 Hz at a Q of 11 describes — that is a hard, point-like,
// elastic strike, and it came back from the device as "like castanets, honestly
// nowhere near". It was an over-correction: at a Q of 3.4 the taps had been
// reported as little explosions, and a sharper resonance fixes the harshness by
// turning the click into a note, which is not the same thing as fixing it.
//
// A raindrop is neither. It is soft, spread over a millimetre or two, and most
// of what you hear is not the plate: it is the splash — the lamella thrown
// outward, the film slapping back. Broadband, low, over in a few milliseconds.
// The pane's resonance is a colour on a noise burst, not a note.
const PLATE_HZ = 1150;
const PLATE_Q = 2.2;                // a colour, not a pitch

// How the three parts of a tap are balanced, in units where 1.0 is the ring's
// own gain. The splash leads; the pane answers under it.
const RING_MIX = 0.42;
const SECOND_MIX = 0.11;
const SPLASH_MIX = 1.20;
// ...and the splash runs through a LOWPASS while the ring runs through a narrow
// bandpass, so the same gain is not the same loudness: measured on this noise,
// the lowpass passes 2.16x what the bandpass does (rp-filter.mjs). Without this
// trim, mixing the splash up to where it belongs also made every tap two and a
// half times louder, which is not what "rebalance" is supposed to mean.
const SPLASH_TRIM = 0.46;
const OUTSIDE_HZ = 4200;            // one thin pane rolls the outside off gently

const BIN_S = 0.02;                 // impacts are gathered into 20 ms windows
const MAX_VOICES = 26;
// How many taps a listener can actually pick out of the roar. Past this point
// more drops make the texture denser, not the individual taps more numerous.
// Was 150, which is well past the point where separate impacts fuse: what it
// gives you is a machine-gun of transients, not rain. Past this the energy goes
// to the texture, which is what a sheet of rain actually is.
const TAPS_MAX_PER_S = 40;
const REF_ENERGY = 7.5e-5;          // a 2 mm drop at terminal velocity, in joules
// The acoustic energy the window takes in a downpour, MEASURED off the solver
// rather than calculated, and the difference matters: worked out by hand from
// the mean drop diameter it comes to 0.26, and the real figure is twenty-four
// times that. Impact energy goes as roughly the fourth power of diameter while
// the Marshall-Palmer spectrum has a long tail, so nearly all the energy is in
// the few biggest drops and the mean diameter says almost nothing about it.
// Everything is referred to this, so "full" means an actual downpour.
const REF_FLUX = 6.3;               // joules a second onto 1.2 m2 at 180 mm/h
// The arriving power is estimated over a fixed number of drops rather than a
// fixed stretch of time, and that is not a detail. Impact energy is dominated by
// the few biggest drops, so in drizzle — under two drops a second on the visible
// patch — a time-averaged estimate is zero almost always and enormous for an
// instant, and the sound comes out as silence with occasional bursts. Averaging
// over the last N drops instead stretches the window automatically when drops
// are rare (about 25 s in drizzle, under a second in a downpour), which is
// exactly the adaptivity a heavy-tailed process needs. The age limit is what
// lets it fall to nothing when the rain stops.
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
    // Live voices are tracked by when they are *scheduled* to end, not by their
    // onended callbacks. A callback only fires when the main thread is free, so
    // during a long frame or a GC pause a callback-counted budget stays full and
    // the engine goes silent exactly when the rain is heaviest. The scheduler
    // knows when each voice stops; ask it.
    this.busy = [];
    this.pending = [];
    this.binAt = 0;
    this.wetness = 0;
    // The measured acoustic power arriving on the whole window, in joules a
    // second. This is the one quantity the beds and the tap density are built
    // from; see _flush.
    this.flux = 0;
    this.recent = [];               // a rolling sample of real drops
    this.owed = 0;                  // fractional taps carried between bins
    this.flushAt = 0;
    this.meanGap = 0;               // this rain's own rhythm, in seconds
    this.lastArrival = 0;
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
    this.owed = 0;
    this.recent.length = 0;
    this.meanGap = 0;
    this.lastArrival = 0;
  }

  /** Called once a frame. Flushes one bin's worth of impacts. */
  update(now) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this._beds(t);
    if (now - this.binAt < BIN_S * 1000) return;
    this.binAt = now;
    // How much time a bin really covers, not how much it nominally covers. A
    // 20 ms bin polled once a frame at 60 Hz actually fires every 33 ms, so a
    // per-bin tap allowance quietly caps the rate at two thirds of what the
    // constant says. Measure the gap and size the allowance from it.
    const dt = this.flushAt ? Math.min(0.25, t - this.flushAt) : BIN_S;
    this.flushAt = t;
    this._flush(t, dt);
  }

  /**
   * The beds.
   *
   * Both of these follow one measured quantity — the acoustic power actually
   * arriving on the window — and not the rain slider. That matters, because
   * loudness does not follow how *many* drops fall, it follows how much energy
   * they bring, and those are very different curves. Drizzle puts 562 drops a
   * second on a big window and a downpour puts 24 000, only forty times more;
   * but the drizzle drops average 0.46 mm and the downpour's 1.28 mm, so the
   * energy ratio is nearer four thousand. A bed keyed to drop count is far too
   * loud in light rain, and that is the sheet of hiss that should not be there.
   *
   * Incoherent sources add in power, so amplitude is the square root of flux.
   * That is also the entire justification for using filtered noise for the
   * texture: it is not standing in for the taps, it *is* what several hundred
   * random taps a second sum to. Below that density the taps are voiced
   * individually and the texture is correspondingly near-silent — which is the
   * point. A sheet of sound has to be made of drops, not laid underneath them.
   */
  _beds(t) {
    // what is left once the drops being voiced individually are taken out
    const heardFlux = Math.min(this.flux, this.salientRate() * REF_ENERGY);
    const texture = Math.min(1, Math.sqrt(Math.max(0, this.flux - heardFlux) / REF_FLUX));
    const wash = Math.min(1, Math.sqrt(this.flux / REF_FLUX));
    const wet = Math.min(1, this.wetness * 1.6);
    this._ramp('outGain', this.outsideGain.gain, 0.16 * wash, 0.35);
    this._ramp('outTone', this.outsideTone.frequency, OUTSIDE_HZ * (1 - 0.35 * wash), 0.5);
    this._ramp('patGain', this.patterGain.gain, 0.20 * texture, 0.25);
    this._ramp('patTone', this.patterBand.frequency, PLATE_HZ * (1 - 0.30 * wet) * (1 - 0.15 * texture), 0.4);
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
   * How many taps a second stand out of the roar.
   *
   * Not a count of drops: a count of drops *worth hearing*. The arriving power
   * divided by the energy of one clearly audible drop is exactly that number,
   * and it falls out of the solver's own figures rather than a fitted curve.
   * Measured, it runs about 1 a second in drizzle, 17 in light rain, 33 in
   * rain, and saturates from heavy rain upward — which is the shape the ear
   * expects: distinct ticks when it is barely raining, a continuous sheet when
   * it is pouring, and no threshold anywhere in between.
   */
  salientRate() {
    return Math.min(TAPS_MAX_PER_S, this.flux / REF_ENERGY);
  }

  /**
   * One bin.
   *
   * Two jobs. First, measure: sum what landed on the visible patch, scale it to
   * the window, and follow it with a smoothing filter. That one number drives
   * the beds and the tap density, and it is why nothing here consults the rain
   * slider. An earlier version drew the tap count from the declared rate, which
   * meant a drop that demonstrably hit the glass made no sound whenever the
   * slider said it shouldn't have — the sound had stopped following the
   * simulation and started following a number beside it.
   *
   * Second, voice: pick that many drops, weighted by energy, because the ones
   * you pick out of rain are the loud ones. They are drawn from a rolling sample
   * of drops that really landed, so their sizes, speeds and landing conditions
   * are the simulation's rather than invented. At a downpour the window takes
   * 24 000 drops a second and 150 are voiced; the rest is energy, and energy is
   * all the texture ever needed from it.
   */
  _flush(t, dt = BIN_S) {
    const bin = this.pending;
    for (const ev of bin) { ev.at = t; this.recent.push(ev); }
    if (bin.length) {
      // The rain's own rhythm, tracked separately from the sample because the
      // sample gets pruned and a pruned sample cannot tell you its own interval.
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

    // The window sees the same rain over three hundred times the area.
    let energy = 0;
    for (const ev of this.recent) energy += ev.energy;
    if (!this.recent.length) { this.flux = 0; return; }
    const span = Math.max(BIN_S, t - this.recent[0].at + BIN_S);

    // A fixed-count window on its own can only fall as 1/t, so when the rain
    // stops the wash coasts for the whole length of the sample — ten seconds of
    // rain you can hear after rain you cannot see. Worse, pruning is not
    // even-handed: once all but one drop has aged out, the estimate is one big
    // drop over a short span, which is *larger* than the rain that produced it.
    //
    // What says the rain has eased is a gap that is long *for this rain*. A
    // second of quiet is ordinary in drizzle and unheard-of in a downpour, so
    // idle time is judged against the tracked interval above. Normal running
    // never touches this; stopping collapses it in about three intervals, at
    // any rate.
    //
    // Judged no finer than a bin, too. Idle time is only observable at the rate
    // bins are flushed, so in a downpour — drops nine milliseconds apart, bins
    // thirty — every bin looks idle by several intervals and the wash gets held
    // down by a factor of hundreds. Compare against whichever is coarser.
    const scale = Math.max(this.meanGap, dt);
    const idle = t - this.lastArrival;
    const eased = scale > 0 ? Math.exp(-Math.max(0, idle - 3 * scale) / (3 * scale)) : 1;
    this.flux = (energy / span) * this.multiplier * eased;

    // Fractional taps are carried rather than rounded away: at one tap a second
    // a bin is owed a fiftieth of a tap, and rounding that off is silence.
    const most = Math.max(1, Math.ceil(TAPS_MAX_PER_S * dt));
    this.owed = Math.min(most, this.owed + this.salientRate() * dt);
    const budget = Math.max(0, MAX_VOICES - this.voices);
    const n = Math.min(Math.floor(this.owed), most, budget);
    if (n <= 0) return;
    this.owed -= n;

    // Weighted by the SQUARE ROOT of energy, not by energy.
    //
    // Weighting by energy outright makes almost every voiced tap a big drop, so
    // they all arrive at much the same prominence — and a stream of impacts at
    // one level, however irregularly spaced, is a percussion instrument rather
    // than rain. It also double-counts: how loud a drop sounds is already
    // decided by its energy in tapParams, so letting energy pick the drop too
    // applies it twice. Real rain is mostly faint impacts with the occasional
    // prominent one, which is what a gentler weighting gives.
    let total = 0;
    for (const ev of this.recent) total += Math.sqrt(ev.energy);
    for (let i = 0; i < n; i += 1) {
      let pick = Math.random() * total;
      let ev = this.recent[this.recent.length - 1];
      for (const cand of this.recent) { pick -= Math.sqrt(cand.energy); if (pick <= 0) { ev = cand; break; } }
      // spread across the bin: they did not arrive at the same instant, and
      // stacked onsets read as one loud click rather than as several drops
      this._tap(t + (i + Math.random()) * (dt / most), ev, Math.random());
      this.heard += 1;
    }
    this.clustered += Math.max(0, this.flux / REF_ENERGY - n / dt) * dt;
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
  /**
   * Everything about how one drop sounds, as numbers — separated from the graph
   * that plays them so the model can be rendered offline and measured exactly.
   * A live AudioContext with beds running is a poor instrument for asking
   * whether wet glass is duller than dry glass.
   */
  tapParams(ev) {
    const e = Math.min(6, ev.energy / REF_ENERGY);
    // A gate here has to sit far below "quiet", not near it. At 0.02 it
    // silenced every drop drizzle produces, so light rain was a sheet of hiss
    // with no drops in it at all. Selection is already weighted by energy; let
    // the loudness curve do the rest, and keep this only to skip work that
    // would be inaudible anyway.
    if (e < 0.001) return null;

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
    // Widened from +/-18% to +/-35%. Rain is not a sequence of the same event:
    // where a drop lands on a pane decides which of its modes answer, and a
    // narrow spread makes a stream of taps read as one repeated sound.
    const jitter = 0.65 + Math.random() * 0.7;
    // Dry glass rings near the plate's own frequency. A film mass-loads and
    // damps the contact, so the answer drops well down and loses its edge.
    const freq = PLATE_HZ * jitter * (1 - 0.30 * Math.min(1, e / 3)) * (1 - 0.62 * wet);
    const q = PLATE_Q * (1 - 0.5 * wet);

    // A bandpass fed with noise passes more the lower and the wider it is set,
    // so without this, making a tap duller quietly makes it louder. Normalising
    // it means `loud` is the only thing setting loudness, and darkness is only
    // darkness. The exponents are measured, not derived (rp-filter.mjs, on this
    // exact noise through this exact filter): level goes as f^-0.03 and Q^-0.39.
    // An idealised bandpass on white noise gives -0.5 and -0.5, and correcting
    // by that overshoots the frequency term badly. Re-measure if _build's
    // buffer changes — or if PLATE_Q or PLATE_HZ move, which they have.
    // Re-measured at 1150 Hz and Q 2.2 they are -0.03 and -0.39: at a low centre
    // frequency the band sits under the noise's own corner, so the frequency
    // term all but vanishes and only the width still matters.
    const shape = Math.pow(freq / PLATE_HZ, 0.03) * Math.pow(q / PLATE_Q, 0.39);

    return {
      wet,
      peak: loud * shape * RING_MIX,
      freq,
      q,
      // Milliseconds, not tens of them. Sustain is the strongest single cue
      // that something was *struck* rather than *splashed*.
      decay: (0.006 + 0.016 * Math.min(1, e / 2)) * (1 - 0.45 * wet),
      // A second, higher band, kept deliberately small. At this Q the bands are
      // broad enough to overlap; its job is to stop the first reading as a
      // pitch, not to add a partial of its own.
      second: freq * 2.1,
      secondPeak: loud * shape * SECOND_MIX * (1 - 0.6 * wet),

      // The splash, and it carries the tap rather than garnishing it. This is
      // what makes a drop sound like water: broadband, soft-edged, gone in under
      // ten milliseconds. It was a whisper at 0.22 beneath a ringing plate,
      // which is backwards — the plate is the garnish.
      //
      // It gets LOUDER on wet glass, the one term here that moves that way: a
      // drop landing in standing water makes more splash and less pane. That is
      // why wet glass should read as duller and *thicker*, not merely quieter.
      contactPeak: loud * shape * SPLASH_MIX * SPLASH_TRIM * (0.85 + 0.5 * wet),
      contactHz: 1900 * (1 - 0.35 * wet),
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

    // Two resonances and a contact. The resonances are narrow bands of noise
    // rather than pure tones: a struck pane rings, but it does not ring like a
    // tuning fork, and forty pure tones a second would be a music box.
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
    if (pan) pan.pan.value = ((atX === undefined ? ev.x : atX) - 0.5) * 0.5;   // a pane in front of you, not an arcade

    src.connect(ring).connect(gRing);
    src.connect(two).connect(gTwo);
    src.connect(contact).connect(gContact);
    const out = pan || this.master;
    gRing.connect(out);
    gTwo.connect(out);
    gContact.connect(out);
    if (pan) pan.connect(this.master);

    // Every envelope decays to a fraction of its own peak, never to a fixed
    // floor. An absolute 0.0001 is nothing under a loud tap and most of a quiet
    // one, so quiet taps would never decay at all.
    //
    // The attack was 0.8 ms, which on a broadband source is a click in its own
    // right. A struck plate takes a few milliseconds to reach full amplitude
    // and none of the percussiveness is lost by saying so.
    const a = 0.0025;
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
    // onended only tears the graph down; it is not what counts the voice.
    src.onended = () => {
      src.disconnect(); ring.disconnect(); two.disconnect(); contact.disconnect();
      gRing.disconnect(); gTwo.disconnect(); gContact.disconnect();
      if (pan) pan.disconnect();
    };
  }
}
