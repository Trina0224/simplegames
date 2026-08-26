# Chord Pad — Product Specification

## 1. Summary

Chord Pad is a touch-first browser accompaniment instrument for hymns and worship songs.

Instead of piano keys, the user sees large chord pads. One pad produces one chord. The app is designed primarily for **iPad mini in landscape orientation**, with iPhone as a secondary target.

The experience should feel like a simple accompaniment appliance, not a synthesizer workstation.

---

## 2. Core musical model

Four concepts must remain independent:

1. **Chord** — which pitches belong to the harmony.
2. **Bass / slash note** — which pitch, if any, sounds below the chord.
3. **Playback mode** — how the chord tones are triggered over time.
4. **Chord duration** — how long the chord remains active.

This separation is important. Do not derive one concept implicitly from another.

Examples:

- C chord tones = C E G
- C/E = upper chord C E G, bass E
- C/G = upper chord C E G, bass G
- C/D = upper chord C E G, bass D

---

## 3. Main performance screen

The main screen should remain minimal.

Always visible:

- hamburger button
- status such as `C Major · Piano · 72 BPM`
- large chord pads
- compact extended-chord row
- Record
- Play
- Stop
- Loop
- Clear

All configuration belongs in the settings drawer.

### Primary pads in C major

| Degree | Chord |
| --- | --- |
| I | C |
| ii | Dm |
| iii | Em |
| IV | F |
| V | G |
| vi | Am |
| vii° | Bdim |

---

## 4. Default state

First launch:

- Key: C
- Tonality: Major
- Instrument: Piano
- BPM: 72
- Meter: 4/4
- Playback: Block
- Voicing: Close
- Bass: Off
- Trigger: Hold
- Rhythm: Free

The defaults are intentionally simple and predictable.

A Block C pad should sound as C+E+G, without an additional low bass note unless the user explicitly enables one.

---

## 5. Playback modes

### Block

All chord tones sound together.

C major:

```text
C + E + G
```

### Pattern

Primary simple accompaniment pattern:

```text
Root -> 5th -> 3rd -> 5th
```

Examples:

```text
C  -> C G E G
Dm -> D A F A
Em -> E B G B
F  -> F C A C
G  -> G D B D
Am -> A E C E
```

This mode is intended for easy hymn accompaniment and should be one of the most useful playback choices.

### Up

Triad example:

```text
C -> E -> G
```

Do not automatically add another high C.

### Down

Triad example:

```text
G -> E -> C
```

Do not automatically add another low or high duplicate note.

### Up & Down

Triad example:

```text
C -> E -> G -> E
```

Avoid the older six-note `C-E-G-C-G-E` behavior.

### Extended chords

Block mode may sound every chord tone, for example G7 = G+B+D+F.

Simple sequential accompaniment modes should remain short. Seventh/additional color tones must not automatically make the pattern much longer. The core triad may be used for Pattern/Up/Down/Up & Down while Block preserves the full chord color.

---

## 6. Pattern timing and duration

Pattern cycle length is independent from chord duration.

Example at 4/4 with 1/8-note subdivision:

```text
C G E G
```

is four eighth notes = two quarter-note beats.

If the C chord is held for four beats, the pattern can naturally repeat twice:

```text
C G E G | C G E G
```

Do not lengthen the note list merely to fill a measure.

Supported subdivision choices:

- 1/4
- 1/8
- 1/16

Web Audio scheduling should drive timing.

---

## 7. Voicing

Options:

- Close
- Open / Wide
- Auto

### Close

Default. Keep the root-position identity obvious and predictable.

Examples:

- C = C E G
- Dm = D F A
- Gm = G B♭ D

### Auto

Advanced option. May use inversions and voice leading to reduce jumps between consecutive chords.

Auto is musically useful, but it is not the default because the primary audience should be able to press a pad and immediately recognize the chord center.

---

## 8. Bass / slash chords

Bass is a separate layer below the upper chord.

Settings should support:

- Off
- Root
- 3rd
- 5th
- Custom chromatic bass note

Examples for a C pad:

- Off: C E G only
- Root: C bass + C E G
- 3rd: E bass + C E G = C/E
- 5th: G bass + C E G = C/G
- Custom D: D bass + C E G = C/D

A slash chord does not require rewriting the upper chord definition.

The current implementation may treat Bass / Slash as a global performance setting. A future revision should store slash state per recorded chord event.

---

## 9. Chord system

### Major-key primary degrees

- I major
- ii minor
- iii minor
- IV major
- V major
- vi minor
- vii° diminished

### Minor-key support

Use musically sensible minor harmony including a major/dominant V where appropriate.

### Extended qualities/functions

Support at least:

- major
- minor
- diminished
- augmented
- dominant 7
- major 7
- minor 7
- sus2
- sus4
- add9
- borrowed iv
- ♭VII
- II7
- III7
- VI7
- secondary-dominant use cases such as V/V and V/ii

Chord construction remains data-driven and transposable.

---

## 10. Settings drawer

Settings remain hidden behind the hamburger menu.

Include:

- Key
- Major / Minor
- Instrument
- BPM
- Time signature
- Master volume
- Chord playback
- Pattern speed/subdivision
- Voicing
- Bass / Slash chord
- Hold / Trigger
- Rhythm
- Extended chord selection
- Progression presets

On iPad, use a side drawer when practical. On iPhone, it may cover most of the screen.

---

## 11. Instruments

Initial choices:

- Piano
- Acoustic Guitar
- Organ
- Strings
- Soft Pad

The sound should be restrained enough to accompany singing.

---

## 12. Rhythm

Initial meters:

- 4/4
- 3/4
- 6/8

Initial rhythm presets:

- Free
- 4 Beat
- Waltz
- 6/8 Slow
- Ballad / Worship

Rhythm should assist accompaniment rather than turn the app into a drum machine.

---

## 13. Recording

Record chord events rather than audio.

Store at least:

- chord/degree identity
- start time
- duration
- playback mode

Playback should recreate events through the Web Audio scheduler.

Provide:

- Record
- Play
- Stop
- Loop
- Clear

Future schema improvement: capture bass/slash state per event so a recorded `C/E` remains `C/E` even if the global bass setting later changes.

---

## 14. Progression presets

Store presets as scale degrees so they transpose with the selected key.

Examples:

- I – IV – V – I
- I – V – vi – IV
- I – vi – IV – V
- I – IV – I – V
- vi – IV – I – V
- I – V7 – I
- I – III7 – vi – IV – V – I

---

## 15. Responsive requirements

### iPad mini landscape

- primary target
- large pads
- 3-column layout when possible
- compact header
- side-drawer settings
- transport controls always reachable

### iPhone

- keep large touch targets
- reflow into fewer columns instead of shrinking excessively
- near-full-screen settings drawer is acceptable

### Touch behavior

- no hover dependency
- no accidental text selection while playing
- visible pressed state
- safe handling of pointer cancellation
- avoid accidental scrolling/zoom gestures on the performance surface

---

## 16. Current acceptance criteria

The current build is successful when:

1. C, Dm, Em, F, G, Am and other pads sound recognizably correct.
2. First-launch Block C is simply C+E+G.
3. Pattern C is C-G-E-G.
4. Pattern Dm is D-A-F-A.
5. Up/Down modes do not add an automatic octave root.
6. Close voicing is the default.
7. Auto voicing remains available as an optional advanced feature.
8. Bass is Off by default.
9. Users can explicitly choose Root, 3rd, 5th, or custom bass to test slash chords such as C/E, C/G and C/D.
10. iPad mini remains the primary UX target.
11. Record/Play/Stop/Loop continue to work.
12. No backend is required.
