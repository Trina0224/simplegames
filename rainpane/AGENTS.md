# AGENTS.md — Rainpane

## Purpose

Rainpane is a touch-friendly browser simulation of rain striking and running down a pane of glass.

The experience is atmospheric rather than game-like. A user chooses a scene behind the glass — initially an included scene, a local image, or optionally the device camera — then adjusts rainfall from a light drizzle to a heavy storm. Rain accumulates on the glass, forms droplets, merges into larger drops and rivulets, and runs according to gravity while rain audio creates a relaxing ambience.

Primary targets:

- iPhone
- iPad / iPad mini
- modern Android phones/tablets when practical
- desktop browsers as a fallback target

Static hosting on GitHub Pages is preferred. No backend is required.

---

## Product principles

1. **The glass is the simulation surface.** Rain exists on a separate virtual pane in front of the selected scene.
2. **Physics is the feature.** Do not fake rainfall as only animated streak sprites.
3. **Water has mass.** Drops must grow by collecting water and by merging with other drops or flows.
4. **Coalescence matters.** Two nearby or intersecting rivulets should be able to become one connected flow.
5. **Runoff should evolve.** Drops generally become larger and faster as they descend through wetter regions.
6. **Rain intensity changes the whole system.** Drizzle versus storm should affect impact rate, drop-size distribution, accumulated water, sound density, and runoff behavior.
7. **Rendering and physics stay separate.** Simulation state should drive refraction/highlights; do not encode the physics only in drawing effects.
8. **Audio is part of the experience.** Rain sound should be layered and reactive, not just one loop with volume changed.
9. **Minimal UI.** Controls should fade into the background once the scene is running.
10. **Privacy first.** User images and camera video must stay local. No uploads, screenshots, recordings, or remote processing.

---

## Physics architecture

Rainpane should use a hybrid glass-surface model rather than a cloud of unrelated particles.

Recommended state:

- `water[x,y]` — liquid-water height / unresolved thin film on the glass
- `wet[x,y]` — persistent wetness / lower-pinning trail memory
- `flowId[x,y]` — low-resolution ownership/connectivity map for active/recent rivulets
- active `flowHeads[]` — a small set of mobile macroscopic drop/rivulet fronts
- optional stable `pinningNoise[x,y]` — fixed low-amplitude surface heterogeneity
- filtered gravity vector `(gx, gy, plane)`

A visible drop is not an isolated marble. Once mobile, it is the head/front of a connected wet body.

### Rain impact

Each rain impact should deposit water onto the glass rather than immediately create a long falling streak.

Impact behavior depends on rain intensity and drop size:

- light rain: many small pinned beads, sparse impacts
- moderate rain: more frequent impacts and more coalescence
- heavy rain: high impact density, thicker wet film, frequent connected runoff

A single impact may:

- add to `water`
- create or enlarge a pinned bead
- merge into an existing nearby flow
- briefly disturb local surface water

Do not create large drops from nowhere.

### Nucleation / visible bead formation

Visible beads should appear only where sufficient local water accumulates.

Prefer:

- feeding an existing nearby collector
- joining an existing rivulet
- creating a new visible bead only when a local basin has enough water

Avoid uniform spacing and avoid hundreds of unrelated decorative circles.

### Collection and growth

An active drop/flow head should collect:

- unresolved surface water from a catchment around it
- smaller visible beads in its path
- water from intersecting rivulets
- new rain impacts that hit sufficiently close to its connected body

Its mass must increase accordingly.

Expected qualitative behavior:

```text
small pinned bead
→ receives impacts / nearby water
→ grows
→ overcomes pinning
→ begins sliding
→ sweeps up water
→ becomes larger
→ reaches a higher terminal speed
```

### Merge rules

Support more than exact circular head overlap.

Required merge cases:

1. **head-head** — two visible drops overlap or nearly overlap
2. **head-body** — a moving head reaches another flow's connected trail/body
3. **body-body** — nearby rivulets join through connected wet regions

When flows merge:

- approximately conserve water mass
- combine momentum sensibly
- choose one dominant downstream head/front
- unify flow ownership/connectivity

The visual result should normally become one wider main flow instead of two parallel lines continuing forever.

### Pinning / contact-angle hysteresis

Small drops may remain stationary even on a vertical pane.

Use a force-style heuristic rather than only `radius > threshold`:

```text
drive ~= gravityAlongGlass * mobileMass
resistance ~= basePinning * dryFactor * heterogeneity * contactFactor
```

Wet trails and recent merge events should lower effective resistance.

### Motion

Physical gravity is the main direction.

Larger flows should generally:

- depin more easily
- collect from a wider region
- leave a wider trail
- move faster after they accumulate more mass

Use damping / terminal velocity. Do not let drops accelerate without bound.

### Trails / rivulets

A moving flow must write back into the glass state.

Trails should:

- retain residual water
- remain wetter than untouched glass
- be optically clearer / more refractive than dry glass
- guide later drops
- participate in merge tests
- gradually thin/fade rather than disappearing instantly

Do not represent a rivulet only as a drawn line disconnected from simulation state.

---

## Gravity

Rainpane should reuse the already field-tested iPad/iPhone DeviceMotion mapping from Fog Mirror rather than inventing a new orientation system.

Golden behavior:

- upright device -> water moves screen-down
- right edge physically down -> water moves screen-right
- left edge physically down -> water moves screen-left
- nearly flat -> in-plane gravity becomes weak and drops mostly pin/pool

Use `DeviceMotionEvent.accelerationIncludingGravity` with low-pass filtering and the known-good screen-space mapping from Fog Mirror's validated implementation. Do not add a second `screen.orientation` rotation unless a future real-device regression proves it necessary.

Desktop fallback may use fixed screen-down gravity.

---

## Scene/background modes

Initial supported modes:

1. built-in static scene(s)
2. user-selected local image
3. optional front/rear camera live scene

The glass simulation must be independent of the scene source.

### Local image privacy

User-selected images must remain in memory/local browser state only. Do not upload them.

### Camera privacy

If camera mode is implemented:

- request camera only after an explicit user action
- do not capture stills
- do not record video
- do not create downloadable blobs
- do not upload frames
- stop camera tracks when camera mode ends, document becomes hidden, or user leaves

---

## Rendering

The scene sits behind a virtual glass pane.

Recommended conceptual render order:

1. background scene / local image / camera
2. refraction and distortion derived from glass-water height gradients
3. large-drop / rivulet meniscus shading
4. partial Fresnel/specular highlights
5. optional distant lightning illumination
6. minimal UI

Avoid thick gray or white outlines around droplets.

Preferred cues:

- subtle local magnification/refraction inside large drops
- slight stretching of moving drops
- continuous transition between a flow head and its rivulet
- brighter edge highlight on part of a drop, not a complete cartoon ring
- heavier optical distortion in thicker water

Do not use expensive full-resolution CPU per-pixel simulation on mobile.

---

## Rain intensity

Expose a simple perceptual control such as:

```text
Drizzle — Light — Rain — Heavy — Storm
```

or a continuous slider with equivalent ranges.

Rain intensity should jointly control:

- impact frequency
- impact-size distribution
- probability of larger incoming drops
- accumulated water rate
- fraction of the pane covered by wet film
- active-flow density
- ambient rain audio density
- glass-impact audio density
- optional lightning/thunder probability at the strongest setting

Do not implement intensity as only visual opacity or audio volume.

---

## Audio architecture

Audio is optional until user interaction grants playback permission, but once enabled it should be layered.

At minimum separate:

### 1. Ambient rain bed

Broad continuous exterior-rain texture.

### 2. Glass impacts

Sparse/variable close rain taps against glass. Density and distribution should follow rainfall intensity.

### 3. Heavy runoff / storm texture

A denser continuous layer that appears mostly in heavier rain.

Optional later layers:

- distant thunder
- near thunder
- wind
- room/interior ambience

Avoid obvious short-loop repetition. Crossfade or schedule randomized variations when assets allow.

Audio must have a clear mute control and should pause appropriately when the document is hidden.

---

## Interaction

The initial product is primarily an ambience simulator, not a drawing app.

Useful interactions may include:

- rain intensity slider
- scene picker
- sound toggle / volume
- optional tilt/orientation control through the physical device
- optional tap on glass to disturb nearby drops later

Do not overload v0.1 with gestures that compete with simply watching the rain.

---

## Performance

Target stable realtime performance on current iPhone/iPad Safari.

Guidelines:

- low-resolution surface-water / wetness / flow-ID maps
- small bounded set of active macroscopic flow heads
- spatial lookup / flow-ID connectivity rather than large O(N²) particle clouds
- renderer resolution independent from simulation resolution
- pause or substantially reduce work while hidden
- stop camera when hidden
- clamp large `dt` after suspension

Stable 30 fps is preferable to unstable 60 fps.

---

## Suggested module structure

```text
rainpane/
  index.html
  styles.css
  AGENTS.md
  SPEC.md
  src/
    app.js
    scene.js
    rain.js
    surface.js
    flows.js
    gravity.js
    render.js
    audio.js
```

Responsibilities:

- `scene.js` — built-in image / local image / camera source lifecycle
- `rain.js` — incoming-rain event distribution by intensity
- `surface.js` — unresolved glass water, wetness, pinning, flow-ID maps
- `flows.js` — visible active heads, mass, merge, pinning, motion, trails
- `gravity.js` — known-good DeviceMotion mapping copied/adapted from Fog Mirror
- `render.js` — compositing/refraction/highlights
- `audio.js` — rain-bed / glass-impact / storm layers
- `app.js` — state and animation loop

---

## v0.1 acceptance criteria

v0.1 is successful when:

1. A background scene is visible behind a convincing virtual wet pane.
2. Rain intensity visibly changes impact density and water accumulation.
3. Impacts create pinned beads rather than instant long streaks.
4. Beads grow from additional water and nearby impacts.
5. Larger drops eventually depin and run.
6. Moving drops collect water and become visibly larger as they descend through wet areas.
7. Larger drops can move faster than smaller drops.
8. Nearby drops merge.
9. Nearby rivulets can join into one connected flow.
10. Moving flows leave residual wet trails that guide later runoff.
11. Water follows real device gravity on supported mobile devices.
12. Nearly flat orientation reduces in-plane runoff.
13. The glass optics use refraction/highlight cues rather than cartoon outlines.
14. User-selected images remain local.
15. Camera mode, if included in v0.1, is privacy-safe.
16. Rain sound has at least an ambient layer plus a separate glass-impact layer.
17. The app works as a static GitHub Pages experience with no backend.

---

## Non-goals for the first version

Do not block v0.1 on:

- true CFD/Navier–Stokes simulation
- physically exact splash breakup
- weather APIs
- real meteorological rainfall rates
- multiplayer
- image upload/storage
- advanced thunder propagation
- window-frame/room rendering

The target is perceptually convincing glass-water behavior, not scientific CFD.