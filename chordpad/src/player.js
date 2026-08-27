// player.js — turns a chord + settings into scheduled Web Audio notes.
// A single look-ahead ticker drives every sounding chord and recording playback.

import { arpeggioOrder } from './theory.js';
import { meterById, rhythmById, subdivisionById } from './patterns.js';

const LOOKAHEAD = 0.18;   // seconds of audio scheduled in advance
// Ceiling on how many notes a sustaining instrument may hold at once. A cycle of
// the densest figure is nearly thirty notes, which on an organ or a string pad
// is a hundred-odd oscillators and starts to crackle on a small device.
const MAX_SUSTAINED = 18;
// A bass note stands alone against three or four chord tones, so at equal
// velocity the chord simply buries it.
const BASS_VELOCITY = 1.3;
const TICK_MS = 25;

export class Scheduler {
  constructor(engine) {
    this.engine = engine;
    this.players = new Set();
    this.tasks = [];        // one-off callbacks fired near an audio time
    this.timer = null;
    this.origin = 0;        // transport zero: keeps every pattern on a common grid
  }

  resetOrigin(time) {
    this.origin = time ?? this.engine.currentTime;
  }

  add(player) {
    this.players.add(player);
    this._ensureRunning();
    player.tick(this.engine.currentTime);
  }

  /** Run `fn` once, as close to audio time `time` as the ticker allows. */
  at(time, fn) {
    this.tasks.push({ time, fn });
    this._ensureRunning();
  }

  clearTasks() {
    this.tasks.length = 0;
  }

  /** Hard-stop every running player and drop pending tasks. */
  stopAll(time) {
    const t = time ?? this.engine.currentTime;
    for (const p of [...this.players]) p.stop(t);
    this.players.clear();
    this.clearTasks();
  }

  _ensureRunning() {
    if (this.timer == null) this.timer = setInterval(() => this._tick(), TICK_MS);
  }

  _tick() {
    const now = this.engine.currentTime;
    for (const p of [...this.players]) {
      p.tick(now);
      if (p.finished) this.players.delete(p);
    }
    if (this.tasks.length) {
      const due = this.tasks.filter((t) => t.time <= now + 0.02);
      if (due.length) {
        this.tasks = this.tasks.filter((t) => t.time > now + 0.02);
        for (const t of due) t.fn(now);
      }
    }
    if (!this.players.size && !this.tasks.length) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class ChordPlayer {
  /**
   * @param {object} opts
   *   voices  – midi notes of the chord voicing
   *   bass    – midi note or null
   *   sequence – an explicit figure: a list of steps, each one note or a chord
   *   stepUnit – 'beat' or 'eighth' to step on the meter instead of the
   *              arpeggio subdivision
   *   settings – { mode, subdivision, rhythm, meter, bpm, trigger }
   *   startTime – audio time of the first attack
   *   origin  – transport zero for grid alignment
   */
  constructor(engine, opts) {
    this.engine = engine;
    this.voices = opts.voices;
    this.bass = opts.bass;
    this.s = opts.settings;
    this.start = opts.startTime;
    this.origin = opts.origin ?? opts.startTime;
    this.finished = false;
    this.releaseAt = null;
    this.held = [];
    this.nextIndex = 0;

    const meter = meterById(this.s.meter);
    this.beatDur = 60 / this.s.bpm * (4 / meter.beatUnit);
    this.measureDur = this.beatDur * meter.beats;
    this.rhythm = rhythmById(this.s.rhythm);
    this.subDur = subdivisionById(this.s.subdivision).beats * (60 / this.s.bpm);
    this.isArp = this.s.mode !== 'block';
    this.sequence = opts.sequence || null;
    // Every step is a list of notes, so a step can be a single note or a whole chord.
    const steps = this.sequence || arpeggioOrder(this.voices, this.s.mode);
    this.arp = this.isArp ? steps.map((step) => (Array.isArray(step) ? step : [step])) : null;
    this.stepDur = opts.stepUnit === 'beat' ? this.beatDur
      : opts.stepUnit === 'eighth' ? 30 / this.s.bpm
      : this.subDur;
    this.cycleNotes = this.arp ? this.arp.reduce((n, step) => n + step.length, 0) : 0;
    // A supplied figure already starts on the bass note; a second one would double it.
    if (this.sequence) this.bass = null;

    // Trigger mode lets go on its own after one measure.
    if (this.s.trigger === 'trigger') this.releaseAt = this.start + this.measureDur * 0.98;

    this.nextTime = this.start;
    this.playedCount = 0;
    // A chord arriving while the accompaniment is already flowing carries the
    // figure on from where it had got to, instead of restarting it — that is
    // what stops each chord change sounding like a stop and a restart. A chord
    // struck into silence starts the figure at its beginning, so a single tap
    // still opens on the root and is recognisable.
    this.gridIndex = this.isArp && opts.phaseLock
      ? Math.round((this.start - this.origin) / this.stepDur)
      : 0;
    this.strum = engine.instrumentId === 'guitar' ? 0.022 : 0.008;
  }

  /** Attack times when a rhythm pattern is active, aligned to the shared grid. */
  _patternTimeAfter(time) {
    const steps = this.rhythm.steps;
    const measureIndex = Math.floor((time - this.origin) / this.measureDur);
    for (let m = measureIndex; m < measureIndex + 3; m += 1) {
      const base = this.origin + m * this.measureDur;
      for (const step of steps) {
        const t = base + step.beat * this.beatDur;
        if (t > time + 1e-4) return { time: t, step };
      }
    }
    return { time: time + this.measureDur, step: steps[0] };
  }

  _play(midi, time, velocity) {
    const v = this.engine.noteOn(midi, time, velocity);
    if (v) this.held.push(v);
  }

  _attack(time, type, velocity) {
    if (type !== 'chord' && this.bass != null) this._play(this.bass, time, velocity * BASS_VELOCITY);
    if (type === 'bass') return;
    this.voices.forEach((midi, i) => this._play(midi, time + i * this.strum, velocity));
  }

  tick(now) {
    if (this.finished) return;
    const horizon = now + LOOKAHEAD;

    if (this.releaseAt != null && this.releaseAt <= now) {
      this._finish(this.releaseAt);
      return;
    }

    while (this.nextTime <= horizon) {
      if (this.releaseAt != null && this.nextTime >= this.releaseAt) break;

      if (!this.isArp) {
        if (this.rhythm.free) {
          this._attack(this.nextTime, 'all', 1);
          // Free + block is one sustained attack; nothing more to schedule.
          this.nextTime = Infinity;
          break;
        }
        const isFirst = this.nextIndex === 0;
        if (isFirst) {
          this._attack(this.nextTime, 'all', 1);
        } else {
          const { step } = this.pending;
          this._attack(this.nextTime, step.type, step.velocity);
        }
        this.nextIndex += 1;
        let pending = this._patternTimeAfter(this.nextTime);
        // Pressing just before a grid step would flam; let the grid step win.
        const flamGuard = Math.min(0.12, this.beatDur * 0.45);
        while (pending.time - this.nextTime < flamGuard) pending = this._patternTimeAfter(pending.time);
        this.pending = pending;
        this.nextTime = pending.time;
      } else {
        const len = this.arp.length;
        const idx = ((this.gridIndex % len) + len) % len;
        const step = this.arp[idx];
        if (idx === 0 && this.bass != null) this._play(this.bass, this.nextTime, BASS_VELOCITY);
        // The downbeat of the figure is accented every time round, not just once,
        // and a step that carries the bass keeps its weight.
        const velocity = idx === 0 ? 1 : 0.85;
        step.forEach((midi, i) => this._play(midi, this.nextTime + i * this.strum, velocity));
        const played = this.nextTime;
        this.playedCount += 1;
        this.gridIndex += 1;
        let next = this.origin + this.gridIndex * this.stepDur;
        // The first hit is immediate wherever the press landed; from there on
        // keep to the grid, skipping any step that has already gone past.
        while (next < played + this.stepDur * 0.4) {
          this.gridIndex += 1;
          next = this.origin + this.gridIndex * this.stepDur;
        }
        this.nextTime = next;
      }
    }

    // Sustaining instruments would otherwise ring forever under an arpeggio.
    if (this.isArp && this.engine.sustaining) {
      const cutoff = now - this.stepDur * 1.6;
      const keep = Math.min(this.cycleNotes + 1, MAX_SUSTAINED);
      while (this.held.length > keep && this.held[0]) {
        const v = this.held.shift();
        v.release(Math.max(cutoff, now));
      }
    }
  }

  /** Release on user lift (Hold mode) or when a recorded event ends. */
  release(time) {
    const t = time ?? this.engine.currentTime;
    if (this.s.trigger === 'trigger') return; // trigger mode times itself out
    // A quick tap on a decaying instrument should still ring rather than click off.
    const minLength = this.engine.sustaining ? 0.04 : 0.45;
    this.releaseAt = Math.max(t, this.start + minLength);
    if (this.releaseAt <= this.engine.currentTime + 0.02) this._finish(this.releaseAt);
  }

  /** Hard stop, used by Stop / panic. */
  stop(time) {
    this._finish(time ?? this.engine.currentTime);
  }

  _finish(time) {
    if (this.finished) return;
    this.finished = true;
    for (const v of this.held) v.release(time);
    this.held.length = 0;
  }
}
