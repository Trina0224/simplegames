// theory.js — chord/scale construction, spelling and voicing.
// Everything musical is derived from data here so the UI never hard-codes notes.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

export function parseNote(name) {
  const letter = LETTERS.indexOf(name[0].toUpperCase());
  let alter = 0;
  for (const ch of name.slice(1)) {
    if (ch === '#' || ch === '♯') alter += 1;
    else if (ch === 'b' || ch === '♭') alter -= 1;
  }
  return { letter, alter };
}

export function noteName(note) {
  const acc = note.alter > 0 ? '♯'.repeat(note.alter) : '♭'.repeat(-note.alter);
  return LETTERS[note.letter] + acc;
}

// Theoretically correct spellings like C♭ or E♯ are respelled for display only.
// Chord function is carried by the degree label, so readability wins on the pad.
const RESPELL = { '0:-1': { letter: 6, alter: 0 }, '3:-1': { letter: 2, alter: 0 }, '6:1': { letter: 0, alter: 0 }, '2:1': { letter: 3, alter: 0 } };

export function readableNote(note) {
  const direct = RESPELL[`${note.letter}:${note.alter}`];
  if (direct) return direct;
  if (Math.abs(note.alter) < 2) return note;
  const pc = notePc(note);
  const sharpKeys = note.alter > 0;
  const table = sharpKeys
    ? [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]]
    : [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const [letter, alter] = table[pc];
  return { letter, alter };
}

export function notePc(note) {
  return (((LETTER_PC[note.letter] + note.alter) % 12) + 12) % 12;
}

export function transposeNote(base, letterSteps, semitones) {
  const raw = base.letter + letterSteps;
  const letter = ((raw % 7) + 7) % 7;
  const octaveShift = Math.floor(raw / 7);
  const targetAbs = LETTER_PC[base.letter] + base.alter + semitones;
  const alter = targetAbs - (LETTER_PC[letter] + 12 * octaveShift);
  return { letter, alter };
}

const SCALE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export function scaleNotes(tonicName, mode) {
  const tonic = parseNote(tonicName);
  const steps = SCALE_STEPS[mode] || SCALE_STEPS.major;
  return steps.map((semi, i) => transposeNote(tonic, i, semi));
}

export const QUALITIES = {
  maj:    { suffix: '',        steps: [0, 2, 4],    semis: [0, 4, 7] },
  min:    { suffix: 'm',       steps: [0, 2, 4],    semis: [0, 3, 7] },
  dim:    { suffix: 'dim',     steps: [0, 2, 4],    semis: [0, 3, 6] },
  aug:    { suffix: 'aug',     steps: [0, 2, 4],    semis: [0, 4, 8] },
  dom7:   { suffix: '7',       steps: [0, 2, 4, 6], semis: [0, 4, 7, 10] },
  maj7:   { suffix: 'maj7',    steps: [0, 2, 4, 6], semis: [0, 4, 7, 11] },
  min7:   { suffix: 'm7',      steps: [0, 2, 4, 6], semis: [0, 3, 7, 10] },
  m7b5:   { suffix: 'm7♭5',    steps: [0, 2, 4, 6], semis: [0, 3, 6, 10] },
  dim7:   { suffix: 'dim7',    steps: [0, 2, 4, 6], semis: [0, 3, 6, 9] },
  sus2:   { suffix: 'sus2',    steps: [0, 1, 4],    semis: [0, 2, 7] },
  sus4:   { suffix: 'sus4',    steps: [0, 3, 4],    semis: [0, 5, 7] },
  dom7sus4: { suffix: '7sus4', steps: [0, 3, 4, 6], semis: [0, 5, 7, 10] },
  add9:   { suffix: 'add9',    steps: [0, 2, 4, 8], semis: [0, 4, 7, 14] },
  madd9:  { suffix: 'm(add9)', steps: [0, 2, 4, 8], semis: [0, 3, 7, 14] },
};

export const PRIMARY_DEGREES = {
  major: [
    { id: 'I',    label: 'I',    degree: 0, quality: 'maj' },
    { id: 'ii',   label: 'ii',   degree: 1, quality: 'min' },
    { id: 'iii',  label: 'iii',  degree: 2, quality: 'min' },
    { id: 'IV',   label: 'IV',   degree: 3, quality: 'maj' },
    { id: 'V',    label: 'V',    degree: 4, quality: 'maj' },
    { id: 'vi',   label: 'vi',   degree: 5, quality: 'min' },
    { id: 'vii0', label: 'vii°', degree: 6, quality: 'dim' },
  ],
  minor: [
    { id: 'i',    label: 'i',    degree: 0, quality: 'min' },
    { id: 'ii0',  label: 'ii°',  degree: 1, quality: 'dim' },
    { id: 'bIII', label: '♭III', degree: 2, quality: 'maj' },
    { id: 'iv',   label: 'iv',   degree: 3, quality: 'min' },
    { id: 'V',    label: 'V',    degree: 4, quality: 'maj' },
    { id: 'bVI',  label: '♭VI',  degree: 5, quality: 'maj' },
    { id: 'bVII', label: '♭VII', degree: 6, quality: 'maj' },
  ],
};

export const EXTENDED_CHORDS = [
  { id: 'V7',      major: { label: 'V7', degree: 4, quality: 'dom7' }, minor: { label: 'V7', degree: 4, quality: 'dom7' } },
  { id: 'Isus4',   major: { label: 'sus4', degree: 0, quality: 'sus4' }, minor: { label: 'sus4', degree: 0, quality: 'sus4' } },
  { id: 'Isus2',   major: { label: 'sus2', degree: 0, quality: 'sus2' }, minor: { label: 'sus2', degree: 0, quality: 'sus2' } },
  { id: 'Iadd9',   major: { label: 'add9', degree: 0, quality: 'add9' }, minor: { label: 'add9', degree: 0, quality: 'madd9' } },
  { id: 'Imaj7',   major: { label: 'Imaj7', degree: 0, quality: 'maj7' }, minor: { label: 'i7', degree: 0, quality: 'min7' } },
  { id: 'iv',      major: { label: 'iv', degree: 3, quality: 'min' }, minor: { label: 'IV', degree: 3, quality: 'maj' } },
  { id: 'bVII',    major: { label: '♭VII', degree: 6, alter: -1, quality: 'maj' }, minor: { label: '♭VII', degree: 6, quality: 'maj' } },
  { id: 'bVI',     major: { label: '♭VI', degree: 5, alter: -1, quality: 'maj' }, minor: { label: '♭VImaj7', degree: 5, quality: 'maj7' } },
  { id: 'ii7',     major: { label: 'ii7', degree: 1, quality: 'min7' }, minor: { label: 'iiø', degree: 1, quality: 'm7b5' } },
  { id: 'IVmaj7',  major: { label: 'IVmaj7', degree: 3, quality: 'maj7' }, minor: { label: 'iv7', degree: 3, quality: 'min7' } },
  { id: 'vi7',     major: { label: 'vi7', degree: 5, quality: 'min7' }, minor: { label: '♭IIImaj7', degree: 2, quality: 'maj7' } },
  { id: 'Vsus4',   major: { label: 'Vsus4', degree: 4, quality: 'sus4' }, minor: { label: 'Vsus4', degree: 4, quality: 'sus4' } },
  { id: 'II7',     major: { label: 'II7 (V/V)', degree: 1, quality: 'dom7' }, minor: { label: 'II7 (V/V)', degree: 1, quality: 'dom7' } },
  { id: 'III7',    major: { label: 'III7 (V/vi)', degree: 2, quality: 'dom7' }, minor: { label: '♭III7', degree: 2, quality: 'dom7' } },
  { id: 'VI7',     major: { label: 'VI7 (V/ii)', degree: 5, quality: 'dom7' }, minor: { label: 'VI7 (V/ii)', degree: 5, alter: 1, quality: 'dom7' } },
  { id: 'Iaug',    major: { label: 'I+', degree: 0, quality: 'aug' }, minor: { label: 'i+', degree: 0, quality: 'aug' } },
  { id: 'vii07',   major: { label: 'vii°7', degree: 6, quality: 'dim7' }, minor: { label: 'vii°7', degree: 6, alter: 1, quality: 'dim7' } },
];

export function extendedDefsFor(mode) {
  return EXTENDED_CHORDS.map((entry) => (entry[mode] ? { id: entry.id, ...entry[mode] } : null)).filter(Boolean);
}

export function resolveChord(def, key, mode) {
  const scale = scaleNotes(key, mode);
  const base = scale[def.degree % 7];
  const root = def.alter ? transposeNote(base, 0, def.alter) : base;
  const quality = QUALITIES[def.quality] || QUALITIES.maj;
  const notes = quality.steps.map((letterStep, i) => transposeNote(root, letterStep, quality.semis[i]));
  return {
    id: def.id,
    label: def.label,
    root,
    rootPc: notePc(root),
    intervals: quality.semis.slice(),
    notes,
    name: noteName(readableNote(root)) + quality.suffix,
  };
}

export function chordFromId(id, key, mode) {
  const primary = PRIMARY_DEGREES[mode].find((d) => d.id === id);
  if (primary) return resolveChord(primary, key, mode);
  const ext = extendedDefsFor(mode).find((d) => d.id === id);
  if (ext) return resolveChord(ext, key, mode);
  const other = mode === 'major' ? 'minor' : 'major';
  const alt = PRIMARY_DEGREES[other].find((d) => d.id === id) || extendedDefsFor(other).find((d) => d.id === id);
  return alt ? resolveChord(alt, key, mode) : null;
}

// --- Voicing -------------------------------------------------------------

const CLOSE_FLOOR = 55;
const CENTER = 62;

function closeVoicing(chord) {
  const rootMidi = CLOSE_FLOOR + ((chord.rootPc - (CLOSE_FLOOR % 12) + 12) % 12);
  return chord.intervals.map((semi) => rootMidi + semi);
}

function openVoicing(chord) {
  const close = closeVoicing(chord);
  if (close.length < 3) return close;
  const spread = [close[0] - 12, close[1] + 12, ...close.slice(2)];
  return spread.sort((a, b) => a - b);
}

function inversions(chord) {
  const pcs = chord.intervals.filter((semi) => semi < 12).map((semi) => (chord.rootPc + semi) % 12);
  const unique = [...new Set(pcs)];
  const out = [];
  for (let k = 0; k < unique.length; k += 1) {
    const order = unique.slice(k).concat(unique.slice(0, k));
    const notes = [];
    let prev = CLOSE_FLOOR - 6;
    for (const pc of order) {
      let n = prev + (((pc - prev) % 12) + 12) % 12;
      if (n <= prev) n += 12;
      notes.push(n);
      prev = n;
    }
    out.push(notes);
  }
  return out;
}

function voicingCost(candidate, previous) {
  const avg = candidate.reduce((a, b) => a + b, 0) / candidate.length;
  let cost = Math.abs(avg - CENTER) * 0.6;
  for (let i = 1; i < candidate.length; i += 1) {
    if (candidate[i] - candidate[i - 1] <= 2 && candidate[i - 1] < 64) cost += 6;
  }
  if (previous && previous.length) {
    for (const n of candidate) {
      let best = Infinity;
      for (const p of previous) best = Math.min(best, Math.abs(n - p));
      cost += best;
    }
  }
  return cost;
}

export function voiceChord(chord, { voicing = 'close', previous = null } = {}) {
  if (voicing === 'close') return closeVoicing(chord);
  if (voicing === 'open') return openVoicing(chord);
  const candidates = inversions(chord);
  const extras = chord.intervals.filter((semi) => semi >= 12);
  let best = candidates[0];
  let bestCost = Infinity;
  for (const cand of candidates) {
    const cost = voicingCost(cand, previous);
    if (cost < bestCost) { bestCost = cost; best = cand; }
  }
  const notes = best.slice();
  for (const semi of extras) {
    const pc = (chord.rootPc + semi) % 12;
    const top = notes[notes.length - 1];
    let n = top + ((((pc - top) % 12) + 12) % 12);
    if (n <= top) n += 12;
    notes.push(n);
  }
  return notes;
}

function bassMidiForPc(pc) {
  return 36 + (((pc % 12) + 12) % 12);
}

// Bass is independent from the upper chord so slash chords are cheap:
// root = C, third = C/E, fifth = C/G, and pc:2 = C/D.
export function bassNote(chord, { bass = 'off', previous = null } = {}) {
  if (bass === 'off') return null;

  let pc = chord.rootPc;
  if (bass === 'third' && chord.intervals.length > 1) pc = (chord.rootPc + chord.intervals[1]) % 12;
  else if (bass === 'fifth' && chord.intervals.length > 2) pc = (chord.rootPc + chord.intervals[2]) % 12;
  else if (typeof bass === 'string' && bass.startsWith('pc:')) {
    const custom = Number(bass.slice(3));
    if (Number.isFinite(custom)) pc = ((custom % 12) + 12) % 12;
  }

  const base = bassMidiForPc(pc);
  if (bass === 'auto' && previous != null) {
    const options = [base - 12, base, base + 12].filter((n) => n >= 28 && n <= 55);
    return options.reduce((a, b) => (Math.abs(b - previous) < Math.abs(a - previous) ? b : a));
  }
  return base;
}

// Keep accompaniment patterns deliberately short. For seventh/add chords the
// block voicing still contains the colour tones, but simple patterns use the
// first three chord voices so a pad does not suddenly become longer.
export function arpeggioOrder(notes, mode) {
  const base = [...notes].sort((a, b) => a - b);
  const core = base.slice(0, Math.min(3, base.length));
  if (core.length < 2) return core;
  if (mode === 'pattern') {
    if (core.length === 2) return [core[0], core[1], core[0], core[1]];
    return [core[0], core[2], core[1], core[2]];
  }
  if (mode === 'arp-down') return [...core].reverse();
  if (mode === 'arp-updown') {
    if (core.length === 2) return [core[0], core[1], core[0]];
    return [core[0], core[1], core[2], core[1]];
  }
  return core;
}

// A broken chord spread across three octaves: up through root, fifth and octave,
// on up to the fifth above the top octave, then landing on the third.
// In C that is C2 G2 C3 C4 G4 E4 — the C of three octaves.
// Landing on the third rather than on the peak lets the figure settle.
// Built from the chord's own intervals, not from a voicing, because the voicing
// deliberately stays inside one octave.
export function brokenChordNotes(chord, bassMidi = null) {
  const root = bassMidiForPc(chord.rootPc);
  const intervals = chord.intervals;
  const third = intervals.length > 1 ? intervals[1] : 0;
  const fifth = intervals.length > 2 ? intervals[2] : third;
  // A seventh is worth hearing on the way down; a ninth or a sus tone is not.
  const seventh = intervals.find((semi) => semi >= 9 && semi <= 11);
  const upper = (seventh ?? fifth) + 24;
  let low = bassMidi ?? root;
  // A slash bass on the fifth would land on the figure's second note. Drop it an
  // octave rather than starting on a repeated pitch; if there is no room below,
  // lift the second note instead.
  let second = root + fifth;
  if (low === second) {
    if (low - 12 >= 28) low -= 12;
    else second += 12;
  }
  return [
    low,
    second,
    root + 12,
    root + 24,
    root + upper,
    root + third + 24,
  ];
}

// Columnar chords across three octaves, with the middle octave left empty:
// a low bass note on the downbeat, then the chord struck high for the rest of
// the bar. In C, 4/4: C2, then C4+E4+G4 three times.
// One step per beat, so the figure always fills exactly one bar.

const STACK_FLOOR = 60; // C4 — the bass never reaches past B2, so C3..B3 stays empty

// The compact voicing of a chord above `floor`: the inversion with the lowest
// top note, so every chord sits in the same register instead of the stack
// climbing an octave between, say, C and A minor.
function stackAbove(chord, floor) {
  const pcs = [...new Set(chord.intervals.map((semi) => (chord.rootPc + semi) % 12))];
  let best = null;
  for (const bottom of pcs) {
    const order = [...pcs].sort((a, b) => ((a - bottom + 12) % 12) - ((b - bottom + 12) % 12));
    const notes = [];
    let prev = floor - 1;
    for (const pc of order) {
      let n = prev + ((((pc - prev) % 12) + 12) % 12);
      if (n <= prev) n += 12;
      if (n < floor) n += 12;
      notes.push(n);
      prev = n;
    }
    const top = notes[notes.length - 1];
    if (!best || top < best.top || (top === best.top && notes[0] < best.notes[0])) {
      best = { top, notes };
    }
  }
  return best.notes;
}

export function columnChordSteps(chord, bassMidi = null, beats = 4) {
  const root = bassMidiForPc(chord.rootPc);
  const low = bassMidi ?? root;
  const fifth = chord.intervals.length > 2 ? chord.intervals[2] : 0;
  const stack = stackAbove(chord, STACK_FLOOR);

  // In 6/8 the second half of the bar starts again on the fifth, which is what
  // a hymn accompaniment does; anything shorter has one bass note per bar.
  const fifthLow = bassMidiForPc((chord.rootPc + fifth) % 12);
  const secondLow = fifthLow === low ? root : fifthLow;
  const halfway = Math.floor(beats / 2);

  const steps = [];
  for (let i = 0; i < beats; i += 1) {
    if (i === 0) steps.push([low]);
    else if (beats >= 6 && i === halfway) steps.push([secondLow]);
    else steps.push(stack);
  }
  return steps;
}

// A rolling accompaniment for filling the space between sung phrases: a full
// chord on the downbeat, then a single-note roll through the chord tones in
// eighth notes. In G, 4/4:
//   G2+B3+D4+G4 | D3 | G3 | B3 | G4 | B3 | D4 | G4
// The roll is seven notes long and is truncated to whatever fills the bar, so
// the figure always restarts on the downbeat.
const CLIMB_FLOOR = 57; // A3 — where the right hand starts before climbing

// The next inversion up: the bottom note moves an octave above the top.
function nextInversion(notes) {
  const [bottom, ...rest] = notes;
  return [...rest, bottom + 12];
}

// A transition figure: an octave bass on every eighth, and a right hand that
// climbs one inversion per beat. In G, 4/4:
//   G1+G2+B3+D4+G4 | G1+G2 | G1+G2+D4+G4+B4 | G1+G2 | ...
// The climb restarts each bar, so it never walks off the top of the keyboard.
export function climbSteps(chord, bassMidi = null, slots = 8, chordEvery = 2) {
  const high = bassMidi ?? bassMidiForPc(chord.rootPc);
  const low = high - 12;
  const bass = low >= 21 ? [low, high] : [high];
  let stack = stackAbove(chord, CLIMB_FLOOR);

  const steps = [];
  for (let i = 0; i < slots; i += 1) {
    if (i % chordEvery === 0) {
      steps.push([...bass, ...stack]);
      stack = nextInversion(stack);
    } else {
      steps.push(bass);
    }
  }
  return steps;
}

export function fillSteps(chord, bassMidi = null, slots = 8) {
  const root = bassMidiForPc(chord.rootPc);
  const low = bassMidi ?? root;
  const third = chord.intervals.length > 1 ? chord.intervals[1] : 0;
  const fifth = chord.intervals.length > 2 ? chord.intervals[2] : third;
  const seventh = chord.intervals.find((semi) => semi >= 9 && semi <= 11);

  // The downbeat carries the colour; the roll stays on root, third and fifth
  // so the texture does not thicken up as chords get more complicated.
  const opening = [low, root + third + 12, root + fifth + 12, root + 24];
  if (seventh != null) opening.push(root + seventh + 12);
  opening.sort((a, b) => a - b);

  const roll = [
    root + fifth,
    root + 12,
    root + third + 12,
    root + 24,
    root + third + 12,
    root + fifth + 12,
    root + 24,
  ];

  const steps = [opening];
  for (let i = 0; i < slots - 1; i += 1) steps.push([roll[i % roll.length]]);
  return steps;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const KEYS = {
  major: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
};

export function prettyKey(key) {
  return key.replace('#', '♯').replace('b', '♭');
}
