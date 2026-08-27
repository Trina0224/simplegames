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

A broken chord across three octaves, for hymns that want a fuller left hand. This is one of
two deliberate exceptions to the "keep sequential modes short" rule below, and both are
opt-in.

```text
C -> C2 G2 C3 C4 G4 E4
```

Up through root, fifth and octave, on up to the fifth above the top octave, then landing on
the third. In C that uses the C of three octaves, which is the point of the mode. Landing on
the third rather than on the peak lets the figure settle instead of stopping at its highest
note; the cost is that the last two notes sit up in the melody's register.

More examples:

```text
Dm -> D2 A2 D3 D4 A4 F4
G  -> G2 D3 G3 G4 D5 B4
Am -> A2 E3 A3 A4 E5 C5
```

Unlike the other sequential modes, Spread is built from the chord's own intervals rather
than from the voicing, because the voicing deliberately stays inside one octave. Its
register therefore follows the chord root.

Where the chord has a seventh, it replaces the fifth near the top, so the colour is heard
rather than silently dropped:

```text
G7    -> G2 D3 G3 G4 F5 B4
Cmaj7 -> C2 G2 C3 C4 B4 E4
```

Ninths and sus tones do not substitute; those chords keep the plain figure.

A slash bass replaces the bottom note (`C/E` starts on E2). If the slash bass is the fifth,
which would land on the figure's own second note, the bass drops an octave rather than
starting on a repeated pitch.

Its six notes fill a bar of 3/4 or 6/8 exactly at a 1/8 subdivision. In 4/4 it loops as a
three-beat figure against the bar, which is a hemiola rather than a mistake — but 3/4 and
6/8 are where it belongs.

### Bass + Chords

Columnar chords across three octaves, with the middle octave deliberately left empty: a low
bass note on the downbeat, then the whole chord struck up high for the rest of the bar.
This is the standard hymn accompaniment shape.

```text
C, 4/4 -> C2 | C4+E4+G4 | C4+E4+G4 | C4+E4+G4
```

**One step per beat**, so the figure always fills exactly one bar and repeats on the
downbeat. The arpeggio subdivision does not apply to this mode.

The meter decides the shape:

```text
4/4 -> bass | chord | chord | chord
3/4 -> bass | chord | chord                 (a waltz)
6/8 -> bass | chord | chord | fifth | chord | chord
```

In 6/8 the second half of the bar starts again on the fifth, which is what a hymn
accompaniment does.

The bass stays in C2..B2 and the chord is voiced in C4..B4, so C3..B3 is always empty
whatever the chord — that gap is the character of the mode.

The chord is voiced as the inversion with the lowest top note, so every chord sits in the
same register instead of the stack climbing an octave between one pad and the next:

```text
C  -> C4+E4+G4          G  -> D4+G4+B4
Dm -> D4+F4+A4          Am -> C4+E4+A4
F  -> C4+F4+A4          G7 -> D4+F4+G4+B4
```

Colour tones are kept and folded into the same octave rather than stacked on top, so
`Cadd9` is `C4+D4+E4+G4`. A slash bass replaces the low note; the chord above is unchanged.

### Fill

A rolling accompaniment for the space between sung phrases: the whole chord on the downbeat,
then a single-note roll through the chord tones in eighth notes.

```text
G, 4/4 -> G2+B3+D4+G4 | D3 | G3 | B3 | G4 | B3 | D4 | G4
C, 4/4 -> C2+E3+G3+C4 | G2 | C3 | E3 | C4 | E3 | G3 | C4
```

**One step per eighth note**, so eight steps fill a bar of 4/4 and six fill a bar of 3/4 or
6/8. The arpeggio subdivision does not apply to this mode. The roll is seven notes long and
is truncated to whatever fits, so the figure always restarts on the downbeat.

In intervals from the root, which is how it transposes:

```text
downbeat  root, third+8ve, fifth+8ve, root+2×8ve
roll      fifth, +8ve, third+8ve, root+2×8ve, third+8ve, fifth+8ve, root+2×8ve
```

The downbeat carries the colour — a seventh joins the opening chord, so `G7` opens
`G2+B3+D4+F4+G4` — but the roll stays on root, third and fifth so the texture does not
thicken as chords get more complicated. A slash bass replaces the low note of the downbeat.

Nothing reaches above the octave-and-a-half over the root, so the mode stays out of the
melody's way even on the highest pads.

### Climb

A transition figure, for the bar between verses: an octave bass on every eighth note, under a
right hand that turns up one inversion per beat.

```text
G, 4/4 -> G1+G2+B3+D4+G4 | G1+G2 | G1+G2+D4+G4+B4 | G1+G2
          | G1+G2+G4+B4+D5 | G1+G2 | G1+G2+B4+D5+G5 | G1+G2
```

Each chord is the previous one with its bottom note moved an octave above the top, so the
right hand walks upward through the bar. The climb restarts on the next downbeat rather than
carrying on, so it never walks off the top of the keyboard however long a pad is held.

The starting inversion is the one with the lowest top note above A3, which is what a hand
falling on the keys would find. It therefore differs by chord — G starts on its third
(`B3 D4 G4`), C starts in root position (`C4 E4 G4`) — and that is correct rather than
inconsistent.

Chord placement follows the meter's pulse:

```text
4/4 -> chord on each of the four beats
3/4 -> chord on each of the three beats
6/8 -> chord on the two dotted-quarter pulses, bass filling the rest
```

The bass is the root in two octaves, an octave below the other modes' bass. In C that reaches
C1, the deepest note the app plays; on a small speaker it will be felt more than heard.

Seventh chords give four-note stacks, so a downbeat is six notes at once. This is the densest
mode in the app by a wide margin — see the note on polyphony below.

### Extended chords

Block mode may sound every chord tone, for example G7 = G+B+D+F.

Simple sequential accompaniment modes should remain short. Seventh/additional color tones must not automatically make the pattern much longer. The core triad may be used for Pattern/Up/Down/Up & Down while Block preserves the full chord color.

Spread, Bass + Chords and Fill are exempt: all three are chosen deliberately when a wider figure is wanted, and all three carry the seventh — Fill only in its downbeat chord.

---

### Polyphony

Climb schedules about thirty notes a bar, and a piano note rings for around four seconds, so
voices accumulate faster than they decay. The audio engine therefore caps itself: past 48
sounding voices it releases the oldest rather than letting an older device run out of breath.
Nothing below Climb's density comes near that ceiling.

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
- Compact

### Close

Default. Keep the root-position identity obvious and predictable.

Examples:

- C = C E G
- Dm = D F A
- Gm = G B♭ D

### Auto

Advanced option. May use inversions and voice leading to reduce jumps between consecutive chords.

Auto is musically useful, but it is not the default because the primary audience should be able to press a pad and immediately recognize the chord center.

### Compact

For accompanying singing. Each chord is inverted to the position with the lowest top note above G3, so every pad sits in the same narrow band underneath the melody.

Root position cannot do this. The root lands anywhere inside an octave, so across the seven pads of a key the top note wanders ten semitones — G4 for I but C5 for IV — and half of them end up inside the melody's own range. Compact holds the tops within three semitones, around D4 to F4:

```text
C -> G3 C4 E4      G  -> G3 B3 D4
Dm -> A3 D4 F4     Am -> A3 C4 E4
F  -> A3 C4 F4     B° -> B3 D4 F4
```

The cost is that a pad no longer always begins on its root, which changes what Up, Down and Pattern start on. That is why it is an option rather than the default.

---

## 7a. Register

- Low
- Mid (default)
- High

Moves the chord voicing down or up an octave. The bass note never moves, and the wide figures — Spread, Fill, Climb — keep their own register, because their shape spans from the bass upward and cannot be split.

An octave shift on its own cannot fix the register. Dropping root position by an octave puts the V chord's top note at D3, down among the bass, while I and IV land nicely. Register is a taste control for a particular song, singer and speaker; `Compact` voicing is the structural fix.

---

## 7b. Continuity

Two things keep an accompaniment from sounding like a row of separate chords.

**Figures are phase-locked to the transport grid.** A chord that starts mid-bar carries its pattern on from where the pattern had got to, rather than restarting at step one. The first attack still sounds the instant the pad is pressed, so playing stays responsive; every step after that lands on the grid. Without this, each new chord audibly stopped the pulse and started it again.

**Recorded playback is legato.** Each chord is held until the next one has started, plus a small overlap, so a recording never falls silent between chords even though the pads were released between presses. The last chord is extended to the loop point in the same way.

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
