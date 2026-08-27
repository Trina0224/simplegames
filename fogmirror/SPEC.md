# Fog Mirror — Product Specification

## 1. Summary

Fog Mirror turns a phone or tablet into a convincing steamed-up sauna/bathroom mirror.

The live **front-facing camera** is the reflection. A simulated condensation layer covers the mirror. The user can wipe it with a finger, draw a smiley face or words, watch displaced moisture gather into droplets, and see larger droplets merge and run according to the device's real physical orientation.

A **Steam / Re-fog** control covers the mirror again. Re-fogging does not reset the surface completely: recent wet trails and wiped regions retain subtle moisture memory, so later condensation gathers and flows preferentially along them.

The goal is not a drawing app with a fog texture. The goal is to recreate the small physical behaviors that make a real sauna mirror recognizable.

---

## 2. Primary experience

1. User opens Fog Mirror.
2. Front camera permission is requested after an explicit tap.
3. Motion/orientation permission is requested from a user gesture where the platform requires it.
4. The screen becomes a horizontally mirrored live reflection.
5. The reflection is heavily obscured by dense condensation.
6. User drags a finger and clears a wet path through the fog.
7. Moisture pushed away from the finger accumulates along the stroke edge.
8. Some regions bead into drops.
9. Small drops may remain pinned; larger drops crawl/run in the physical gravity direction projected onto the mirror.
10. Drops merge, accelerate, and leave clear wet trails.
11. Tilting or rotating the device changes the direction and strength of flow.
12. User presses Steam / Re-fog and the fine mist grows back while previous wet history subtly remains.

---

## 3. Device priorities

### Tier 1 — iPhone

- portrait and landscape
- front camera
- motion/orientation sensing
- finger drawing and broad swipes
- realtime water simulation

### Tier 1 — iPad / iPad mini

- larger mirror area
- multi-touch interaction
- orientation-aware water flow
- enough performance headroom for a larger droplet field

### Tier 2 — Android phones/tablets

Use the same standard Web APIs where supported.

### Desktop

Desktop may use a webcam and pointer input. Since physical orientation sensing may be unavailable, screen-down gravity is an acceptable fallback there.

---

## 4. Camera behavior

Use the front-facing camera by default:

```js
getUserMedia({
  video: { facingMode: 'user' },
  audio: false
})
```

The preview must be horizontally mirrored.

### Privacy

The camera is view-only.

Must NOT:

- photograph
- record video
- create downloadable blobs
- upload frames
- send frames to any backend

Camera tracks must be stopped when:

- camera is disabled
- page becomes hidden
- user navigates away

If camera permission is denied, the condensation simulation must remain usable over a fallback background.

---

## 5. Rendering model

Conceptual layer order:

```text
UI
↓
large droplet highlights / edges
↓
fine condensation / blur / scattering
↓
water refraction and streak distortion
↓
mirrored front camera
```

The water simulation and optical rendering should be separable.

A GPU/WebGL path is preferred for convincing blur, scattering and refraction if Canvas 2D is not sufficient.

---

## 6. Surface fields

Maintain at least these conceptual quantities:

- `fog(x,y)` — fine condensation density / optical haze
- `water(x,y)` — liquid water accumulated on the surface
- `wetness(x,y)` — persistent surface wetting / trail memory
- visible droplet particles — coarse drops large enough to render individually
- filtered gravity vector `(gx, gy)` in screen/glass coordinates

Optional fields may include local pinning strength, surface heterogeneity, or temperature/fog tendency.

---

## 7. Fog optical appearance

A real sauna mirror is not an even translucent white rectangle.

The fog layer should include:

- local blur of the reflection
- lower local contrast
- milky scattering
- low-frequency variation in fog density
- high-frequency microdroplet grain
- irregular clear/fog boundaries
- clearer wet streaks
- refractive distortion around larger drops

### Hard requirement

The accepted effect must not be only:

```text
white overlay + alpha erase brush
```

That is acceptable only as an early prototype.

---

## 8. Initial fog state

After activation, the mirror starts heavily fogged:

- broad face/body shapes are vaguely visible
- facial detail is obscured
- fog density varies naturally
- a few small beads may already exist

It should look like a mirror in a hot room, not a CSS blur filter.

---

## 9. Finger wiping

### Slow stroke

A slow fingertip stroke should:

- clear fine fog along a soft footprint
- expose the reflection underneath
- push moisture toward stroke edges
- leave the center wet rather than perfectly dry
- preserve a smiley face, name or heart long enough to enjoy

The finger is redistributing moisture, not erasing pixels.

### Fast broad swipe

Velocity matters.

A fast long swipe should:

- clear a wider region
- impart lateral momentum to surface water
- dislodge pinned moisture
- create/coalesce many visible droplets
- seed runoff along the leading/lower edge
- allow gravity to dominate after the gesture ends

Multi-touch is desirable.

---

## 10. Droplet physics

### Nucleation

Visible drops should form where enough liquid accumulates, especially:

- stroke edges
- existing wet trails
- locally wet regions
- stable surface imperfections
- near existing droplets

Avoid uniform spacing.

### Pinning

Small drops can remain stationary even when the mirror is vertical.

Conceptually:

```text
if gravityAlongGlass * dropletMass <= localPinning:
    remain pinned
else:
    move
```

This is essential. Without pinning, the effect will look like rain on a window rather than condensation on a mirror.

### Motion

Once moving:

- gravity accelerates the drop along the glass
- surface drag limits speed
- old wet trails reduce resistance
- local surface heterogeneity causes small path deviations
- larger drops generally move more readily and faster

### Merge

When drops touch, they should usually merge approximately conserving water volume.

Merged drops are larger and therefore more likely to overcome pinning.

### Trails

Moving drops leave a trail with:

- reduced fog
- elevated wetness
- residual water

That trail fades optically faster than it loses physical wetness memory.

### Old-trail reuse

Future drops should prefer old wet paths subtly, for example through lower pinning/friction.

---

## 11. Physical gravity and orientation — REQUIRED FOR v0.1

This is a core simulation requirement.

### Sensor source

Preferred signal:

```text
DeviceMotionEvent.accelerationIncludingGravity
```

Use a **low-pass filter** to estimate the slowly varying gravity vector.

Do not feed raw acceleration directly into droplet motion. Hand tremor, taps and device movement must not make water jitter chaotically.

Conceptually separate:

```text
low-frequency component  -> physical gravity / device pose
high-frequency residual  -> hand motion / shake / inertial disturbance
```

### Screen-coordinate transform

The sensor vector is not automatically in the app's visual coordinate system.

Transform it using the current screen orientation, preferably from:

```text
screen.orientation.angle
```

with a platform-appropriate fallback where necessary.

The resulting `(gx, gy)` must represent the component of gravity along the visible mirror plane.

### Required behavior

- **Device upright:** droplets run toward physical down.
- **Device tilted diagonally:** droplets run diagonally.
- **Device rotated 90°:** moving and newly released water gradually changes direction.
- **Device nearly flat:** in-plane gravity approaches zero; droplets slow, pin and pool rather than continuing toward screen-bottom.
- **Orientation changes:** must not abruptly teleport or flip droplets; acceleration changes naturally through the next simulation steps.

### Magnitude matters

Do not normalize `(gx, gy)` to unit length unconditionally.

The magnitude of the in-plane gravity component must affect flow strength. When the screen is nearly horizontal, the projected gravity should be weak.

### Permission and fallback

Some platforms require motion permission from a direct user gesture.

The app must:

- request permission only when needed
- explain it briefly as needed for realistic water direction
- continue working if permission is denied

Fallback when motion sensing is unavailable/denied:

```text
(gx, gy) = screen-down
```

This fallback keeps the toy usable, but orientation-aware gravity is the intended Tier-1 mobile behavior.

### Optional later inertial effects

The high-frequency acceleration residual may later:

- knock large drops loose
- temporarily bend trails
- move pooled water after a strong device motion

This is not required for the first implementation and must never destabilize ordinary gravity behavior.

---

## 12. Droplet visual appearance

Visible drops should not be plain transparent circles.

Aim for:

- refracted camera content inside the drop
- bright highlight on one edge
- darker meniscus/contrast edge opposite it
- rounder pinned shape
- elongated moving shape
- slight deformation during merge

Large streams may be represented by connected wet trails rather than thousands of particles.

---

## 13. Re-fog / Steam

Steam should restore fine condensation over roughly 1–3 seconds rather than replacing the frame instantly.

On activation:

1. fog density grows
2. clear drawings become hazy
3. residual water and wetness remain
4. old trails influence new droplet formation
5. new microdroplets can appear

Re-fog does **not** reset surface history.

---

## 14. Natural re-condensation

Wiped regions may slowly fog again without pressing Steam.

Keep this much slower than manual re-fog so drawings remain enjoyable.

---

## 15. Large-hand gesture / water release

A broad hand sweep is inferred from some combination of:

- high pointer velocity
- long swipe distance
- multiple touches
- large swept area

On detection:

- clear the region
- push water in swipe direction
- create/coalesce droplets near the leading edge
- temporarily reduce pinning in disturbed areas
- then let physical gravity take over

The result should produce a satisfying burst of many beads and runoff.

---

## 16. Breath / "haaa" experiment

Breath sensing is experimental and **not required for v0.1**.

A browser has no reliable web humidity sensor, and ordinary warm breath is not directly visible to a normal front camera.

### Preferred later heuristic

Do not depend on continuous mouth tracking.

A more practical hybrid is:

1. detect that a face rapidly grows larger / approaches the screen
2. estimate a coarse target region from recent face motion
3. detect an exhalation-like broadband microphone signal
4. if those events overlap, emit one large local condensation patch near the inferred region

Precision is not the goal. A believable large fog event is enough.

If implemented:

- microphone permission is separate and optional
- all analysis stays local
- no audio is stored or transmitted
- normal mirror use never requires microphone permission

### Breath visual effect

A breath event should produce:

- a broad soft elliptical fog patch
- slight upward drift at first
- rapid local fog increase
- later conversion into microdroplets/water
- stronger accumulation after repeated breaths in the same area

Provide a manual test trigger during development so this visual behavior can be tuned independently of detection.

---

## 17. Implementation architecture

Recommended modules:

```text
src/
  app.js
  camera.js
  orientation.js
  input.js
  condensation.js
  droplets.js
  render.js
  breath.js        # optional / experimental
```

### Responsibilities

- `camera.js` — front camera acquisition/lifecycle only
- `orientation.js` — motion permission, gravity filtering, orientation transform
- `input.js` — pointer/multi-touch paths and gesture velocity
- `condensation.js` — fog/water/wetness field evolution
- `droplets.js` — visible drops, pinning, merge, gravity, trails
- `render.js` — blur/refraction/compositing
- `app.js` — state and main loop
- `breath.js` — optional local face/audio heuristic

A hybrid simulation is encouraged:

- low-resolution field for fog/water/wetness
- discrete particles for visible large droplets
- GPU shader for camera blur/refraction/compositing

Do not simulate millions of literal microdroplets.

---

## 18. Performance

- target smooth realtime use on current iPhone/iPad Safari
- stable 30 fps is preferable to unstable 60 fps
- simulation resolution may be much lower than display resolution
- camera processing need not use sensor-native resolution
- bound the number of visible droplet particles
- use measured `dt`, not frame-count assumptions
- clamp very large `dt` after suspension
- pause expensive work and stop camera tracks when hidden

---

## 19. Surface heterogeneity

Generate a stable low-amplitude map that slightly affects:

- nucleation probability
- local pinning
- flow direction

Keep it fixed during a session so the mirror feels like one persistent physical surface.

The measured gravity vector remains dominant; heterogeneity must not turn flow into random wandering.

---

## 20. UI

The mirror occupies almost the entire viewport.

Visible controls should remain minimal, for example:

```text
[ Steam ]          [ ⋯ ]
```

Settings may contain:

- Camera on/off
- motion/orientation status or permission retry
- Fog amount
- Re-condensation speed
- Water amount / wetness feel
- Reset surface
- experimental Breath mode later

No shutter button.

---

## 21. Persistence and privacy

Do not persist camera imagery or audio.

Small preferences may use `localStorage`.

Surface water state does not need to survive page reload.

---

## 22. Development milestones

### Milestone 1 — interaction prototype

- front camera mirror
- temporary fog layer
- finger clears fog
- Steam restores it

This milestone validates layout only; visual quality is not considered done.

### Milestone 2 — believable condensation

- nonuniform fog
- pushed moisture at stroke edges
- wetness memory
- gradual re-condensation

### Milestone 3 — droplets and gravity

- orientation permission / gravity vector
- low-pass filtering
- screen-coordinate transform
- nucleation
- pinning
- orientation-aware motion
- merging
- trails
- old-trail preference

### Milestone 4 — optical polish

- refraction
- droplet highlights
- wet streak distortion
- improved fog scattering/blur

### Milestone 5 — gesture drama

- fast broad swipe produces many mobile droplets/runoff
- multi-touch tuning

### Experimental milestone — breath

- manual local-fog prototype
- face-approach heuristic
- microphone exhalation experiment
- hybrid event only if reliable and privacy-preserving

---

## 23. Acceptance criteria for v0.1

v0.1 is ready when all of these are true:

1. The live front-camera image behaves like a mirror.
2. Camera lifecycle is privacy-safe and stops correctly.
3. The initial mirror looks genuinely steamed/fogged, not merely gray-transparent.
4. Finger drawing can create a recognizable smiley face or text.
5. A stroke redistributes moisture rather than acting only as an alpha eraser.
6. Cleared regions slowly re-condense.
7. Water gathers preferentially at plausible locations rather than uniformly.
8. Visible droplets have multiple sizes.
9. Tiny drops can remain pinned.
10. Larger drops move only when gravity overcomes pinning.
11. On supported mobile devices, droplets follow the physical gravity direction rather than fixed screen-down.
12. Tilting the device diagonally produces diagonal water flow.
13. Rotating the device changes flow direction plausibly.
14. Holding the device nearly flat substantially reduces in-plane flow.
15. Drops merge.
16. Moving drops leave wet/clear trails.
17. Existing trails influence later flow.
18. Re-fogging restores mist without deleting wetness history.
19. Fast broad swipes trigger visibly larger water movement/runoff.
20. Interaction remains smooth on an iPhone/iPad-class device.
21. The app works as a static GitHub Pages site without backend services.
22. No camera imagery is captured, recorded, stored, or uploaded.
23. If motion permission is unavailable or denied, screen-down fallback keeps the toy usable.

Breath sensing is specifically **not** required to satisfy v0.1.
