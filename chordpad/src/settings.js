// settings.js — user preferences with localStorage persistence. No account, no backend.

// v2 intentionally resets early-prototype audio defaults. The old v1 defaulted to
// auto inversion + root bass, which made a simple C pad sound less predictable.
const KEY = 'chordpad.settings.v2';

export const DEFAULTS = {
  key: 'C',
  mode: 'major',
  instrument: 'piano',
  bpm: 72,
  meter: '4/4',
  volume: 0.8,
  playback: 'block',
  subdivision: '1/8',
  voicing: 'close',
  bass: 'off',
  trigger: 'hold',
  rhythm: 'free',
  extended: ['V7', 'Isus4', 'Iadd9', 'iv', 'bVII'],
  loop: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, extended: [...DEFAULTS.extended] };
    const saved = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...saved };
    if (!Array.isArray(merged.extended)) merged.extended = [...DEFAULTS.extended];
    merged.bpm = Math.min(200, Math.max(40, Number(merged.bpm) || DEFAULTS.bpm));
    merged.volume = Math.min(1, Math.max(0, Number(merged.volume)));
    return merged;
  } catch (_) {
    return { ...DEFAULTS, extended: [...DEFAULTS.extended] };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (_) { /* private mode: run without persistence */ }
}
