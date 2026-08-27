# AGENTS.md — Chord Pad

## Purpose

Chord Pad is a touch-first browser accompaniment instrument for church activities. It is not a piano keyboard and it is not a DAW.

Primary target: **iPad mini, landscape first**.
Secondary target: **iPhone**.

A user should be able to open the page, press one large chord pad, and immediately get a predictable accompaniment sound suitable for singing.

## Product principles

1. Main screen stays simple: large chord pads, compact status, transport, hamburger settings.
2. Configuration belongs in the settings drawer.
3. Touch interaction must be reliable on iPadOS/iOS Safari.
4. Prefer predictable accompaniment over clever arranging.
5. Chord identity, bass/slash note, playback pattern, rhythm, and duration are separate concepts.
6. Static GitHub Pages deployment is preferred; no backend unless a later feature truly needs one.

## Musical model

### Chord identity

A chord definition determines its chord tones only.

Examples:

- C = C E G
- Dm = D F A
- G = G B D
- G7 = G B D F

Do not confuse chord identity with playback order or bass note.

### Default voicing

The default must be **Close / root-position style**, not Auto.

A person pressing `Dm` should hear a clear D-minor center rather than an automatically selected inversion.

`Auto` voice leading may remain as an advanced option, but it must never be the first-launch default.

### Bass and slash chords

Bass is independent from the upper chord.

Examples:

- C with root bass = C
- C with third bass = C/E
- C with fifth bass = C/G
- C with custom D bass = C/D

The upper chord tones remain C E G in all four cases.

Bass may be Off. In fact, **Off is the default** so a Block C pad is simply C+E+G and a Pattern C pad is simply C-G-E-G without an extra low C unless the user explicitly enables bass.

Slash choices must support at least:

- Off
- Root
- 3rd
- 5th
- Custom chromatic pitch class

A slash setting is part of the musical event, not merely a temporary UI preference. If a user records `C/E`, playback must remain `C/E` even after the global Bass / Slash setting changes.

### Register and voicing

The app accompanies singing, so the chord belongs underneath the melody, which sits around C4 to D5. Root-position voicing cannot be held there: the root falls anywhere inside an octave, so the top note wanders ten semitones across the pads of one key and half of them land in the melody. Inverting is the only fix, which is what the `Compact` voicing does and why Bass + Chords voices its stack the same way.

A `Register` control shifts the voicing an octave either way for taste. It is not a substitute for inverting: shifting root position down an octave rescues I and IV and buries V.

### Continuity

An accompaniment must not sound like a row of separate chords. Figures are phase-locked to the shared transport grid while the accompaniment is flowing, so a chord starting mid-bar continues the pattern instead of restarting it; a chord struck into silence still starts its figure at the beginning, so a single tap opens on the root. Recorded playback holds each chord until the next has begun. Both matter more than they sound like they should: without them every chord change is audible as a stop and a restart.

### Bass weight

The bass must sound powerful, not merely present. It is a single note against three or four chord tones, and low notes are heard as much quieter than high ones at equal amplitude, so without help it vanishes. The engine lifts low notes, reinforces the octave above any fundamental below C3 — a tablet speaker cannot reproduce 50 Hz, so the ear has to be given the octave and left to supply the root — and the bass is struck harder than the chord above it.

### Playback modes

Playback describes how chord tones are triggered over time.

Required modes:

- **Block** — all chord tones together.
- **Pattern** — accompaniment pattern using root -> fifth -> third -> fifth.
- **Up** — low to high, using only the core chord tones.
- **Down** — high to low, using only the core chord tones.
- **Up & Down** — for a triad: root -> third -> fifth -> third.
- **Spread** — a broken chord over three octaves: root -> fifth -> octave -> two octaves -> fifth -> third, the last two an octave higher again. In C that is C2 G2 C3 C4 G4 E4.
- **Bass + Chords** — a low bass note on the downbeat, then the chord struck high for the rest of the bar, with the middle octave left empty. In C, 4/4: C2, then C4+E4+G4 three times.
- **Fill** — the whole chord on the downbeat, then a single-note roll through the chord tones in eighth notes, for the space between sung phrases. In G, 4/4: G2+B3+D4+G4, then D3 G3 B3 G4 B3 D4 G4.
- **Climb** — a transition figure: an octave bass on every eighth, under a right hand that turns up one inversion per beat. In G, 4/4: G1+G2+B3+D4+G4, G1+G2, G1+G2+D4+G4+B4, G1+G2, and on up.

Important: do **not** automatically append a higher octave root to Up/Down patterns.

Spread and Bass + Chords are the two deliberate exceptions to keeping sequential modes short. Both are opt-in.

Spread is built from the chord's intervals rather than the voicing, and substitutes a seventh for the fifth near the top so the colour is heard. Its six notes fill a bar of 3/4 or 6/8 exactly; it lands on the third rather than on its highest note.

Fill steps in eighth notes, so eight steps fill a bar of 4/4 and six fill a bar of 3/4 or 6/8; its downbeat chord carries the seventh while the roll stays on root, third and fifth.

Climb restarts its inversions on each downbeat so it never walks off the top of the keyboard, and its starting inversion is whichever has the lowest top note above A3 — which differs by chord, as it should. It is by far the densest mode, and the reason the audio engine caps its polyphony and steals the oldest voice past 48.

Bass + Chords steps once per beat, not on the arpeggio subdivision, so it fills exactly one bar in any meter. The bass stays in C2..B2 and the chord is voiced in C4..B4 as the inversion with the lowest top note, so C3..B3 is always empty and the chord does not climb an octave between one pad and the next.

For a C triad:

- Block: C + E + G
- Pattern: C -> G -> E -> G
- Up: C -> E -> G
- Down: G -> E -> C
- Up & Down: C -> E -> G -> E
- Spread: C2 -> G2 -> C3 -> C4 -> G4 -> E4
- Bass + Chords: C2, then C4+E4+G4 three times (4/4)
- Fill: C2+E3+G3+C4, then G2 C3 E3 C4 E3 G3 C4 (4/4)
- Climb: C1+C2+C4+E4+G4, C1+C2, C1+C2+E4+G4+C5, C1+C2, and on up (4/4)

For Dm Pattern:

- D -> A -> F -> A

For G Pattern:

- G -> D -> B -> D

For seventh/add chords, Block may use every chord tone, but simple accompaniment patterns should remain short and may use the core root/third/fifth triad rather than becoming longer just because the chord has extra color tones.

### Playback timing

Playback pattern length and chord duration are separate.

A four-step Pattern at 1/8-note subdivision occupies two quarter-note beats. If the chord lasts a full 4/4 bar, the pattern may repeat twice. Do not artificially lengthen the note list merely to fill a bar.

Web Audio scheduling remains the timing source.

## UI

### Main performance screen

Always visible:

- hamburger/settings button
- compact status such as `C Major · Piano · 72 BPM`
- large chord pads
- small extended-chord row
- Record / Play / Stop / Loop / Clear

Do not add permanent DAW controls to the main stage.

### Settings drawer

Settings may include:

- Key
- Major / Minor
- Instrument
- BPM
- Time signature
- Volume
- Playback mode
- Pattern subdivision
- Voicing
- Bass / Slash chord
- Hold / Trigger behavior
- Rhythm
- Extended chord pads
- Progression presets

Bass / Slash choices should support at least:

- Off
- Root
- 3rd (e.g. C/E)
- 5th (e.g. C/G)
- Custom chromatic bass (e.g. D to make C/D)

## Chord system

Major primary pads:

- I, ii, iii, IV, V, vi, vii°

Support common extended colors including:

- V7
- maj7
- m7
- sus2
- sus4
- add9
- diminished
- augmented
- borrowed iv
- ♭VII
- II7 / III7 / VI7 secondary-dominant use cases

Musical definitions should be data-driven rather than duplicated per key.

## Instruments

Initial choices:

- Piano
- Acoustic Guitar
- Organ
- Strings
- Soft Pad

Instrument changes must not alter chord theory or sequence data.

## Recording

Record chord events, not microphone audio.

Capture at least:

- chord identity / scale-degree id
- start time
- duration
- playback mode
- bass/slash state

The bass/slash value is snapshot per event. Recording `C/E -> F -> G/B -> C` must replay with those same bass choices even if the global Bass / Slash setting is later changed.

The recording format should remain serializable and locally persisted. Newer recording schemas should preserve backward compatibility where practical; old events without a `bass` field may be interpreted as Bass Off.

The sequence display should show slash notation when present so a recorded event is visibly distinguishable as `C/E`, `G/B`, `C/D`, etc.

## Responsive requirements

### iPad mini

- landscape-first
- very large pads
- 3-column layout when practical
- settings side drawer

### iPhone

- reflow rather than shrinking pads
- 2 columns acceptable
- drawer may be nearly full screen

## Current defaults

First launch should currently be:

- Key: C
- Major
- Piano
- 72 BPM
- 4/4
- Playback: Block
- Voicing: Close
- Bass: Off
- Trigger: Hold
- Rhythm: Free

These defaults are intentionally plain and predictable.

## Out of scope for now

- accounts/cloud sync
- backend services
- multiplayer
- full MIDI editor
- notation/staff editor
- piano roll
- sheet-music scanning
- DAW tracks/mixer/plugin architecture

## Definition of done

A user on an iPad mini can press obvious chord buttons, hear musically recognizable harmony, optionally choose a short accompaniment Pattern, explicitly choose slash bass when desired, record/replay a progression with slash choices preserved per event, and hide all setup controls when singing.
