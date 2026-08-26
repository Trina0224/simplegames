# Blinds — Product Specification

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
3. **The frame** — a restrained window frame and sill at the edges, with the cord along one side.
4. **Two controls** — camera on/off, and front/rear swap where more than one camera exists. Small, translucent, in a bottom corner, never over the middle of the window.

There is no other chrome. In particular there is nothing that resembles a shutter button, because there is nothing behind it.

---

## 6. Blind geometry

This is the heart of the toy, and it is close to free.

- The blind has a **pitch** `P`: the vertical distance between slat centre lines.
- Each slat is an element of height `P`, full width, with its centre at `y = (i + 0.5) · P`, transformed by `rotateX(θᵢ)` about its own centre line, inside a container with a modest `perspective`.
- At `θ = 0°` a slat covers exactly its own pitch, so the slats tile the window and the view is fully blocked.
- At angle `θ` a slat's projected height is `P · cos θ`, so the gap it leaves is `P · (1 − cos θ)`.

Coverage therefore falls out of the geometry instead of being faked with opacity. Fully edge-on would be 90°; cap the maximum at roughly 78–82° so a slat still reads as a slat and keeps a sliver of shading.

### Slat count

`slats = clamp(round(windowHeight / targetPitch), 12, 44)`, with `targetPitch` around 26–34 CSS px. About 30 slats on a typical phone. Recompute on resize and orientation change; `P` is then `windowHeight / slats` so the blind always fills the window exactly.

Add a hair to the slat height (about 1–2%) so sub-pixel rounding never opens a hairline seam through a closed blind.

### Slat appearance

- A vertical gradient across the slat's height to suggest a curved profile.
- Brightness driven by angle, roughly `0.72 + 0.45 · cos θ`, so tilting a slat catches the light.
- A darker line along the lower edge for separation, and a soft shadow cast onto the video behind.
- One tasteful default finish. Colour options are out of scope.

---

## 7. Slat simulation

Each slat is one degree of freedom: an angle `θ` and an angular velocity `ω`. That is the whole simulation.

### Target angle

```text
pryᵢ  = A_max · max over active pointers of exp(−(dᵢ / σ)²)
        where dᵢ = |pointer.y − slatCentreᵢ| / P, in slat widths
Tᵢ    = max(cordAngle, pryᵢ)
```

- `σ ≈ 1.6` slats, so a finger opens a band about three or four slats tall.
- `max` over pointers rather than a sum, so two nearby fingers cannot push past `A_max`.
- Only the vertical distance matters. A real slat tilts along its whole length when you push one end, so a band opening across the full width is the physically honest result, not a simplification to apologise for.

### Integration

Fixed timestep, decoupled from `requestAnimationFrame`:

```text
ω += (k · (Tᵢ − θᵢ) − c · ω) · dt
θᵢ += ω · dt
```

Starting points, to be tuned by feel: `k ≈ 380`, `c ≈ 22` — slightly under-damped, so releasing a finger gives one small overshoot and a settle rather than a dead drop.

### String coupling

Real slats hang from the same ladder cord. After integration, one smoothing pass across neighbours:

```text
θᵢ += κ · (θᵢ₋₁ + θᵢ₊₁ − 2 · θᵢ)     with κ ≈ 0.08
```

This is a Laplacian smoothing step, it costs one loop, and it is most of what makes the blind feel like an object rather than a row of independent flaps.

Clamp to `[0, A_max]` at the end of each step.

### Idle

When every slat is within a small epsilon of its target with negligible velocity, stop stepping and stop writing to the DOM until the next input. A closed blind sitting on a table should cost nothing.

### The cord

A drag along the cord sets `cordAngle` and it stays there, the way a real blind does. Finger pressure on the slats is temporary and always springs back to `cordAngle`.

`cordAngle` is state, not a preference: the app always opens with the blind closed.

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
| Drag the cord | Sets the resting tilt of the whole blind |
| The open/close control | Toggles the blind fully open or fully closed |

Nothing else. No pinch, no double-tap, no long-press.

Pointer handling must use pointer capture, tolerate a pointer that leaves the window, and never leave a gap stuck open after a lost `pointerup`.

---

## 11. Performance

The single hardest requirement in this project is that the gap tracks the finger without lag.

- In the animation loop, write only `transform`, `filter` and `opacity`. Never read layout, never toggle classes, never change anything that triggers style recalculation per slat per frame.
- One `requestAnimationFrame` loop for everything, with all DOM writes batched at the end.
- Promote slats with `will-change: transform` only while the blind is animating, and drop it when idle — thirty permanently promoted layers is a lot of GPU memory on an old phone.
- Cap the physics substeps per frame so a stalled tab cannot produce a spiral of catch-up work.
- Budget: a frame of simulation plus DOM writes for 40 slats should be well under a millisecond.

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
- Cord angle: 0°

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
- Simulation: assert that a pry opens a band of the expected height, that two pointers open two gaps, that release returns every slat to the cord angle, and that the blind reaches idle.
- Privacy: fail the suite if any network request is made after load, and if `MediaRecorder`, `captureStream` or a canvas readback of the video ever appears.
- Lifecycle: assert that tracks are stopped when the page is hidden.
- Layout: portrait, landscape, phone and tablet viewports, with no page scrolling.

What still needs a real device: how the spring actually feels under a thumb, how bright the camera looks through a narrow gap in daylight, and whether the clack is charming or irritating.

---

## 18. Acceptance criteria for v0.1

1. Opens on current iOS Safari and Android Chrome and reaches a live blind in one tap.
2. A closed blind completely hides the camera view, with no seams, at any slat count.
3. Dragging a finger opens a gap that follows it with no perceptible lag.
4. Several fingers open several gaps.
5. Releasing springs the slats shut with a small overshoot and a settle.
6. The cord sets a resting tilt that holds.
7. The camera view is live, cropped to cover, and correctly oriented; the front camera is mirrored and the rear is not.
8. Camera off stops the tracks and clears the operating system's camera indicator.
9. Hiding the page stops the tracks; returning restores them.
10. Denying the camera leaves a fully working blind with the fallback backdrop.
11. No network request is made after load, and nothing from the stream is ever captured.
12. The blind goes idle and stops writing to the DOM when nothing is happening.
13. Portrait and landscape both work on phone and tablet, with no page scrolling.
14. The state is described in text for assistive technology, and a control opens and closes the blind without a drag.

---

## 19. Open questions

1. **Is the cord worth it in v0.1?** It is authentic and cheap, but the toy might be purer with nothing but finger pressure. Currently specified as included.
2. **Sound default.** Specified as on and quiet; a clack on every slat close may wear thin faster than it charms.
3. **Does horizontal finger position matter?** Currently no: a whole slat tilts. Making a slat bend around the finger's x position would mean splitting every slat into segments, multiplying the element count, for a subtlety most people will not notice.
4. **How far should a pry open?** `A_max` of about 80° shows the room clearly. A smaller maximum makes peeking feel more furtive, which may be the better toy.
