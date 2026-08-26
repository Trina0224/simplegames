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

### Playback modes

Playback describes how chord tones are triggered over time.

Required modes:

- **Block** — all chord tones together.
- **Pattern** — accompaniment pattern using root -> fifth -> third -> fifth.
- **Up** — low to high, using only the core chord tones.
- **Down** — high to low, using only the core chord tones.
- **Up & Down** — for a triad: root -> third -> fifth -> third.

Important: do **not** automatically append a higher octave root to Up/Down patterns.

For a C triad:

- Block: C + E + G
- Pattern: C -> G -> E -> G
- Up: C -> E -> G
- Down: G -> E -> C
- Up & Down: C -> E -> G -> E

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

- chord identity
- start time
- duration
- playback mode

Bass/slash state should eventually be captured per event so a recorded `C/E` remains `C/E` on replay. Until that is implemented, treat Bass / Slash as a global performance setting and do not pretend recordings snapshot it.

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

A user on an iPad mini can press obvious chord buttons, hear musically recognizable harmony, optionally choose a short accompaniment Pattern, explicitly choose slash bass when desired, record/replay a progression, and hide all setup controls when singing.
