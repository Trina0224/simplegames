# Blinds — Product Specification

> **Status: v0.1 built and shipped.** The numbers below are as-built rather than
> proposed, and have survived one round of real-device play. Still unverified on
> hardware: how the spring feels under a thumb over a long session, how bright the
> view is through a narrow gap in daylight, and whether the clack charms or grates.

## 1. Summary

Blinds fills the screen with a closed venetian blind. Behind it is the device's live camera view.

Pressing a finger against the slats pries them apart around that finger, revealing the real world through the gap. Lifting the finger lets them fall shut.

Nothing is captured. There is no shutter, no gallery, no upload, and no network traffic after the page loads.

---

## 2. Primary use case

There isn't one, and that is deliberate. It is a fidget.

The nearest thing to a use is the moment it produces: the screen stops being a screen and becomes a window into the room you are already sitting in. It should be satisfying enough to keep poking at for thirty seconds and forget about for a week.

---

## 3. Design goals

### Primary goals

- The blind feels like a physical object: slats have weight, spring back, and drag their neighbours with them.
- The gap follows the finger with no perceptible lag.
- The camera view behind is bright, live, and correctly cropped.
- Trustworthy by construction: nothing is captured, and the source is short enough to verify.
- Fully playable with the camera denied or absent.
- Static site, hostable on GitHub Pages, no backend.

### Non-goals for v0.1

- Photography of any kind.
- Filters, effects, or analysis of the video.
- Other window dressings — vertical blinds, curtains, shutters.
- AR or 3D.
- Any settings beyond two switches.

---

## 4. Device priorities

### Tier 1 — phones (iPhone and Android)

Held in one hand, poked with the other. Portrait first, landscape supported.

### Tier 1.5 — iPad

A bigger window and more slats. Two-handed poking; multi-touch matters more here.

### Tier 2 — desktop

Works with a mouse or trackpad and a webcam. This is where most development and automated testing happens, since `localhost` counts as a secure context and Chromium can supply a synthetic camera.

---

## 5. Main screen

```text
┌────────────────────────────────────────┐
│ ══════════════════════════════════════ │
│ ══════════════════════════════════════ │
│ ══════════════════════════════════════ │
│ ═════════                    ╲╲        │
│                ← the room behind →     │  ← finger here
│ ═════════                    ╱╱        │
│ ══════════════════════════════════════ │
│ ══════════════════════════════════════ │
│ ══════════════════════════════════════ │
│                                        │
│                          [◉]  [⇄]      │
└────────────────────────────────────────┘
```

Layers, back to front:

1. **The camera layer** — a `<video>` covering the window.
2. **The blind** — horizontal slats, each rotating about its own centre line.
3. **The frame** — a restrained window frame and sill at the edges.
4. **A few small controls** — camera on/off, front/rear swap where more than one camera exists, sound, and an open/close control so the toy is usable without a drag. Small, translucent, in a bottom corner, never over the middle of the window.

There is no other chrome. In particular there is nothing that resembles a shutter button, because there is nothing behind it.

---

## 6. Blind geometry

This is the heart of the toy, and it is close to free.

- The blind has a **pitch** `P`: the vertical distance between slat centre lines.
- Each slat is an element of height `P`, full width, with its centre at `y = (i + 0.5) · P`, transformed by `rotateX(θᵢ)` about its own centre line, inside a container with a modest `perspective`.
- At `θ = 0°` a slat covers exactly its own pitch, so the slats tile the window and the view is fully blocked.
- At angle `θ` a slat's projected height is `P · cos θ`, so the gap it leaves is `P · (1 − cos θ)`.

Coverage therefore falls out of the geometry instead of being faked with opacity. Fully edge-on would be 90°; **the maximum is 80°**, so a slat still reads as a slat and keeps a sliver of shading while the room behind is clearly visible.

### Slat count

`slats = clamp(round(windowHeight / targetPitch), 6, 22)`, with `targetPitch` around 60 CSS px. About 14 slats on a typical phone — few enough that a slat reads as a real object rather than a stripe. Recompute on resize and orientation change; `P` is then `windowHeight / slats` so the blind always fills the window exactly.

Add a hair to the slat height (about 1–2%) so sub-pixel rounding never opens a hairline seam through a closed blind.

### Slat appearance

- A vertical gradient across the slat's height to suggest a curved profile.
- Brightness driven by angle: `0.58 + 0.42 · cos θ`, so a shut slat sits at full value and an open one falls into shadow. Brighter curves made the blind read as flat white paper.
- A darker line along the lower edge for separation, and a soft shadow cast onto the video behind.
- One tasteful default finish. Colour options are out of scope.

---

## 7. Slat simulation

Each slat is one degree of freedom: an angle `θ` and an angular velocity `ω`. That is the whole simulation.

### Target angle

```text
Tᵢ = A_max · max over active pointers of exp(−(dᵢ / σ)²)
     where dᵢ = |pointer.y − slatCentreᵢ| / P, in slat widths
     and A_max = 80°
```

- `σ ≈ 1.2` slats, so a finger opens the slat it is on plus its immediate neighbours. With a 60 px pitch that is a peek roughly a finger and a half tall — the falloff is tuned in slats, so it has to shrink whenever the pitch grows.
- `max` over pointers rather than a sum, so two nearby fingers cannot push past `A_max`.
- Only the vertical distance matters. A real slat tilts along its whole length when you push one end, so a band opening across the full width is the physically honest result, not a simplification to apologise for.

### Integration

Fixed timestep, decoupled from `requestAnimationFrame`:

```text
ω += (k · (Tᵢ − θᵢ) − c · ω) · dt
θᵢ += ω · dt
```

Stiffness and damping both follow how strongly a finger is on the slat, because a gap
that lags the finger feels broken while a release that does not wobble feels dead:

```text
k    = 380 → 2400   as the finger's weight goes 0 → 1
ζ    = 0.55 → 0.95  over the same range
c    = 2 · ζ · √k
```

At rest the blind is under-damped, so letting go gives one small overshoot and a settle.
Under a finger it is nearly critically damped and four times stiffer, so the gap tracks the
pointer. Under `prefers-reduced-motion` the resting ζ becomes 1 and the overshoot disappears.

### String coupling

Real slats hang from the same ladder cord. After integration, one smoothing pass across
neighbours — but of the **error**, not the angle:

```text
eᵢ  = θᵢ − Tᵢ
θᵢ  = Tᵢ + eᵢ + κ · (eᵢ₋₁ + eᵢ₊₁ − 2 · eᵢ)     with κ = 0.08
```

Smoothing the angle directly is the obvious version and it is wrong. Diffusion flattens the
peak, which shows up as a steady-state error: a slat held under a finger reached only 66°
instead of the 80° it was asked for, so every peek was a third smaller than specified.

Smoothing the error leaves the steady state untouched — when every slat sits on its target
the correction is zero — while still coupling the transients, so a release ripples along the
blind. It is one Laplacian pass either way, and it is most of what makes the blind feel like
one object rather than a row of independent flaps.

Clamp to `[0, A_max]` at the end of each step.

### Idle

When every slat is within a small epsilon of its target with negligible velocity, stop stepping and stop writing to the DOM until the next input. A closed blind sitting on a table should cost nothing.

### As-built constants

Everything tunable, in one place. `blind.js` and `render.js` are the only files that hold
these, and the names match.

| Constant | Value | File |
| --- | --- | --- |
| `MAX_ANGLE` | 80° | `blind.js` |
| `SIGMA` | 1.2 slats | `blind.js` |
| `K_REST` / `K_DRIVE` | 380 / 2400 | `blind.js` |
| `Z_REST` / `Z_DRIVE` | 0.55 / 0.95 | `blind.js` |
| `COUPLING` | 0.08 | `blind.js` |
| `STILL_ANGLE` / `STILL_VEL` | 0.05° / 0.5°/s | `blind.js` |
| `TARGET_PITCH` | 60 px | `render.js` |
| `MIN_SLATS` / `MAX_SLATS` | 6 / 22 | `render.js` |
| `EPSILON` | 0.05° | `render.js` |
| timestep / max substeps | 1/120 s / 6 | `app.js` |
| clack spacing | 28 ms | `sound.js` |

---

## 8. Camera

### Acquisition

```js
getUserMedia({
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
})
```

`audio: false` is explicit and non-negotiable. This app never asks for a microphone.

The `<video>` element carries `playsinline`, `muted` and `autoplay`, and `play()` is called from inside the opening gesture. Without `playsinline`, iOS Safari takes the video fullscreen and the blind vanishes behind it.

`getUserMedia` requires a secure context: HTTPS in the field, `localhost` during development.

### Presentation

- `object-fit: cover`, so the view crops rather than letterboxes, recomputed on orientation change.
- Mirror the front camera (`scaleX(-1)`), do not mirror the rear one. This is what people expect from every other camera app.

### Switching

Show the front/rear control only when `enumerateDevices` reports more than one video input. Switching stops the current tracks before requesting the other camera; two live streams should never coexist.

### Lifecycle

- Stop the **tracks**, not just the element, when the page is hidden, when the user switches the camera off, and on unload. Pausing a video leaves the camera indicator lit, which makes the app look like it is lying.
- Re-acquire when the page becomes visible again, unless the user switched it off deliberately.

### Failure modes

| Error | Message |
| --- | --- |
| `NotAllowedError` | Permission was declined. Offer one quiet retry. |
| `NotFoundError` | No camera on this device. |
| `NotReadableError` | Another app is using the camera. |
| Insecure context | Needs HTTPS; say so plainly. |

In every case the blind stays fully functional, with the fallback backdrop behind it, and the app does not nag.

### Fallback backdrop

A slow, calm animated gradient — an implied sky and a drifting light — drawn in CSS. It should be pleasant enough that peeking at it still feels worth doing.

---

## 9. Privacy

Requirements, not aspirations:

- No `canvas.drawImage` of the video, no `captureStream`, no `MediaRecorder`, no `toDataURL`, no blobs derived from the stream.
- No network request of any kind after the initial page load. This is directly testable by failing the test suite if any request is issued.
- No microphone, ever.
- Tracks stopped whenever the view is not on screen.
- A one-line statement in the UI and a short section in the README explaining that the stream is displayed and discarded, and inviting the reader to check — the source is a few hundred lines.

---

## 10. Interaction

| Gesture | Result |
| --- | --- |
| Press and drag on the slats | Pries a gap open around the pointer, following it |
| Several fingers | Each opens its own gap |
| Release | Springs shut with a small overshoot |
| The open/close control | Holds the blind fully open or lets it fall shut, for anyone who cannot drag |

Nothing else. No pinch, no double-tap, no long-press.

Pointer handling must use pointer capture, tolerate a pointer that leaves the window, and never leave a gap stuck open after a lost `pointerup`.

---

## 11. Performance

The single hardest requirement in this project is that the gap tracks the finger without lag.

- In the animation loop, write only `transform`, `filter` and `opacity`. Never read layout, never toggle classes, never change anything that triggers style recalculation per slat per frame.
- One `requestAnimationFrame` loop for everything, with all DOM writes batched at the end.
- Promote slats with `will-change: transform` only while the blind is animating, and drop it when idle — twenty-odd permanently promoted layers is a lot of GPU memory on an old phone.
- Cap the physics substeps per frame so a stalled tab cannot produce a spiral of catch-up work.
- Budget: a frame of simulation plus DOM writes for a full 22 slats should be well under a millisecond.

---

## 12. States

```text
start ──tap──▶ live(closed) ⇄ peeking
                  │   ▲
        camera off│   │camera on
                  ▼   │
              cameraOff
```

`cameraDenied` and `noCamera` behave exactly like `live`, with the fallback backdrop behind the slats.

---

## 13. Sound

- A soft wooden clack when a slat arrives back at closed, synthesised with the Web Audio API.
- Amplitude scales with the impact speed; below a small speed there is no sound.
- Rate-limited across slats so a fast fidget rattles rather than clips.
- Switchable, and the choice persists. Choose the default deliberately and record it in section 15.

---

## 14. Layout and responsiveness

- Full screen, never scrolls, respects safe-area insets.
- Slats are horizontal in every orientation, because that is what a venetian blind is.
- Slat count and pitch recomputed on resize and orientation change, with the current angles carried across so the blind does not visibly rebuild.
- Controls stay in a bottom corner, clear of the middle of the window, at a comfortable touch size.
- No text selection, no double-tap zoom, no hover-dependent affordances.

---

## 15. Suggested default state

On first launch:

- Blind: closed
- Camera: rear, on, after the opening tap
- Sound: on, quiet

---

## 16. Implementation constraints

- Static files, deployable to GitHub Pages, no build step.
- ES modules, served over HTTP(S). The camera specifically needs HTTPS or `localhost`.
- No framework, no WebGL, no physics library.
- Suggested module split:

| Module | Responsibility |
| --- | --- |
| `blind.js` | Slat angles, spring, coupling, pointer targets — no DOM, no camera |
| `render.js` | Building the slats and writing transforms |
| `camera.js` | Acquisition, switching, lifecycle, failure handling |
| `sound.js` | Synthesised clacks |
| `app.js` | State, controls, persistence, the frame loop |

`blind.js` must be drivable from synthetic pointer input so the feel can be regression-tested without a camera or a device.

---

## 17. Testing notes

Unlike a motion-sensor toy, almost all of this is testable headlessly:

- Chromium's fake media device supplies a synthetic camera, and permissions can be granted from the test harness, so the whole camera path runs end to end in automation.
- Geometry: assert that coverage follows `cos θ` and that a closed blind leaves no gap at any slat count.
- Simulation: assert that a pry opens a band of the expected height, that two pointers open two gaps, that release returns every slat to closed, and that the blind reaches idle.
- Privacy: fail the suite if any network request is made after load, and if `MediaRecorder`, `captureStream` or a canvas readback of the video ever appears.
- Lifecycle: assert that tracks are stopped when the page is hidden.
- Layout: portrait, landscape, phone and tablet viewports, with no page scrolling.

The suite that exists asserts: 14 slats at phone size; every slat's coverage is exactly 1
when shut; the camera reaches `live` at 1280×720 after the opening tap; one finger peaks at
about 78° and opens roughly 79 px of glass; two fingers open two separate gaps; release
returns every slat to zero, reaches idle and drops the layer promotion; the open/close
control works and announces itself; camera off leaves `stream === null` and shows the
fallback; hiding the page releases the tracks; a denied permission still opens the blind to
about 79°; rotation rebuilds the slats without page scrolling; and no request is made beyond
the app's own files.

What still needs a real device: how the spring actually feels under a thumb, how bright the
camera looks through a narrow gap in daylight, and whether the clack is charming or irritating.

---

## 18. Acceptance criteria for v0.1

All of these are met. Everything except 1 (real iOS and Android browsers) is verified by the
automated suite; 1 has been confirmed by hand.

1. Opens on current iOS Safari and Android Chrome and reaches a live blind in one tap.
2. A closed blind completely hides the camera view, with no seams, at any slat count.
3. Dragging a finger opens a gap that follows it with no perceptible lag.
4. Several fingers open several gaps.
5. Releasing springs the slats shut with a small overshoot and a settle.
6. The open/close control opens and closes the blind without a drag.
7. The camera view is live, cropped to cover, and correctly oriented; the front camera is mirrored and the rear is not.
8. Camera off stops the tracks and clears the operating system's camera indicator.
9. Hiding the page stops the tracks; returning restores them.
10. Denying the camera leaves a fully working blind with the fallback backdrop.
11. No network request is made after load, and nothing from the stream is ever captured.
12. The blind goes idle and stops writing to the DOM when nothing is happening.
13. Portrait and landscape both work on phone and tablet, with no page scrolling.
14. The state is described in text for assistive technology, and a control opens and closes the blind without a drag.

---

## 19. Decisions and remaining questions

Settled:

1. **No cord.** Finger pressure is the only way to open the blind, and it always springs back. An accessibility control can hold it open, but there is no everyday way to prop it.
2. **`A_max` is 80°.** Open enough to see the room clearly.
3. **A 60 px pitch, about 14 slats on a phone.** The first build used 30 px and about 30
   slats, which read as stripes rather than as a blind. Halving it was the first thing real
   play asked for. Note that `σ` is measured in slats, so it has to be retuned whenever the
   pitch changes — the two numbers are not independent.

Still open:

3. **Sound default.** Specified as on and quiet; a clack on every slat close may wear thin faster than it charms.
4. **Does horizontal finger position matter?** Currently no: a whole slat tilts. Making a slat bend around the finger's x position would mean splitting every slat into segments, multiplying the element count, for a subtlety most people will not notice.
