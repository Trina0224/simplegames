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
  // Double accidentals: fall back to the simplest name for the same pitch class.
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

// Generic + chromatic transposition keeps spelling correct (B + m3 => D, not C##).
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
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor; harmonic colours come from chord defs
};

export function scaleNotes(tonicName, mode) {
  const tonic = parseNote(tonicName);
  const steps = SCALE_STEPS[mode] || SCALE_STEPS.major;
  return steps.map((semi, i) => transposeNote(tonic, i, semi));
}

// quality: how a chord is spelled and stacked. `steps` are letter steps, `semis` semitones.
export const QUALITIES = {
  maj:    { suffix: '',        steps: [0, 2, 4],    semis: [0, 4, 7] },
  min:    { suffix: 'm',       steps: [0, 2, 4],    semis: [0, 3, 7] },
  dim:    { suffix: 'dim',     steps: [0, 2, 4],    semis: [0, 3, 6] },
  aug:    { suffix: 'aug',     steps: [0, 2, 4],    semis: [0, 4, 8] },
  dom7:   { suffix: '7',       steps: [0, 2, 4, 6], semis: [0, 4, 7, 10] },
  maj7:   { suffix: 'maj7',    steps: [0, 2, 4, 6], semis: [0, 4, 7, 11] },
  min7:   { suffix: 'm7',      steps: [0, 2, 4, 6], semis: [0, 3, 7, 10] },
  m7b5:   { suffix: 'm7♭5', steps: [0, 2, 4, 6], semis: [0, 3, 6, 10] },
  dim7:   { suffix: 'dim7',    steps: [0, 2, 4, 6], semis: [0, 3, 6, 9] },
  sus2:   { suffix: 'sus2',    steps: [0, 1, 4],    semis: [0, 2, 7] },
  sus4:   { suffix: 'sus4',    steps: [0, 3, 4],    semis: [0, 5, 7] },
  dom7sus4: { suffix: '7sus4', steps: [0, 3, 4, 6], semis: [0, 5, 7, 10] },
  add9:   { suffix: 'add9',    steps: [0, 2, 4, 8], semis: [0, 4, 7, 14] },
  madd9:  { suffix: 'm(add9)', steps: [0, 2, 4, 8], semis: [0, 3, 7, 14] },
};

// Primary pads. `degree` indexes the scale, `alter` shifts the root chromatically.
export const PRIMARY_DEGREES = {
  major: [
    { id: 'I',    label: 'I',            degree: 0, quality: 'maj' },
    { id: 'ii',   label: 'ii',           degree: 1, quality: 'min' },
    { id: 'iii',  label: 'iii',          degree: 2, quality: 'min' },
    { id: 'IV',   label: 'IV',           degree: 3, quality: 'maj' },
    { id: 'V',    label: 'V',            degree: 4, quality: 'maj' },
    { id: 'vi',   label: 'vi',           degree: 5, quality: 'min' },
    { id: 'vii0', label: 'vii°',    degree: 6, quality: 'dim' },
  ],
  minor: [
    { id: 'i',    label: 'i',            degree: 0, quality: 'min' },
    { id: 'ii0',  label: 'ii°',     degree: 1, quality: 'dim' },
    { id: 'bIII', label: '♭III',    degree: 2, quality: 'maj' },
    { id: 'iv',   label: 'iv',           degree: 3, quality: 'min' },
    { id: 'V',    label: 'V',            degree: 4, quality: 'maj' }, // raised leading tone
    { id: 'bVI',  label: '♭VI',     degree: 5, quality: 'maj' },
    { id: 'bVII', label: '♭VII',    degree: 6, quality: 'maj' },
  ],
};

// Extra colours a user can surface on the performance screen.
// Each entry gives a per-mode definition; `null` means "not offered in that mode".
export const EXTENDED_CHORDS = [
  { id: 'V7',      major: { label: 'V7',    degree: 4, quality: 'dom7' },            minor: { label: 'V7', degree: 4, quality: 'dom7' } },
  { id: 'Isus4',   major: { label: 'sus4',  degree: 0, quality: 'sus4' },            minor: { label: 'sus4', degree: 0, quality: 'sus4' } },
  { id: 'Isus2',   major: { label: 'sus2',  degree: 0, quality: 'sus2' },            minor: { label: 'sus2', degree: 0, quality: 'sus2' } },
  { id: 'Iadd9',   major: { label: 'add9',  degree: 0, quality: 'add9' },            minor: { label: 'add9', degree: 0, quality: 'madd9' } },
  { id: 'Imaj7',   major: { label: 'Imaj7', degree: 0, quality: 'maj7' },            minor: { label: 'i7',   degree: 0, quality: 'min7' } },
  { id: 'iv',      major: { label: 'iv',    degree: 3, quality: 'min' },             minor: { label: 'IV',   degree: 3, quality: 'maj' } },
  { id: 'bVII',    major: { label: '♭VII', degree: 6, alter: -1, quality: 'maj' }, minor: { label: '♭VII', degree: 6, quality: 'maj' } },
  { id: 'bVI',     major: { label: '♭VI', degree: 5, alter: -1, quality: 'maj' },  minor: { label: '♭VImaj7', degree: 5, quality: 'maj7' } },
  { id: 'ii7',     major: { label: 'ii7',   degree: 1, quality: 'min7' },            minor: { label: 'iiø', degree: 1, quality: 'm7b5' } },
  { id: 'IVmaj7',  major: { label: 'IVmaj7', degree: 3, quality: 'maj7' },           minor: { label: 'iv7',  degree: 3, quality: 'min7' } },
  { id: 'vi7',     major: { label: 'vi7',   degree: 5, quality: 'min7' },            minor: { label: '♭IIImaj7', degree: 2, quality: 'maj7' } },
  { id: 'Vsus4',   major: { label: 'Vsus4', degree: 4, quality: 'sus4' },            minor: { label: 'Vsus4', degree: 4, quality: 'sus4' } },
  { id: 'II7',     major: { label: 'II7 (V/V)', degree: 1, quality: 'dom7' },        minor: { label: 'II7 (V/V)', degree: 1, quality: 'dom7' } },
  { id: 'III7',    major: { label: 'III7 (V/vi)', degree: 2, quality: 'dom7' },      minor: { label: '♭III7', degree: 2, quality: 'dom7' } },
  { id: 'VI7',     major: { label: 'VI7 (V/ii)', degree: 5, quality: 'dom7' },       minor: { label: 'VI7 (V/ii)', degree: 5, alter: 1, quality: 'dom7' } },
  { id: 'Iaug',    major: { label: 'I+',    degree: 0, quality: 'aug' },             minor: { label: 'i+', degree: 0, quality: 'aug' } },
  { id: 'vii07',   major: { label: 'vii°7', degree: 6, quality: 'dim7' },       minor: { label: 'vii°7', degree: 6, alter: 1, quality: 'dim7' } },
];

export function extendedDefsFor(mode) {
  return EXTENDED_CHORDS
    .map((entry) => (entry[mode] ? { id: entry.id, ...entry[mode] } : null))
    .filter(Boolean);
}

// Resolve a pad definition into a concrete, spelled chord in the current key.
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
  // Fall back to the other mode so a recording made in major still replays in minor.
  const other = mode === 'major' ? 'minor' : 'major';
  const alt = PRIMARY_DEGREES[other].find((d) => d.id === id) || extendedDefsFor(other).find((d) => d.id === id);
  return alt ? resolveChord(alt, key, mode) : null;
}

// --- Voicing -------------------------------------------------------------

const CLOSE_FLOOR = 55; // G3 — comfortable accompaniment register
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

// Rotations of the chord tones, each stacked upward from the lowest available slot.
function inversions(chord) {
  // Tensions above the octave are voiced on top afterwards, not folded into the stack.
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
  // Semitone clusters low in the register sound muddy under a singing voice.
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

export function voiceChord(chord, { voicing = 'auto', previous = null } = {}) {
  if (voicing === 'close') return closeVoicing(chord);
  if (voicing === 'open') return openVoicing(chord);
  const candidates = inversions(chord);
  // add9-style tensions are dropped from the inversion search, so re-add them on top.
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

export function bassNote(chord, { bass = 'root', previous = null } = {}) {
  if (bass === 'off') return null;
  const base = 36 + ((chord.rootPc - 0 + 12) % 12); // C2..B2
  if (bass === 'auto' && previous != null) {
    const options = [base - 12, base, base + 12].filter((n) => n >= 28 && n <= 55);
    return options.reduce((a, b) => (Math.abs(b - previous) < Math.abs(a - previous) ? b : a));
  }
  return base;
}

export function arpeggioOrder(notes, mode) {
  const base = [...notes].sort((a, b) => a - b);
  const up = [...base, base[0] + 12];
  if (mode === 'arp-down') return [...up].reverse();
  if (mode === 'arp-updown') return [...up, ...up.slice(1, -1).reverse()];
  return up;
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
