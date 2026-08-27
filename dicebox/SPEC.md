# Dice Box — Product Specification

## 1. Summary

Dice Box turns a phone or tablet into a shallow glass box containing one to three dice.

Shaking the device throws the dice. Tilting it makes them slide. Setting the device down lets them settle, and the pips are then readable at a glance. The number is generated from a cryptographic random source, so the toy can be used for decisions that matter to the people at the table.

There is no score and no goal. The product is the loop: shake, rattle, read.

---

## 2. Primary use case

A group is playing a board game, or deciding who goes first, and nobody can find the dice.

Someone opens Dice Box on their phone, taps once to allow motion, picks two dice, shakes, and puts the phone flat on the table. Everyone reads the result off the screen.

It has to be quick enough that reaching for the phone beats looking for the dice, and honest enough that nobody argues about the number.

---

## 3. Design goals

### Primary goals

- Shaking the device is the way you roll. It should feel like there is weight inside.
- A still device produces still dice, fast, with no creeping or jitter.
- Face values are uniformly distributed and demonstrably so.
- One to three dice, chosen with a single tap.
- Readable across a table.
- Works on iOS Safari, Android Chrome, and desktop browsers.
- Static site, hostable on GitHub Pages, no backend and no network traffic after load.

### Non-goals for v0.1

- Realistic rigid-body 3D physics.
- Dice other than d6.
- Statistics, history, or streaks.
- Multiplayer or shared rolls.
- Any form of wagering.
- Accounts or sync.

---

## 4. Device priorities

### Tier 1 — phones (iPhone and Android)

The primary design target, held in one hand and shaken. Portrait first, landscape supported.

### Tier 1.5 — iPad

Same interaction, larger box, more room for three dice to scatter. A tablet is shaken with two hands, more slowly and with lower peak acceleration than a phone; the shake threshold must accommodate this rather than assuming a phone-sized flick.

### Tier 3 — desktop

No motion sensors. Flick with the pointer, or click the box. Must be fully playable, because this is also how the toy is developed and tested.

---

## 5. Main screen

```text
┌──────────────────────────────────────┐
│ ╔══════════════════════════════════╗ │
│ ║                                  ║ │
│ ║        ┌────┐                    ║ │
│ ║        │ ⚄  │      ┌────┐        ║ │
│ ║        └────┘      │ ⚂  │        ║ │
│ ║                    └────┘        ║ │
│ ║                                  ║ │
│ ╚══════════════════════════════════╝ │
│                                      │
│              8                       │
│                                      │
│        [ 1 ]  [ 2 ]  [ 3 ]      ⚙    │
└──────────────────────────────────────┘
```

### The box

- Fills the available screen area above the controls, with a margin.
- Rendered as a shallow tray: walls with visible thickness and inner shading, a floor with a subtle texture, soft contact shadows under each die, and a restrained highlight suggesting glass over the top.
- The walls are the simulation boundary. What you see is what the dice hit.

### The dice

- Real 3D cubes built from six CSS-transformed faces, with rounded corners and inset pips.
- Sized so that three dice have clear room to move: roughly one seventh of the box's shorter side, clamped to a comfortable minimum for readability.
- They tumble while moving and ease to a flat, axis-aligned orientation as they settle.

### The readout

- The total appears when every die is at rest, large, near the box.
- Individual values are available as text for assistive technology even when only the total is drawn.
- The readout clears the moment the dice wake, so a stale number is never on screen next to moving dice.

### Controls

- Dice count: three large targets labelled 1, 2, 3. Changing the count is immediate and re-rolls.
- One small settings control for sound, haptics and shake sensitivity. A compact popover is preferred over a full drawer; this app has few enough settings that a drawer would be ceremony.

---

## 6. Start and permission flow

Motion access on iOS 13+ requires a call to `DeviceMotionEvent.requestPermission()` from inside a user gesture, on a secure origin. The app therefore opens on a start surface.

### Start surface

- Shows the box already, dimmed, with the dice visible and still.
- One line of instruction and one large target: *tap the glass*.
- The tap does three things in the same gesture: requests motion permission, starts the audio context, and drops the user into the toy.

### Outcomes

| Result | Behaviour |
| --- | --- |
| Granted | Full shake-and-tilt play. |
| Denied | Fall back to flick and tap. Explain once, quietly, with a way to retry. Do not nag. |
| API absent (Android, desktop) | Attach listeners directly; if no motion events arrive within about a second, fall back. |
| Insecure origin | Motion is unavailable by design. Say so plainly and fall back. |

A denied permission is not an error state. The toy must be fully usable — and equally fair — without sensors.

### Troubleshooting note for the README

On iOS, motion access can also be switched off system-wide under Settings → Safari → Motion & Orientation Access. If that is off, `requestPermission()` resolves to denied with no prompt shown. The fallback must therefore be good enough to stand on its own.

---

## 7. Sensor handling

### Inputs

- `accelerationIncludingGravity` — the main signal; gives both tilt and shake.
- `acceleration` — gravity-compensated where the platform provides it; treat as optional.
- `rotationRate` — optional; may add spin flavour to the tumble, never required.

### Normalisation

1. **Measure `dt` from event timestamps.** Sample rates differ between platforms and change with battery state. Never hard-code 60 Hz.
2. **Detect the axis-sign convention at rest rather than assuming it.** Browsers have not agreed historically on the sign of `accelerationIncludingGravity`. On the first still samples, the magnitude should be about 9.81; use the observed direction to establish which way is "down" and normalise everything into one internal frame from then on.
3. **Rotate into screen space** using `screen.orientation.angle` (falling back to `window.orientation`), so tilt directions stay correct in landscape and upside-down portrait.
4. **Low-pass the vector** (time constant of roughly 0.2 s) to recover gravity, and therefore tilt.
5. **High-pass the vector** (raw minus the low-passed gravity) to recover shake. Shake energy is the magnitude of that residual.

### Derived signals

- `tilt` — the in-plane component of the gravity vector, in screen axes, expressed as a fraction of g. This becomes acceleration on the dice.
- `shakeEnergy` — a smoothed magnitude of the high-passed residual, in m/s².
- `isStill` — true when `shakeEnergy` stays below a small threshold for a short window.

### Suggested starting values, to be tuned on real devices

| Quantity | Starting point |
| --- | --- |
| Gravity filter time constant | 0.20 s |
| Shake wake threshold | ≈ 6 m/s² of residual |
| Shake-to-impulse scale | tuned so a normal flick clearly crosses the box |
| Still threshold | ≈ 1.2 m/s² residual, sustained 300 ms |
| Tablet allowance | lower thresholds; tablets are shaken more slowly |

These are starting points, not requirements. The feel has to be tuned with a device in hand, and the numbers that survive that tuning should be written back into this document.

---

## 8. Simulation

### Model

Each die is a body on the 2D floor of the box:

- `position` and `velocity` in box coordinates
- a `tumble` state driving the visual rotation
- a `restingFace` once settled

The die is treated as a square against the walls and as a disc against other dice. This is not physically exact and does not need to be; it produces plausible scatter with very little code.

### Loop

- Fixed timestep, roughly 120 Hz, accumulated against real time, decoupled from rendering.
- Per step: apply tilt acceleration, apply shake impulses, integrate, resolve wall collisions, resolve die-die collisions, apply friction, test for sleep.

### Forces and coefficients (starting points)

| Parameter | Starting point |
| --- | --- |
| Tilt gravity | in-plane g, scaled to box units |
| Floor friction | strong enough to stop a die within about a second of a still device |
| Wall restitution | ≈ 0.45 |
| Die-die restitution | ≈ 0.40 |
| Sleep speed threshold | a small fraction of a die width per second |
| Sleep dwell | ≈ 250 ms below threshold, with the device still |

### Sleeping and waking

A die sleeps when it is slow, the device is still, and it has stayed that way for the dwell time. On sleep it draws its face and eases into a flat orientation showing it.

Any die wakes when shake energy crosses the wake threshold, when it is hit by a moving die, or when the user flicks or taps.

Waking must clear the total immediately.

### Tumble

While a die is moving it rotates continuously, at a rate driven by its speed and direction, so the motion reads as tumbling rather than sliding. On settle it eases over roughly 250 ms from wherever it is to the axis-aligned orientation that shows the drawn face. Because the start orientation is arbitrary, the landing looks natural without being simulated.

Under `prefers-reduced-motion`, keep the travel and cut the tumble.

---

## 9. Fairness

This is a correctness requirement.

- When a die settles, draw its face with `crypto.getRandomValues`, using rejection sampling so that all six faces are exactly equally likely. Do not use `Math.random`, and do not use a modulo of a byte without rejection — both introduce bias.
- The simulation determines position and timing only. It must never be the source of the number.
- Each die draws independently.
- Do not re-draw a value once a die has settled. A die that is knocked by a neighbour wakes, moves, and draws again on its next settle — but a die at rest never silently changes.

State this in the README and, briefly, in the UI. The point of the toy is that a group can trust the number, and the reasoning is short enough to say out loud: the physics is for feel, the number is from the operating system's random source.

A test must be able to run the settle path several thousand times headlessly and confirm a flat distribution.

---

## 10. Sound and haptics

- Short, dry clicks synthesised with the Web Audio API. No audio files.
- Wall impacts and die-die impacts should be distinguishable.
- Amplitude follows impact speed; below a small speed, no sound at all.
- Rate-limit collisions so a violent shake produces a rattle, not a burst of clipping.
- Haptics fire once when the last die settles, not on every collision, and only where `navigator.vibrate` exists.
- Both are switchable, and the choice persists.
- Choose the out-of-the-box defaults deliberately and record them in section 15.

---

## 11. States

```text
start ──tap──▶ idle ──shake/flick/tap──▶ rolling ──still──▶ settling ──▶ resting
                 ▲                                                        │
                 └────────────────────shake/flick/tap─────────────────────┘
```

| State | Meaning |
| --- | --- |
| `start` | Waiting for the gesture that grants motion and starts audio. |
| `idle` | Dice at rest, no result shown yet (first load or after a count change). |
| `rolling` | At least one die awake and moving. Total hidden. |
| `settling` | All dice slow and the device still; faces drawn, orientations easing. |
| `resting` | All dice asleep. Total shown and announced. |

---

## 12. Settings

Small enough to live in one compact popover:

- Sound: on / off
- Haptics: on / off (hidden where unsupported)
- Shake sensitivity: low / normal / high
- Motion access: a retry control, shown only when permission was denied or is unavailable

Dice count is not a setting; it is a primary control on the main screen.

---

## 13. Persistence

`localStorage`, no account:

- dice count
- sound preference
- haptics preference
- shake sensitivity

The last result is deliberately **not** persisted. A stale number from yesterday appearing on launch would undermine the one thing the toy is for.

---

## 14. Responsive layout

- **Phone portrait** — box occupies most of the screen; controls in a bottom strip within thumb reach; respect safe-area insets.
- **Phone landscape** — box widens; controls move to one side rather than shrinking.
- **Tablet** — larger box, same proportions; dice scale with the box so three dice always have room.
- **Desktop** — box capped at a sensible size and centred; pointer flick enabled; a visible hint that dragging throws the dice.

Requirements in every layout:

- The page itself never scrolls.
- No text selection or double-tap zoom while playing.
- No hover-dependent affordances.
- Pointer capture on drag, and a pointer that leaves the window must not leave a die stuck to the cursor.

---

## 15. Suggested default state

On first launch:

- Dice: 2
- Sound: on
- Haptics: on where supported
- Shake sensitivity: normal
- Dice at rest, no total shown, waiting for the first shake

---

## 16. Implementation constraints

- Static files, deployable to GitHub Pages, no build step.
- ES modules; the page must be served over HTTP(S), and motion needs HTTPS specifically.
- No physics library, no rendering library, no framework — unless a simpler approach has been built first and shown to be inadequate.
- Suggested module split:

| Module | Responsibility |
| --- | --- |
| `sensors.js` | Permission flow, normalisation, filters, `tilt` / `shakeEnergy` / `isStill` |
| `sim.js` | Bodies, fixed-step integration, collisions, sleeping — no DOM, no sensors |
| `dice.js` | Fair face draw, tumble and settle orientation |
| `render.js` | Box and cube rendering via CSS 3D transforms |
| `sound.js` | Web Audio clicks and haptics |
| `app.js` | State machine, controls, persistence |

`sim.js` must be drivable from synthetic input so that physics and fairness can be tested headlessly, with no device and no sensors.

---

## 17. Testing notes

- Physics, sleeping, fairness and the pointer fallback are all testable in a headless browser by dispatching synthetic `DeviceMotionEvent`s and pointer events.
- Distribution must be verified over a large number of automated rolls, per die and in aggregate.
- Motion permission, real shake feel, and haptics can only be verified on real hardware, over HTTPS. Expect to publish to GitHub Pages to test, and expect the thresholds in section 7 to change afterwards.
- Check at least: iOS Safari, Android Chrome, and one desktop browser. Landscape and portrait on each.

---

## 18. Acceptance criteria for v0.1

1. Opens on current iOS Safari and Android Chrome and reaches a playable state in one tap.
2. Shaking the device throws the dice, with an impulse that follows how hard it was shaken.
3. Tilting the device makes the dice slide toward the low edge.
4. Dice collide with the walls and with each other, and stay inside the box.
5. Setting the device down settles all dice within about a second, with no creep or jitter afterwards.
6. One, two and three dice all work, and all fit comfortably in the box.
7. Face values come from `crypto.getRandomValues` and pass a flat-distribution test over thousands of automated rolls.
8. The total is shown only when every die is at rest, and clears as soon as they move.
9. Denying motion permission still leaves a fully playable, equally fair toy.
10. Desktop pointer flick works.
11. Collision sound is present, proportional, and switchable.
12. Preferences persist; the last result does not.
13. Portrait and landscape both work on phone and tablet, with no page scrolling.
14. The result is available to assistive technology as text.
15. No backend and no network requests after load.

---

## 19. Open questions

Decisions worth settling before implementation, with a recommendation for each:

1. **Where the number comes from.** Recommended: cryptographic draw at settle, with the physics deciding only where and when. The alternative — letting an approximate simulation choose the face — looks purer and is almost certainly biased.
2. **Rendering.** Recommended: CSS 3D cubes. WebGL would look better and costs a dependency and a lot of code for a toy this small.
3. **Trigger.** Recommended: shaking rolls directly, with no arm-the-roll step, plus tap and flick as always-available fallbacks.
4. **Sound default.** On is livelier; off is safer in a quiet room. Currently specified as on; worth a second opinion.
5. **Dice appearance.** One tasteful default is specified. Colour choices are explicitly out of scope for v0.1.
