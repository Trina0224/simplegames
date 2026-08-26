# Chord Pad

A touch-first browser instrument for simple hymn and worship accompaniment.

Instead of piano keys you get large chord pads: press one and a complete chord sounds.
It is built for people who cannot play piano or guitar but want to accompany singing.

Primary device: **iPad mini** (landscape). Secondary: **iPhone**. Desktop works too.

See [`SPEC.md`](SPEC.md) for the product specification and [`AGENTS.md`](AGENTS.md) for the
project principles this implementation follows.

## Running it

It is a static site — no build step, no backend.

```sh
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/chordpad/
```

The files load as ES modules, so open it over `http://` (or GitHub Pages), not `file://`.
Audio starts on your first touch, as iOS/Safari requires.

## Using it

**Performance screen**

- Seven large pads for the diatonic chords of the current key, each labelled with its
  degree (`I`, `ii`, …) and the actual chord name (`C`, `Dm`, …).
- A scrollable row of extra chords underneath (`V7`, `sus4`, `add9`, `iv`, `♭VII` by default).
- Transport: **Record**, **Play**, **Stop**, **Loop**, **Clear**.
- Everything else lives behind **☰**.

**Settings drawer** — key, major/minor, instrument, tempo, time signature, volume, chord
playback mode, arpeggio speed, voicing, bass, pad behaviour, rhythm, which extra pads to
show, and progression presets.

**Keyboard shortcuts** (desktop): `1`–`7` play the main pads, `q w e r t y u i` the extra
row, `space` starts/stops playback.

## How it works

| File | Role |
| --- | --- |
| `src/theory.js` | Note spelling, scales, chord qualities, degrees, voicing, voice leading |
| `src/audio.js` | Web Audio engine: five instruments, envelopes, reverb, master limiter |
| `src/patterns.js` | Meters, rhythm presets, subdivisions and progressions as plain data |
| `src/player.js` | Look-ahead scheduler that turns a chord + settings into timed notes |
| `src/recorder.js` | Chord *events* (not audio), stored by degree so they transpose |
| `src/settings.js` | Preferences, persisted in `localStorage` |
| `src/app.js` | UI: pads, drawer, transport, playback |

Notes are spelled with a generic-plus-chromatic transposition, so B minor's third is `D`
and F♯ major's IV is `B` — never `C♯♯` or `E♯♯`. Awkward-but-correct roots such as `C♭` are
respelled to their common name for display only; the pitch is unchanged.

Chords are built from interval definitions rather than per-key note tables, so all 12 keys,
both tonalities, and every extended chord come from the same code path.

Recording stores scale degrees (`{ id: "vi", start, duration, playback }`), which is why a
recorded progression follows you when you change key.

Timing is scheduled against `AudioContext.currentTime` with a 180 ms look-ahead, so
arpeggios and rhythm patterns stay steady even when the main thread is busy. Rhythm
patterns are aligned to one shared grid, so chords played at different moments line up.

## Not included (by design)

No accounts, no cloud sync, no backend, no MIDI or notation editor, no mixing console.
It is meant to feel like a small musical appliance, not a workstation.
