# AGENTS.md — Chord Pad

## Project purpose

Chord Pad is a very small browser-based accompaniment instrument for church activities. It is not a piano keyboard and it is not intended to become a DAW.

The user presses one large chord pad and hears a complete chord. The goal is to let people who cannot play piano or guitar provide simple accompaniment for hymns and worship songs.

Primary device: **iPad mini**.
Secondary device: **iPhone**.
Desktop should still work, but desktop UX is not the design target.

## Product principles

1. **Open and play immediately.** The default state must already produce useful sound without setup.
2. **Large controls first.** The performance screen should contain only the controls needed while singing.
3. **Hide configuration.** Key, instrument, BPM, time signature, playback style, voicing, and other configuration live in a hamburger-menu settings drawer.
4. **Do not make it look like a piano.** Chords are represented by large pads, not black/white keys.
5. **Prefer musical usefulness over feature count.** A small feature that improves hymn accompaniment is more valuable than a general synthesizer feature.
6. **Touch-first interaction.** Everything important must work reliably with fingers on Safari/iPadOS and iOS.
7. **Keep the implementation simple.** Version 0.1 should be a static web application suitable for GitHub Pages. Do not add a backend or Node.js runtime unless a later feature actually requires one.

## Technical direction

- Use standard HTML, CSS, and JavaScript unless there is a compelling reason to add a framework.
- Use the Web Audio API for scheduling, envelopes, playback, and chord/arpeggio timing.
- The first implementation may use synthesis, lightweight samples, or a small local soundfont approach, but avoid large assets and avoid network dependencies that make offline/event use fragile.
- Audio must be initialized from an explicit user interaction to comply with iOS/Safari autoplay restrictions.
- Avoid hover-only UI.
- Handle touch/pointer events carefully so holding a chord pad feels immediate and does not cause accidental scrolling or selection.
- Prevent the performance surface from scrolling while playing unless the viewport genuinely requires it.
- Respect safe-area insets on iPhone/iPad.
- Prefer responsive CSS over device-specific hard-coded layouts.
- Persist reasonable user preferences in `localStorage` (for example key, instrument, BPM, playback mode, and volume). Do not require accounts.
- Keep musical data separate from rendering code. Chord construction, note spelling, voicing, progression presets, and playback patterns should be represented as data/functions rather than duplicated in UI handlers.

## Main performance screen

The main screen must remain visually simple.

Always visible:

- hamburger/settings button
- compact status text such as `C Major · Piano · 72 BPM`
- large chord pads
- a small extended-chord row or expandable extended-chord area
- Record
- Play
- Stop
- Loop

Do **not** permanently place the full configuration panel on the performance screen.

### Chord pad labels

Each primary pad should show both functional degree and actual chord name when possible.

Example in C major:

- `I` / `C`
- `ii` / `Dm`
- `iii` / `Em`
- `IV` / `F`
- `V` / `G`
- `vi` / `Am`
- `vii°` / `Bdim`

The actual chord names must update when the key changes.

## Settings drawer

Open from the hamburger button and close with the hamburger button, close affordance, or tapping outside the drawer.

Settings should include at least:

- Key
- Major / Minor mode
- Instrument
- BPM
- Time signature
- Master volume
- Chord playback mode
- Arpeggio subdivision/speed
- Voicing
- Trigger / Hold behavior
- Rhythm pattern
- Extended-chord selection
- Progression presets

On iPad, prefer a side drawer that leaves part of the performance screen visible.
On iPhone, the drawer may cover most of the screen.

## Chord playback modes

Support these modes:

1. **Block** — all chord tones sound together.
2. **Arpeggio Up** — low to high.
3. **Arpeggio Down** — high to low.
4. **Up & Down** — ascending then descending.

Arpeggio timing must follow BPM and a selectable subdivision such as quarter, eighth, or sixteenth notes.

## Chords

### Diatonic primary chords

Major-key default:

- I
- ii
- iii
- IV
- V
- vi
- vii°

Minor-key equivalents should be derived correctly rather than hard-coded as major-key labels.

### Useful extended chords

Version 0.1 should make common hymn/worship colors readily available without overwhelming the main screen. At minimum support the chord engine for:

- dominant 7 (`7`), especially V7
- major 7 (`maj7`)
- minor 7 (`m7`)
- sus2
- sus4
- add9
- diminished
- augmented
- borrowed minor iv
- flat VII
- secondary dominants such as II7, III7, VI7, V/V, and V/ii

The UI does not have to display every possible chord simultaneously. Extended choices may be configured in Settings and surfaced as a small row of extra pads.

## Voicing

Provide a small set of useful options rather than advanced arranging controls:

- Close
- Open/Wide
- Auto

`Auto` should eventually favor smooth voice leading and avoid unnecessary large jumps between consecutive chords. A basic first-pass heuristic is acceptable.

Optional bass behavior may include:

- Root
- Auto

## Instruments

Initial instrument choices:

- Piano
- Acoustic Guitar
- Organ
- Strings
- Soft Pad

Instrument switching should not change chord logic or recorded sequences.

The default should sound pleasant and restrained enough to accompany singing.

## Rhythm and meter

Initial meters:

- 4/4
- 3/4
- 6/8

Initial rhythm modes/presets may include:

- Free
- 4 Beat
- Waltz
- 6/8 Slow
- Ballad / Worship

Do not overbuild a drum-machine interface. Rhythm exists only to make chord accompaniment easier.

## Recording and playback

Record user chord actions as events rather than audio.

Capture enough information to reproduce the performance, including:

- chord identity
- press/start time
- release/end time or duration
- relevant playback mode
- BPM/meter context when needed

Provide:

- Record
- Play
- Stop
- Loop
- Clear recording

Recorded data should be represented in a simple serializable structure and may be persisted locally.

Playback timing should be scheduled through Web Audio timing rather than relying only on `setTimeout` for musical accuracy.

## Progression presets

Provide several simple starter progressions, expressed internally by scale degree so they transpose with the selected key.

Examples:

- I – IV – V – I
- I – V – vi – IV
- I – vi – IV – V
- I – IV – I – V
- vi – IV – I – V
- I – V7 – I
- I – III7 – vi – IV – V – I

Selecting a preset may populate the sequence/recording area, but users must remain free to edit or record their own progression.

## Responsive UX requirements

### iPad mini

- Optimize first for landscape orientation.
- Chord pads should be large enough to hit confidently while looking at lyrics or other people rather than the screen.
- Prefer a 3-column primary-pad layout when space allows.
- Avoid tiny text and tightly packed controls.

### iPhone

- Keep pads large; change layout rather than shrinking controls excessively.
- Two columns are acceptable.
- The settings drawer can become nearly full-screen.

### Accessibility / interaction

- Minimum touch targets should be comfortably above standard mobile minimums for the main pads.
- Provide visible pressed/active state.
- Avoid interactions that depend on color alone.
- Labels must remain readable at normal iPad viewing distance.

## Version 0.1 scope

Build a polished, usable single-page Chord Pad with:

- responsive iPad/iPhone UI
- hamburger settings drawer
- key/mode selection
- diatonic chord generation
- common extended chords
- five basic instrument choices
- block and arpeggio playback modes
- BPM/meter settings
- hold/trigger behavior
- recording and replay of chord events
- loop and stop
- a few transposable progression presets
- local preference persistence

## Explicitly out of scope for v0.1

Do not add these unless specifically requested later:

- user accounts
- cloud sync
- multiplayer
- backend services
- Node.js server
- collaboration
- full MIDI editor
- piano-roll editor
- notation/staff editor
- sheet-music scanning
- lyric database
- song licensing/catalog integration
- complex mixing console
- plugin architecture
- DAW-style tracks

## Definition of done

Version 0.1 is successful when a person can open the page on an iPad mini, choose or leave the default settings, tap large chord buttons to accompany a song, optionally use arpeggiation, record the chord sequence, replay/loop it, and change musical settings without cluttering the main performance screen.

Keep the experience playful, immediate, and forgiving.