// recorder.js — records chord *events* (not audio) and replays them through the scheduler.
// Events store the degree id, so a recording transposes when the key changes.

const KEY = 'chordpad.recording.v1';

export class Recorder {
  constructor() {
    this.events = [];       // { id, label, name, start, duration, playback }
    this.state = 'idle';    // idle | recording | playing
    this.recordStart = 0;
    this.open = new Map();  // padId -> event being recorded
    this.onChange = () => {};
    this.load();
  }

  get isEmpty() { return this.events.length === 0; }

  get length() {
    if (this.isEmpty) return 0;
    return this.events.reduce((max, e) => Math.max(max, e.start + e.duration), 0);
  }

  startRecording(now) {
    this.events = [];
    this.open.clear();
    this.recordStart = now;
    this.state = 'recording';
    this.onChange();
  }

  stopRecording(now) {
    for (const [, event] of this.open) {
      event.duration = Math.max(0.2, now - this.recordStart - event.start);
    }
    this.open.clear();
    this.state = 'idle';
    this.events.sort((a, b) => a.start - b.start);
    this.save();
    this.onChange();
  }

  noteOn(padId, chord, playback, now) {
    if (this.state !== 'recording') return;
    const event = {
      id: padId,
      label: chord.label,
      name: chord.name,
      start: Math.max(0, now - this.recordStart),
      duration: 0.5,
      playback,
    };
    this.events.push(event);
    this.open.set(padId, event);
    this.onChange();
  }

  noteOff(padId, now) {
    if (this.state !== 'recording') return;
    const event = this.open.get(padId);
    if (!event) return;
    event.duration = Math.max(0.2, now - this.recordStart - event.start);
    this.open.delete(padId);
    this.onChange();
  }

  /** Replace the recording with a progression, one chord per measure. */
  loadProgression(ids, chords, measureDur) {
    this.events = ids.map((id, i) => ({
      id,
      label: chords[i] ? chords[i].label : id,
      name: chords[i] ? chords[i].name : id,
      start: i * measureDur,
      duration: measureDur * 0.98,
      playback: null,
    }));
    this.state = 'idle';
    this.save();
    this.onChange();
  }

  clear() {
    this.events = [];
    this.open.clear();
    this.state = 'idle';
    this.save();
    this.onChange();
  }

  /** Refresh cached chord names after a key/mode change. */
  relabel(resolve) {
    for (const e of this.events) {
      const chord = resolve(e.id);
      if (chord) { e.label = chord.label; e.name = chord.name; }
    }
    this.save();
    this.onChange();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.events)); } catch (_) { /* noop */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.events = parsed;
      }
    } catch (_) { this.events = []; }
  }
}
