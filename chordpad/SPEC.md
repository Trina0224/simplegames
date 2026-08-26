# Chord Pad — Product Specification

## 1. Summary

Chord Pad is a touch-first browser instrument for simple hymn and worship accompaniment.

Instead of piano keys, the interface presents large chord buttons. Pressing one button plays a complete chord. The user can change key, instrument, tempo, rhythm, voicing, and playback style, then optionally record and replay the chord sequence.

The product is designed primarily for **iPad mini** use during church activities, with **iPhone** as a supported secondary target.

The intended experience is closer to a friendly accompaniment appliance than a synthesizer or DAW.

---

## 2. Primary use case

A church member wants to sing a hymn but cannot confidently play piano or guitar.

They open Chord Pad, choose the song key if necessary, then tap large chord pads while singing. The app supplies simple harmony. If desired, they can record the chord progression once and loop/replay it while everyone sings.

The app should make this possible with very little music-theory knowledge.

---

## 3. Design goals

### Primary goals

- Immediate sound after opening the page and making the first allowed touch interaction.
- Very large touch targets suitable for iPad mini.
- Main screen stays uncluttered.
- Useful default chords cover a large portion of common hymn/worship harmony.
- Key changes transpose all degree-based chords automatically.
- Chords can be played together or broken into simple arpeggio patterns.
- Users can record a chord performance as events and replay it.
- The app works as a static web app and can be hosted on GitHub Pages.

### Non-goals for v0.1

- Full piano emulation.
- Full notation editor.
- DAW features.
- Professional arranging.
- Cloud accounts or sync.
- Multiplayer.
- Backend services.

---

## 4. Device priorities

### Tier 1 — iPad mini

Primary design target.

Preferred orientation: **landscape**.

The main chord buttons should remain large enough to play confidently with one finger while the user is also looking at lyrics, a projection screen, or other singers.

### Tier 2 — iPhone

Must be usable without tiny controls.

The interface may reflow into fewer columns and the settings drawer may occupy most of the screen.

### Tier 3 — desktop/tablet browsers

Should work, but desktop-specific optimization is not required.

---

## 5. Main screen

The main performance screen should contain only the controls needed during active use.

### Header

- Hamburger button: `☰`
- Compact current-state label, for example:
  - `C Major · Piano · 72 BPM`

The status label should update when relevant settings change.

### Main chord pads

In C major, the default primary pads are:

| Degree | Chord |
| --- | --- |
| I | C |
| ii | Dm |
| iii | Em |
| IV | F |
| V | G |
| vi | Am |
| vii° | Bdim |

Each button shows both the degree and current chord name.

Suggested iPad layout:

```text
┌────────────┐ ┌────────────┐ ┌────────────┐
│     I      │ │     ii     │ │    iii     │
│     C      │ │     Dm     │ │     Em     │
└────────────┘ └────────────┘ └────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐
│     IV     │ │     V      │ │     vi     │
│     F      │ │     G      │ │     Am     │
└────────────┘ └────────────┘ └────────────┘

                 ┌────────────┐
                 │    vii°    │
                 │    Bdim    │
                 └────────────┘
```

The exact layout may be adjusted for better ergonomics.

### Extended chord row

A small additional row provides selected advanced/common chords without crowding the main grid.

Example:

```text
[V7] [sus4] [add9] [iv] [♭VII]
```

The user can choose which extended pads appear through Settings.

### Transport controls

Always visible near the bottom:

- `● Record`
- `▶ Play`
- `■ Stop`
- `↻ Loop`

Clear recording may be available either next to these controls or in a secondary action menu.

---

## 6. Settings drawer

All configuration is hidden behind the hamburger button.

### Behavior

- Tap hamburger to open.
- Tap hamburger again, a close control, or outside the drawer to close.
- On iPad, use a side drawer when practical.
- On iPhone, the drawer may cover most of the viewport.
- Closing the drawer immediately returns the user to large performance controls.

### Settings

#### Key

Support all 12 chromatic roots with sensible enharmonic spelling:

- C
- C♯ / D♭
- D
- E♭
- E
- F
- F♯ / G♭
- G
- A♭
- A
- B♭
- B

The implementation should choose readable chord spelling appropriate for the selected key.

#### Tonality

- Major
- Minor

#### Instrument

Initial choices:

- Piano
- Acoustic Guitar
- Organ
- Strings
- Soft Pad

#### Tempo

- BPM numeric value or slider/stepper.
- Sensible default: approximately 72 BPM.
- Allow a practical accompaniment range such as roughly 40–200 BPM.

#### Time signature

Initial options:

- 4/4
- 3/4
- 6/8

#### Volume

- Master volume.

#### Playback mode

- Block
- Arpeggio Up
- Arpeggio Down
- Up & Down

#### Arpeggio subdivision

Initial options:

- 1/4
- 1/8
- 1/16

Arpeggio note timing must derive from BPM.

#### Voicing

- Close
- Open/Wide
- Auto

`Auto` should attempt smooth voice leading across consecutive chords.

#### Bass behavior

Optional v0.1 control:

- Root
- Auto

#### Trigger mode

- Trigger
- Hold

**Trigger:** one tap plays a chord for a configured/natural duration.

**Hold:** chord remains active while the user holds the pad and releases when the finger is lifted.

#### Rhythm pattern

Initial set:

- Free
- 4 Beat
- Waltz
- 6/8 Slow
- Ballad / Worship

Keep this simple. It is accompaniment timing, not a drum-machine editor.

#### Extended chord selection

Allow users to select a few advanced chords to surface on the main screen.

#### Progression presets

Allow loading a ready-made degree sequence.

---

## 7. Chord system

### Major-key primary degrees

- I — major
- ii — minor
- iii — minor
- IV — major
- V — major
- vi — minor
- vii° — diminished

### Minor-key primary degrees

Use a musically useful minor-key system rather than merely shifting the major-key pattern.

At minimum, the chord engine should be able to represent natural-minor diatonic chords and a dominant V/V7 using the raised leading tone when appropriate for common tonal accompaniment.

The UI can remain simple even if the internal chord engine supports more detail.

### Extended chord engine

Support at least these qualities/functions:

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

Also support common borrowed/functional chords useful in hymns and worship music:

- iv in a major key
- ♭VII
- II7
- III7
- VI7
- V/V
- V/ii

The system should generate notes from musical definitions instead of keeping separate hard-coded note lists for every key.

---

## 8. Chord playback behavior

### Block

All chord tones sound simultaneously.

Example C major:

```text
C + E + G
```

### Arpeggio Up

Play low to high.

Example:

```text
C → E → G → C
```

### Arpeggio Down

Play high to low.

Example:

```text
C → G → E → C
```

### Up & Down

Play ascending then descending.

Example:

```text
C → E → G → C → G → E
```

Patterns should adapt sensibly to chord size (triads, sevenths, add9, etc.).

Playback timing should use Web Audio scheduling for stable rhythm.

---

## 9. Audio behavior

### Envelope

Avoid harsh note-on/note-off clicks.

Each instrument should have an appropriate attack/release shape.

### Hold behavior

When Hold mode is enabled:

- pointer/touch down starts the chord or pattern
- continued hold sustains/repeats according to the selected mode
- pointer/touch up releases gracefully
- pointer cancellation must also stop/release the sound safely

### Instrument character

The first implementation does not need studio-quality sampling, but the sound must be pleasant enough to sing over.

Avoid a raw oscillator sound that resembles a test tone.

If samples or soundfonts are used, keep assets small and local when feasible so event use is not dependent on a good network connection.

---

## 10. Rhythm behavior

### Free

The user controls chord timing manually.

### Patterned modes

A rhythm preset defines when chord notes or attacks occur relative to the meter.

Examples:

#### 4 Beat

One simple pulse per beat in 4/4.

#### Waltz

A simple 3-beat accompaniment feel.

#### 6/8 Slow

A soft two-large-beat or six-subdivision feel suitable for slow hymns.

#### Ballad / Worship

A gentle sustained pattern with sparse attacks.

Pattern definitions should remain data-driven so more can be added without rewriting the audio engine.

---

## 11. Recording

Chord Pad records **events**, not microphone/audio recordings.

### Record start

Tap `Record` to begin capturing user chord actions.

### Event data

Each event should contain enough information to replay the performance accurately.

Example logical structure:

```json
{
  "chord": "I",
  "resolvedChord": "C",
  "start": 0.0,
  "duration": 2.15,
  "playbackMode": "block"
}
```

The exact schema may evolve, but avoid tying stored sequences unnecessarily to one key if degree-based storage can preserve transposition.

### Playback

`Play` replays the captured chord sequence.

### Stop

Stops playback immediately and safely releases active voices.

### Loop

When enabled, playback restarts from the beginning after the sequence ends.

### Clear

Deletes the current recorded sequence after an intentional user action.

---

## 12. Sequence display

A lightweight visual representation may appear near the bottom without becoming an editor-heavy interface.

Example:

```text
| I | vi | IV | V |
```

or resolved names:

```text
| C | Am | F | G |
```

The sequence view may show durations later, but it should remain simple in v0.1.

---

## 13. Progression presets

Starter presets should be stored as scale degrees so they transpose with the chosen key.

Initial examples:

1. I – IV – V – I
2. I – V – vi – IV
3. I – vi – IV – V
4. I – IV – I – V
5. vi – IV – I – V
6. I – V7 – I
7. I – III7 – vi – IV – V – I

Loading a preset should not prevent subsequent manual editing/recording.

---

## 14. Persistence

Use browser-local persistence where useful.

Remember at least:

- key
- major/minor mode
- instrument
- BPM
- meter
- master volume
- playback mode
- arpeggio subdivision
- voicing
- trigger/hold preference
- selected extended chord pads

Optionally remember the latest recorded sequence.

No account should be required.

---

## 15. Responsive layout

### iPad mini landscape

Preferred arrangement:

- compact header
- 3-column primary chord grid
- one compact extended-chord row
- large transport controls at bottom
- settings in side drawer

### iPad mini portrait

Reflow rather than shrink pads aggressively.

### iPhone portrait

Prefer 2 columns for chord pads.

Keep important controls reachable with one hand where practical.

### Touch requirements

- Large main-pad hit areas.
- No tiny inline links for performance actions.
- Clear pressed state.
- No hover dependency.
- Avoid browser text selection during playing.
- Avoid accidental page scrolling when manipulating pads.

---

## 16. Suggested default state

On first launch:

- Key: C
- Tonality: Major
- Instrument: Piano
- BPM: 72
- Meter: 4/4
- Playback: Block
- Voicing: Auto or Close
- Trigger behavior: Hold
- Rhythm: Free
- Extended pads: V7, sus4, add9, iv, ♭VII

The first user touch should be sufficient to initialize audio and play a chord.

---

## 17. Implementation constraints

Version 0.1 should preferably be deployable as static files on GitHub Pages.

Recommended stack:

- HTML
- CSS
- modern JavaScript
- Web Audio API

Do not introduce a Node backend merely because the repository may contain Node projects elsewhere.

If build tooling is used, keep it minimal and ensure the final deployment remains straightforward.

---

## 18. Acceptance criteria for v0.1

The build is ready when all of the following are true:

1. It opens and is usable on current iPad Safari.
2. It is comfortable on an iPad mini in landscape orientation.
3. It remains usable on an iPhone.
4. The main screen contains large chord pads and minimal clutter.
5. Settings are accessible through a hamburger drawer and can be hidden again.
6. Changing key transposes chord labels and sound correctly.
7. Major/minor primary chord sets work.
8. Common extended chords can be played.
9. Piano, Acoustic Guitar, Organ, Strings, and Soft Pad options exist.
10. Block, Arpeggio Up, Arpeggio Down, and Up & Down modes work.
11. BPM affects scheduled arpeggio/rhythm timing.
12. 4/4, 3/4, and 6/8 are supported.
13. Record captures the sequence of chord actions.
14. Play reproduces the recorded sequence with reasonable timing accuracy.
15. Stop reliably silences/release active playback.
16. Loop works.
17. Several progression presets transpose with the chosen key.
18. User preferences persist locally.
19. No backend is required.
20. The product feels like a simple musical appliance, not a software workstation.
