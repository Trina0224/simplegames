// patterns.js — meters, rhythm presets, subdivisions and progressions as plain data.

export const METERS = [
  { id: '4/4', name: '4/4', beats: 4, beatUnit: 4 },
  { id: '3/4', name: '3/4', beats: 3, beatUnit: 4 },
  { id: '6/8', name: '6/8', beats: 6, beatUnit: 8 },
];

export const PLAYBACK_MODES = [
  { id: 'block', name: 'Block' },
  { id: 'arp-up', name: 'Arpeggio Up' },
  { id: 'arp-down', name: 'Arpeggio Down' },
  { id: 'arp-updown', name: 'Up & Down' },
];

export const SUBDIVISIONS = [
  { id: '1/4', name: '1/4', beats: 1 },
  { id: '1/8', name: '1/8', beats: 0.5 },
  { id: '1/16', name: '1/16', beats: 0.25 },
];

// A rhythm is a list of attacks inside one measure, measured in beats.
// type: 'chord' = full voicing, 'bass' = bass note only, 'all' = both.
export const RHYTHMS = [
  { id: 'free', name: 'Free', free: true, meters: null },
  {
    id: '4beat', name: '4 Beat', meters: ['4/4'],
    steps: [
      { beat: 0, type: 'all', velocity: 1 },
      { beat: 1, type: 'chord', velocity: 0.62 },
      { beat: 2, type: 'all', velocity: 0.82 },
      { beat: 3, type: 'chord', velocity: 0.62 },
    ],
  },
  {
    id: 'waltz', name: 'Waltz', meters: ['3/4'],
    steps: [
      { beat: 0, type: 'bass', velocity: 1 },
      { beat: 1, type: 'chord', velocity: 0.7 },
      { beat: 2, type: 'chord', velocity: 0.62 },
    ],
  },
  {
    id: '68slow', name: '6/8 Slow', meters: ['6/8'],
    steps: [
      { beat: 0, type: 'all', velocity: 1 },
      { beat: 2, type: 'chord', velocity: 0.55 },
      { beat: 3, type: 'all', velocity: 0.8 },
      { beat: 5, type: 'chord', velocity: 0.5 },
    ],
  },
  {
    id: 'ballad', name: 'Ballad / Worship', meters: null,
    steps: [
      { beat: 0, type: 'all', velocity: 0.95 },
      { beat: 2, type: 'chord', velocity: 0.6 },
    ],
  },
];

export function rhythmById(id) {
  return RHYTHMS.find((r) => r.id === id) || RHYTHMS[0];
}

/** Rhythms that make sense in the chosen meter (plus Free, which always does). */
export function rhythmsForMeter(meterId) {
  return RHYTHMS.filter((r) => !r.meters || r.meters.includes(meterId));
}

export function meterById(id) {
  return METERS.find((m) => m.id === id) || METERS[0];
}

export function subdivisionById(id) {
  return SUBDIVISIONS.find((s) => s.id === id) || SUBDIVISIONS[1];
}

// Progressions are stored by degree id so they transpose with the selected key.
export const PROGRESSIONS = [
  { id: 'I-IV-V-I', name: 'I – IV – V – I', major: ['I', 'IV', 'V', 'I'], minor: ['i', 'iv', 'V', 'i'] },
  { id: 'I-V-vi-IV', name: 'I – V – vi – IV', major: ['I', 'V', 'vi', 'IV'], minor: ['i', 'bVI', 'bIII', 'bVII'] },
  { id: 'I-vi-IV-V', name: 'I – vi – IV – V', major: ['I', 'vi', 'IV', 'V'], minor: ['i', 'bVI', 'iv', 'V'] },
  { id: 'I-IV-I-V', name: 'I – IV – I – V', major: ['I', 'IV', 'I', 'V'], minor: ['i', 'iv', 'i', 'V'] },
  { id: 'vi-IV-I-V', name: 'vi – IV – I – V', major: ['vi', 'IV', 'I', 'V'], minor: ['bVI', 'iv', 'i', 'V'] },
  { id: 'I-V7-I', name: 'I – V7 – I', major: ['I', 'V7', 'I'], minor: ['i', 'V7', 'i'] },
  {
    id: 'I-III7-vi-IV-V-I', name: 'I – III7 – vi – IV – V – I',
    major: ['I', 'III7', 'vi', 'IV', 'V', 'I'],
    minor: ['i', 'V7', 'iv', 'bVI', 'V', 'i'],
  },
  { id: 'I-IV-V-vi', name: 'Hymn amen: IV – I', major: ['IV', 'I'], minor: ['iv', 'i'] },
];
