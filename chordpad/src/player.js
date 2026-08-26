// player.js — turns a chord + settings into scheduled Web Audio notes.
// A single look-ahead ticker drives every sounding chord and recording playback.

import { arpeggioOrder } from './theory.js';
import { meterById, rhythmById, subdivisionById } from './patterns.js';

const LOOKAHEAD = 0.18;   // seconds of audio scheduled in advance
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
    this.arp = this.isArp ? arpeggioOrder(this.voices, this.s.mode) : null;

    // Trigger mode lets go on its own after one measure.
    if (this.s.trigger === 'trigger') this.releaseAt = this.start + this.measureDur * 0.98;

    this.nextTime = this.start;
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
    if (type !== 'chord' && this.bass != null) this._play(this.bass, time, velocity * 0.9);
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
        const note = this.arp[this.nextIndex % this.arp.length];
        if (this.nextIndex % this.arp.length === 0 && this.bass != null) {
          this._play(this.bass, this.nextTime, 0.88);
        }
        this._play(note, this.nextTime, this.nextIndex === 0 ? 1 : 0.82);
        this.nextIndex += 1;
        this.nextTime += this.subDur;
      }
    }

    // Sustaining instruments would otherwise ring forever under an arpeggio.
    if (this.isArp && this.engine.sustaining) {
      const cutoff = now - this.subDur * 1.6;
      while (this.held.length > this.arp.length + 1 && this.held[0]) {
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
