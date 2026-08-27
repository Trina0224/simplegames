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

A slash chord may represent a traditional inversion (`C/E`, `C/G`) or a non-chord bass (`C/D`).

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

### Spread

A broken chord across three octaves, for hymns that want a fuller left hand. This is the
deliberate exception to the "keep sequential modes short" rule below, and it is opt-in.

```text
C -> C2 G2 C3 C4 G3 E3
```

Up through root, fifth and octave; then down from the top octave through the fifth and the
third. In C that uses the C of three octaves, which is the point of the mode.

More examples:

```text
Dm -> D2 A2 D3 D4 A3 F3
G  -> G2 D3 G3 G4 D4 B3
Am -> A2 E3 A3 A4 E4 C4
```

Unlike the other sequential modes, Spread is built from the chord's own intervals rather
than from the voicing, because the voicing deliberately stays inside one octave.

Where the chord has a seventh, it replaces the fifth on the way down, so the colour is
heard rather than silently dropped:

```text
G7    -> G2 D3 G3 G4 F4 B3
Cmaj7 -> C2 G2 C3 C4 B3 E3
```

Ninths and sus tones do not substitute; those chords keep the plain figure.

A slash bass replaces the bottom note (`C/E` starts on E2). If the slash bass is the fifth,
which would land on the figure's own second note, the bass drops an octave rather than
starting on a repeated pitch.

Its six notes fill a bar of 3/4 or 6/8 exactly at a 1/8 subdivision. In 4/4 it loops as a
three-beat figure against the bar, which is a hemiola rather than a mistake — but 3/4 and
6/8 are where it belongs.

### Extended chords

Block mode may sound every chord tone, for example G7 = G+B+D+F.

Simple sequential accompaniment modes should remain short. Seventh/additional color tones must not automatically make the pattern much longer. The core triad may be used for Pattern/Up/Down/Up & Down while Block preserves the full chord color.

Spread is exempt: it is chosen deliberately when a longer, wider figure is wanted, and it does carry the seventh.

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

Settings must support:

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

### Slash-chord persistence

Slash/bass state is part of the performed chord event.

When Record is active, each chord event must snapshot the current bass/slash setting at the moment the pad is pressed.

Example recorded progression:

```text
C/E -> F -> G/B -> C
```

If the user later changes the global Bass / Slash setting to Off, replay must still sound:

```text
C/E -> F -> G/B -> C
```

and must not silently become:

```text
C -> F -> G -> C
```

Old recording events that do not contain a bass field should remain playable and may default to Bass Off.

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
- bass/slash state

Recommended logical event shape:

```json
{
  "id": "I",
  "name": "C",
  "start": 0.0,
  "duration": 2.15,
  "playback": "pattern",
  "bass": "third"
}
```

A custom slash bass may be represented as a chromatic pitch class, for example `pc:2` for D.

Playback should recreate each event through the Web Audio scheduler using the event's saved bass/slash state rather than the current global state.

Provide:

- Record
- Play
- Stop
- Loop
- Clear

### Sequence display

The sequence view should expose slash notation when present so the user can understand the recorded harmony at a glance.

Examples:

```text
C/E | F | G/B | C
```

or, if functional labels are also shown:

```text
I · C/E | IV · F | V · G/B | I · C
```

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

A loaded preset may snapshot the current bass/slash state if the user has explicitly selected one.

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
9. Users can explicitly choose Root, 3rd, 5th, or custom bass to create slash chords such as C/E, C/G and C/D.
10. Recording snapshots the bass/slash state per chord event.
11. Recorded slash chords replay unchanged even after the global Bass / Slash setting changes.
12. Sequence display can distinguish slash chords visually.
13. Old recordings without a bass field remain playable.
14. iPad mini remains the primary UX target.
15. Record/Play/Stop/Loop continue to work.
16. No backend is required.
