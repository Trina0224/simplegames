// app.js — UI wiring: pads, settings drawer, transport, recording playback.

import { AudioEngine, INSTRUMENTS } from './audio.js';
import { Scheduler, ChordPlayer } from './player.js';
import { Recorder } from './recorder.js';
import { DEFAULTS, loadSettings, saveSettings } from './settings.js';
import {
  METERS, PLAYBACK_MODES, PROGRESSIONS, SUBDIVISIONS,
  meterById, rhythmById, rhythmsForMeter,
} from './patterns.js';
import {
  KEYS, PRIMARY_DEGREES, chordFromId, extendedDefsFor,
  notePc, parseNote, prettyKey, resolveChord, voiceChord, bassNote,
  brokenChordNotes, columnChordSteps,
} from './theory.js';

const state = loadSettings();
const engine = new AudioEngine();
const scheduler = new Scheduler(engine);
const recorder = new Recorder();

const el = {
  pads: document.getElementById('pads'),
  extRow: document.getElementById('extRow'),
  status: document.getElementById('status'),
  hint: document.getElementById('hint'),
  sequence: document.getElementById('sequence'),
  menuBtn: document.getElementById('menuBtn'),
  closeBtn: document.getElementById('closeBtn'),
  drawer: document.getElementById('drawer'),
  drawerBody: document.getElementById('drawerBody'),
  scrim: document.getElementById('scrim'),
  resetBtn: document.getElementById('resetBtn'),
  recBtn: document.getElementById('recBtn'),
  playBtn: document.getElementById('playBtn'),
  stopBtn: document.getElementById('stopBtn'),
  loopBtn: document.getElementById('loopBtn'),
  clearBtn: document.getElementById('clearBtn'),
};

const activePlayers = new Map();  // padId -> ChordPlayer
const padPointers = new Map();    // padId -> pointerId
const padElements = new Map();    // padId -> button
let prevVoicing = null;
let prevBass = null;
let playback = null;              // { origin, index, timers[] }
let playbackTimer = null;

// ---------------------------------------------------------------- helpers

function measureDuration() {
  const meter = meterById(state.meter);
  return (60 / state.bpm) * (4 / meter.beatUnit) * meter.beats;
}

function playSettings(overrides = {}) {
  return {
    mode: state.playback,
    subdivision: state.subdivision,
    rhythm: state.rhythm,
    meter: state.meter,
    bpm: state.bpm,
    trigger: state.trigger,
    ...overrides,
  };
}

function persist() {
  saveSettings(state);
}

function updateStatus() {
  const inst = INSTRUMENTS.find((i) => i.id === state.instrument);
  const tonality = state.mode === 'major' ? 'Major' : 'Minor';
  el.status.textContent = `${prettyKey(state.key)} ${tonality} · ${inst.name} · ${state.bpm} BPM`;
}

// ---------------------------------------------------------------- sound

function startChord(chord, time, settings) {
  const voices = voiceChord(chord, { voicing: state.voicing, previous: prevVoicing });
  const bass = bassNote(chord, { bass: state.bass, previous: prevBass });
  prevVoicing = voices;
  if (bass != null) prevBass = bass;
  let sequence = null;
  if (settings.mode === 'spread') sequence = brokenChordNotes(chord, bass);
  else if (settings.mode === 'columns') {
    sequence = columnChordSteps(chord, bass, meterById(settings.meter).beats);
  }
  const player = new ChordPlayer(engine, {
    voices,
    bass,
    sequence,
    beatLocked: settings.mode === 'columns',
    settings,
    startTime: time,
    origin: scheduler.origin,
  });
  scheduler.add(player);
  return player;
}

async function ensureAudio() {
  if (engine.ready) return true;
  const ok = await engine.start();
  if (ok) {
    scheduler.resetOrigin(engine.currentTime);
    engine.setInstrument(state.instrument);
    engine.setVolume(state.volume);
    el.hint.hidden = true;
  }
  return ok;
}

async function pressPad(padId) {
  if (!(await ensureAudio())) return;
  releasePad(padId, true);
  const chord = chordFromId(padId, state.key, state.mode);
  if (!chord) return;
  const player = startChord(chord, engine.currentTime + 0.004, playSettings());
  activePlayers.set(padId, player);
  setPadOn(padId, true);
  recorder.noteOn(padId, chord, state.playback, engine.currentTime);
}

function releasePad(padId, silentForRecorder = false) {
  const player = activePlayers.get(padId);
  if (player) {
    player.release(engine.currentTime);
    activePlayers.delete(padId);
  }
  setPadOn(padId, false);
  if (!silentForRecorder) recorder.noteOff(padId, engine.currentTime);
}

function setPadOn(padId, on) {
  const node = padElements.get(padId);
  if (node) node.classList.toggle('on', on);
}

function panic() {
  for (const [id, player] of activePlayers) {
    player.stop(engine.currentTime);
    setPadOn(id, false);
  }
  activePlayers.clear();
  padPointers.clear();
  scheduler.stopAll(engine.currentTime);
  engine.allOff(engine.currentTime);
}

// ---------------------------------------------------------------- pads

function makePad(chord, extra = false) {
  const btn = document.createElement('button');
  btn.className = 'pad';
  btn.type = 'button';
  btn.dataset.padId = chord.id;
  btn.setAttribute('aria-label', `${chord.label} ${chord.name}`);
  const degree = document.createElement('span');
  degree.className = 'degree';
  degree.textContent = chord.label;
  const name = document.createElement('span');
  name.className = 'chord';
  name.textContent = chord.name;
  btn.append(degree, name);
  if (extra) btn.classList.add('ext');
  bindPad(btn, chord.id);
  padElements.set(chord.id, btn);
  return btn;
}

function bindPad(btn, padId) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // A lost pointerup must never leave a pad stuck: the new touch takes over.
    if (padPointers.has(padId)) releasePad(padId);
    padPointers.set(padId, e.pointerId);
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* mouse fallback */ }
    pressPad(padId);
  });
  const end = (e) => {
    if (padPointers.get(padId) !== e.pointerId) return;
    padPointers.delete(padId);
    releasePad(padId);
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('lostpointercapture', end);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function renderPads() {
  panic();
  padElements.clear();
  el.pads.replaceChildren();
  el.extRow.replaceChildren();

  for (const def of PRIMARY_DEGREES[state.mode]) {
    el.pads.append(makePad(resolveChord(def, state.key, state.mode)));
  }

  const available = extendedDefsFor(state.mode);
  for (const id of state.extended) {
    const def = available.find((d) => d.id === id);
    if (def) el.extRow.append(makePad(resolveChord(def, state.key, state.mode), true));
  }
  updateStatus();
}

// ---------------------------------------------------------------- sequence view

function renderSequence() {
  el.sequence.replaceChildren();
  if (recorder.isEmpty) {
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = recorder.state === 'recording'
      ? 'Recording — play some chords'
      : 'No sequence yet — press Record, or load a progression';
    el.sequence.append(span);
    return;
  }
  recorder.events.forEach((event, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.index = String(i);
    chip.textContent = `${event.label} · ${event.name}`;
    el.sequence.append(chip);
  });
}

function highlightChip(index) {
  for (const chip of el.sequence.querySelectorAll('.chip')) {
    chip.classList.toggle('now', Number(chip.dataset.index) === index);
  }
}

function updateTransport() {
  el.recBtn.classList.toggle('armed', recorder.state === 'recording');
  el.playBtn.classList.toggle('active', !!playback);
  el.loopBtn.classList.toggle('active', state.loop);
  el.playBtn.disabled = recorder.isEmpty;
  el.clearBtn.disabled = recorder.isEmpty;
}

recorder.onChange = () => { renderSequence(); updateTransport(); };

// ---------------------------------------------------------------- transport

async function toggleRecord() {
  if (!(await ensureAudio())) return;
  if (recorder.state === 'recording') {
    recorder.stopRecording(engine.currentTime);
  } else {
    stopPlayback();
    scheduler.resetOrigin(engine.currentTime);
    recorder.startRecording(engine.currentTime);
  }
  updateTransport();
}

async function startPlayback() {
  if (recorder.isEmpty) return;
  if (!(await ensureAudio())) return;
  if (recorder.state === 'recording') recorder.stopRecording(engine.currentTime);
  stopPlayback();
  const origin = engine.currentTime + 0.15;
  scheduler.resetOrigin(origin);
  playback = { origin, index: 0, timers: [], players: [] };
  recorder.state = 'playing';
  playbackTimer = setInterval(tickPlayback, 30);
  tickPlayback();
  updateTransport();
}

function loopLength() {
  const measure = measureDuration();
  const raw = recorder.length + 0.05;
  if (!rhythmById(state.rhythm).free) {
    // With a rhythm pattern running, looping on a bar line is what sounds right.
    return Math.max(measure, Math.ceil(raw / measure) * measure);
  }
  // Free timing loops as tightly as it was played, unless it all but fills whole bars.
  const bars = Math.round(raw / measure);
  const snapped = bars * measure;
  return bars > 0 && Math.abs(raw - snapped) < measure * 0.12 ? snapped : Math.max(raw, 0.4);
}

function tickPlayback() {
  if (!playback) return;
  const now = engine.currentTime;
  const horizon = now + 0.25;
  const events = recorder.events;

  while (playback.index < events.length) {
    const event = events[playback.index];
    const at = playback.origin + event.start;
    if (at > horizon) break;
    const chord = chordFromId(event.id, state.key, state.mode);
    if (chord) {
      const settings = playSettings({ mode: event.playback || state.playback, trigger: 'hold' });
      const player = startChord(chord, at, settings);
      playback.players.push(player);
      const endAt = at + event.duration;
      scheduler.at(endAt, () => player.release(endAt));
      const index = playback.index;
      const delay = Math.max(0, (at - engine.currentTime) * 1000);
      playback.timers.push(setTimeout(() => {
        highlightChip(index);
        const node = padElements.get(event.id);
        if (node) {
          node.classList.add('playing');
          setTimeout(() => node.classList.remove('playing'), Math.max(120, event.duration * 1000));
        }
      }, delay));
    }
    playback.index += 1;
  }

  if (playback.index >= events.length) {
    const end = playback.origin + loopLength();
    if (now >= end - 0.05) {
      if (state.loop) {
        playback.origin = end;
        playback.index = 0;
      } else if (now >= playback.origin + recorder.length + 0.15) {
        stopPlayback();
      }
    }
  }
}

function stopPlayback() {
  if (playbackTimer != null) { clearInterval(playbackTimer); playbackTimer = null; }
  if (playback) {
    for (const t of playback.timers) clearTimeout(t);
    for (const p of playback.players) p.stop(engine.currentTime);
    playback = null;
  }
  scheduler.clearTasks();
  for (const node of padElements.values()) node.classList.remove('playing');
  highlightChip(-1);
  if (recorder.state === 'playing') recorder.state = 'idle';
  updateTransport();
}

function stopAll() {
  stopPlayback();
  if (recorder.state === 'recording') recorder.stopRecording(engine.currentTime);
  panic();
  updateTransport();
}

// ---------------------------------------------------------------- settings drawer

function openDrawer(open) {
  el.drawer.classList.toggle('open', open);
  el.drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  el.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  el.scrim.hidden = !open;
  if (open) buildDrawer();
}

function field(labelText, valueText) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('div');
  label.className = 'field-label';
  const name = document.createElement('span');
  name.textContent = labelText;
  label.append(name);
  if (valueText != null) {
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = valueText;
    label.append(value);
    wrap.valueNode = value;
  }
  wrap.append(label);
  return wrap;
}

function segmented(labelText, options, current, onPick, className = 'seg') {
  const wrap = field(labelText);
  const row = document.createElement('div');
  row.className = className;
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.name;
    btn.classList.toggle('sel', opt.id === current);
    btn.addEventListener('click', () => onPick(opt.id));
    row.append(btn);
  }
  wrap.append(row);
  return wrap;
}

function slider(labelText, { min, max, step, value, format, onInput }) {
  const wrap = field(labelText, format(value));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    wrap.valueNode.textContent = format(v);
    onInput(v);
  });
  wrap.append(input);
  return wrap;
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = text;
  return p;
}

function change(patch, { rebuildPads = false, rebuildDrawer = false } = {}) {
  Object.assign(state, patch);
  persist();
  if (rebuildPads) renderPads(); else updateStatus();
  if (rebuildDrawer) buildDrawer();
  updateTransport();
}

function nearestKey(key, mode) {
  const list = KEYS[mode];
  if (list.includes(key)) return key;
  const pc = notePc(parseNote(key));
  return list.find((k) => notePc(parseNote(k)) === pc) || list[0];
}

function buildDrawer() {
  const body = el.drawerBody;
  body.replaceChildren();

  // Key
  const keyField = field('Key');
  const select = document.createElement('select');
  for (const k of KEYS[state.mode]) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = prettyKey(k);
    opt.selected = k === state.key;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    change({ key: select.value }, { rebuildPads: true });
    recorder.relabel((id) => chordFromId(id, state.key, state.mode));
  });
  keyField.append(select);
  body.append(keyField);

  // Tonality
  body.append(segmented('Tonality', [{ id: 'major', name: 'Major' }, { id: 'minor', name: 'Minor' }], state.mode, (mode) => {
    const key = nearestKey(state.key, mode);
    change({ mode, key }, { rebuildPads: true, rebuildDrawer: true });
    recorder.relabel((id) => chordFromId(id, state.key, state.mode));
  }));

  // Instrument
  body.append(segmented('Instrument', INSTRUMENTS, state.instrument, (instrument) => {
    engine.setInstrument(instrument);
    change({ instrument }, { rebuildDrawer: true });
  }));

  // Tempo
  body.append(slider('Tempo', {
    min: 40, max: 200, step: 1, value: state.bpm,
    format: (v) => `${v} BPM`,
    onInput: (bpm) => { state.bpm = bpm; persist(); updateStatus(); scheduler.resetOrigin(engine.currentTime); },
  }));

  // Meter
  body.append(segmented('Time signature', METERS, state.meter, (meter) => {
    const allowed = rhythmsForMeter(meter);
    const rhythm = allowed.some((r) => r.id === state.rhythm) ? state.rhythm : 'free';
    scheduler.resetOrigin(engine.currentTime);
    change({ meter, rhythm }, { rebuildDrawer: true });
  }));

  // Volume
  body.append(slider('Master volume', {
    min: 0, max: 100, step: 1, value: Math.round(state.volume * 100),
    format: (v) => `${v}%`,
    onInput: (v) => { state.volume = v / 100; engine.setVolume(state.volume); persist(); },
  }));

  // Playback mode
  body.append(segmented('Chord playback', PLAYBACK_MODES, state.playback, (playback_) => {
    change({ playback: playback_ }, { rebuildDrawer: true });
  }));

  // Subdivision
  body.append(segmented('Arpeggio speed', SUBDIVISIONS, state.subdivision, (subdivision) => {
    change({ subdivision }, { rebuildDrawer: true });
  }));

  // Voicing
  body.append(segmented('Voicing', [
    { id: 'close', name: 'Close' }, { id: 'open', name: 'Open / Wide' }, { id: 'auto', name: 'Auto' },
  ], state.voicing, (voicing) => {
    prevVoicing = null;
    change({ voicing }, { rebuildDrawer: true });
  }));

  // Bass
  body.append(segmented('Bass note', [
    { id: 'root', name: 'Root' }, { id: 'auto', name: 'Auto' }, { id: 'off', name: 'Off' },
  ], state.bass, (bass) => change({ bass }, { rebuildDrawer: true })));

  // Trigger / Hold
  const triggerField = segmented('Pad behaviour', [
    { id: 'hold', name: 'Hold' }, { id: 'trigger', name: 'Trigger' },
  ], state.trigger, (trigger) => change({ trigger }, { rebuildDrawer: true }));
  triggerField.append(note('Hold sounds while your finger stays on the pad. Trigger plays one measure per tap.'));
  body.append(triggerField);

  // Rhythm
  const rhythmField = segmented('Rhythm', rhythmsForMeter(state.meter), state.rhythm, (rhythm) => {
    scheduler.resetOrigin(engine.currentTime);
    change({ rhythm }, { rebuildDrawer: true });
  });
  rhythmField.append(note(rhythmById(state.rhythm).free
    ? 'Free: you control the timing. Patterns follow the tempo and time signature.'
    : 'The pattern repeats while a pad is held.'));
  body.append(rhythmField);

  // Extended pads
  const extField = field('Extra chord pads', `${state.extended.length}/8`);
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const def of extendedDefsFor(state.mode)) {
    const chord = resolveChord(def, state.key, state.mode);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${def.label} · ${chord.name}`;
    const on = state.extended.includes(def.id);
    btn.classList.toggle('sel', on);
    btn.addEventListener('click', () => {
      const next = on
        ? state.extended.filter((id) => id !== def.id)
        : [...state.extended, def.id].slice(0, 8);
      change({ extended: next }, { rebuildPads: true, rebuildDrawer: true });
    });
    chips.append(btn);
  }
  extField.append(chips);
  extField.append(note('Up to 8 extra pads appear in the row under the main chords.'));
  body.append(extField);

  // Progressions
  const progField = field('Progression presets');
  const list = document.createElement('div');
  list.className = 'chips';
  for (const prog of PROGRESSIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = prog.name;
    btn.addEventListener('click', () => {
      const ids = prog[state.mode];
      const chords = ids.map((id) => chordFromId(id, state.key, state.mode));
      recorder.loadProgression(ids, chords, measureDuration());
      openDrawer(false);
    });
    list.append(btn);
  }
  progField.append(list);
  progField.append(note('Presets are stored as scale degrees, so they follow the key you choose. Press Play to hear one, then record your own on top.'));
  body.append(progField);
}

// ---------------------------------------------------------------- events

el.menuBtn.addEventListener('click', () => openDrawer(!el.drawer.classList.contains('open')));
el.closeBtn.addEventListener('click', () => openDrawer(false));
el.scrim.addEventListener('click', () => openDrawer(false));
el.recBtn.addEventListener('click', toggleRecord);
el.playBtn.addEventListener('click', startPlayback);
el.stopBtn.addEventListener('click', stopAll);
el.loopBtn.addEventListener('click', () => change({ loop: !state.loop }));
el.clearBtn.addEventListener('click', () => {
  stopPlayback();
  recorder.clear();
});
el.resetBtn.addEventListener('click', () => {
  stopAll();
  Object.assign(state, DEFAULTS, { extended: [...DEFAULTS.extended] });
  engine.setInstrument(state.instrument);
  engine.setVolume(state.volume);
  persist();
  renderPads();
  buildDrawer();
});

// Warm the audio context up on the very first touch anywhere.
document.addEventListener('pointerdown', () => { ensureAudio(); }, { once: true, capture: true });

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); playback ? stopAll() : startPlayback(); return; }
  const primary = PRIMARY_DEGREES[state.mode];
  const num = Number(e.key);
  if (num >= 1 && num <= primary.length) { pressPad(primary[num - 1].id); return; }
  const extIndex = 'qwertyui'.indexOf(e.key.toLowerCase());
  if (extIndex >= 0 && extIndex < state.extended.length) pressPad(state.extended[extIndex]);
});

document.addEventListener('keyup', (e) => {
  const primary = PRIMARY_DEGREES[state.mode];
  const num = Number(e.key);
  if (num >= 1 && num <= primary.length) { releasePad(primary[num - 1].id); return; }
  const extIndex = 'qwertyui'.indexOf(e.key.toLowerCase());
  if (extIndex >= 0 && extIndex < state.extended.length) releasePad(state.extended[extIndex]);
});

// Safety net for pointer events that never reach the pad (system gestures, alerts).
const globalPointerEnd = (e) => {
  for (const [padId, pointerId] of [...padPointers]) {
    if (pointerId === e.pointerId) {
      padPointers.delete(padId);
      releasePad(padId);
    }
  }
};
window.addEventListener('pointerup', globalPointerEnd);
window.addEventListener('pointercancel', globalPointerEnd);

document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
window.addEventListener('pagehide', stopAll);
// Block the double-tap-to-zoom gesture on the performance surface.
document.getElementById('stage').addEventListener('dblclick', (e) => e.preventDefault());

// ---------------------------------------------------------------- boot

renderPads();
renderSequence();
updateTransport();

// Debug hook — handy from Safari Web Inspector when testing on a real iPad.
window.chordPad = { engine, scheduler, recorder, state };
