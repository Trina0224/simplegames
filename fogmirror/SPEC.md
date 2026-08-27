# Fog Mirror — Product Specification

## 1. Summary

Fog Mirror turns a phone or tablet into a convincing steamed-up sauna/bathroom mirror.

The live **front-facing camera** is the reflection. A simulated condensation layer covers the mirror. The user can wipe it with a finger, draw a smiley face or words, watch displaced moisture gather into droplets, and see larger droplets merge and run downward leaving wet trails.

A **Steam / Re-fog** control covers the mirror again. Re-fogging does not reset the surface completely: recent wet trails and wiped regions retain subtle moisture memory, so later condensation gathers and flows preferentially along them.

The goal is not a drawing app with a fog texture. The goal is to recreate the small physical behaviors that make a real hot-room mirror recognizable.

---

## 2. Primary experience

1. User opens Fog Mirror.
2. Front camera permission is requested after an explicit tap.
3. The screen becomes a horizontally mirrored live reflection.
4. The reflection is heavily obscured by dense condensation.
5. User drags a finger and clears a wet path through the fog.
6. Moisture pushed away from the finger accumulates along the stroke edge.
7. Some regions bead into drops.
8. Large enough drops begin to crawl/run downward.
9. Drops merge, accelerate, and leave clear wet trails.
10. User presses Steam / Re-fog and the fine mist grows back while the previous wet history subtly remains.

The user should be able to spend time doing nothing more than drawing faces, wiping large areas, watching drops collide, and repeatedly fogging the mirror.

---

## 3. Device priorities

### Tier 1 — iPhone

- portrait and landscape
- front camera
- finger drawing and broad swipes
- realtime water simulation

### Tier 1 — iPad / iPad mini

- larger mirror area
- multi-touch interaction
- enough performance headroom for a larger droplet field

### Tier 2 — Android phones/tablets

Use the same standard Web APIs where supported.

### Desktop

Desktop may use a webcam and pointer input, but it is not the primary physical experience.

---

## 4. Camera behavior

### Default camera

Use:

```js
getUserMedia({
  video: { facingMode: 'user' },
  audio: false
})
```

The video is displayed as a mirror, so it must be horizontally flipped.

### Privacy

The camera is view-only.

Must NOT:

- photograph
- record video
- draw frames into a persistent capture store
- create downloadable blobs
- upload frames
- send frames to any backend

Camera tracks must be stopped when:

- camera is disabled
- page becomes hidden
- user navigates away

If camera permission is denied, show a quiet fallback reflection/background and keep the condensation simulation fully usable.

---

## 5. Rendering model

The rendered mirror contains several layers.

Conceptual order:

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

---

## 6. Surface fields

The implementation should model at least three conceptual fields.

### Fog density

`fog(x, y)`

Represents fine micro-condensation that causes the milky, blurred mirror appearance.

High fog:

- stronger blur
- lower local contrast
- pale scattered appearance

Low fog:

- clearer camera reflection

### Liquid water

`water(x, y)`

Represents actual accumulated water available to form visible droplets and streaks.

### Wetness / trail memory

`wetness(x, y)`

A slower-decaying field representing recently wetted glass.

It affects:

- where new condensation nucleates
- where droplets prefer to merge
- where falling water tends to follow old paths

This is necessary for the requested behavior where old water marks become preferred channels.

---

## 7. Fog optical appearance

A real sauna mirror is not covered by an even gray rectangle.

The fog layer should include:

- local blur of the reflection
- low-frequency variation in condensation density
- high-frequency microdroplet grain
- slightly brighter/milkier scattering around highlights
- irregular boundaries between clear and foggy regions
- wet clear streaks that refract/distort the camera image

### Strong requirement

Do not implement the main effect as only:

```text
white overlay + alpha erase brush
```

That can be a prototype but not the accepted visual result.

A GPU shader / WebGL approach is strongly preferred for camera blur/refraction if Canvas 2D cannot meet the realism/performance target.

---

## 8. Initial fog state

At launch after camera activation:

- the mirror is already strongly fogged
- large shapes of the face/body remain vaguely visible
- facial detail is obscured
- a few small beads may already exist

It should resemble entering a bathroom immediately after a hot shower, not glass slowly fogging from perfectly clear.

---

## 9. Finger wiping

### Contact footprint

A finger stroke affects a soft circular/elliptical footprint approximating a fingertip.

It should not create a razor-sharp vector line.

### Moisture redistribution

When wiping:

- fog density drops strongly under the finger
- some local liquid water is pushed sideways/outward
- wetness remains in the touched area
- stroke boundaries become wetter than the center

Thus a drawn smiley face appears clear in the center but can develop beads around its edges.

### Slow stroke

A slow stroke is suitable for writing/drawing.

Expected result:

- narrow clean path
- clear mirror underneath
- modest moisture ridge at edges
- persistent readable shape

### Fast broad swipe

Velocity matters.

A fast large gesture should:

- clear a broader footprint
- impart lateral momentum to nearby water
- break pinned moisture into many drops
- throw/push water toward the swipe edge
- create visible runoff after the hand leaves

This should feel different from drawing slowly.

### Multi-touch

Support multiple simultaneous wiping points where practical.

---

## 10. Droplet lifecycle

### 10.1 Nucleation

Visible drops emerge when local liquid exceeds a threshold.

Nucleation is more likely:

- at wet stroke edges
- along old trails
- in small surface imperfections/noise
- near existing droplets

Avoid a uniform grid of droplets.

### 10.2 Pinning

Small droplets remain stuck because of surface tension/contact-angle pinning.

A drop should not move merely because gravity exists.

Conceptually:

```text
if gravity_force <= pinning_force:
    remain still
```

As a drop grows, gravitational force increases until it can overcome pinning.

### 10.3 Motion

Once moving:

- gravity accelerates it downward
- viscous/surface drag limits speed
- local wet trails reduce resistance
- small horizontal perturbations allow imperfect paths

Larger drops generally move faster than tiny drops.

### 10.4 Merge

When droplets touch, they usually merge.

Approximate conservation:

```text
newVolume = volumeA + volumeB
```

Radius can derive from a 2D/3D approximation as long as perceived size growth is believable.

Merged drops should have increased likelihood of moving.

### 10.5 Trail

A moving drop leaves:

- reduced fog
- elevated wetness
- a thin quantity of water

The trail gradually fades/re-fogs, but wetness survives longer than optical clarity.

### 10.6 Reuse of old trails

Future drops encountering an old wet trail should tend to follow it.

This may be modeled as reduced pinning/friction or a local attraction/flow preference.

The effect should be subtle, not rail-like.

---

## 11. Droplet visual appearance

Visible drops should have more than a circle with opacity.

Aim for:

- refractive/distorted camera content inside the drop
- bright highlight edge on one side
- darker/contrasting meniscus on another edge
- shape deformation while moving
- slight elongation vertically at speed
- rounder shape while pinned

Large streams may be represented by connected wet trails rather than thousands of particles.

---

## 12. Re-fog / Steam control

A prominent but minimal button restores condensation.

On activation:

1. fine fog density grows over the surface
2. clear drawings gradually become hazy
3. residual liquid and wetness are NOT deleted
4. old wet paths influence new bead formation
5. some new microdroplets become visible

The transition should take a short perceptible time rather than one-frame replacement.

Suggested feel: roughly 1–3 seconds to become strongly fogged.

---

## 13. Natural re-condensation

Even without pressing Steam, wiped regions may slowly fog again.

This should be substantially slower than manual Re-fog so users can enjoy drawings.

Possible starting range:

- visible onset after several seconds
- substantial return over tens of seconds

Tune by feel rather than treating these numbers as fixed.

---

## 14. Large-hand gesture / water release

The requested dramatic interaction is a broad hand sweep that suddenly creates many moving beads.

Since ordinary touchscreens report contact points rather than the full physical hand silhouette, infer this gesture from one or more of:

- high pointer velocity
- long swipe distance
- multiple simultaneous touches
- large recent swept area

On detection:

- clear the swept region
- push water in swipe direction
- create/coalesce droplets near the leading/lower edge
- reduce pinning temporarily in disturbed regions
- allow gravity to take over immediately afterward

The result should be visually satisfying: many small beads begin sliding or join larger streams.

---

## 15. Breath / mouth fogging experiment

This is the hardest requested interaction.

### What the browser can and cannot sense

Typical phones do **not** expose a web humidity sensor.

The front camera normally cannot directly detect invisible warm humid breath with sufficient reliability.

Therefore true physical steam detection is not available through a straightforward browser API.

### Option A — microphone breath heuristic

A sustained exhalation has a broadband noise signature.

Possible pipeline:

1. user explicitly enables Breath mode
2. request microphone permission
3. Web Audio analyser measures short-time spectrum
4. detect sustained broadband noise with low pitch periodicity
5. if threshold remains satisfied for ~200–500 ms, emit local fog

Problems:

- speech can trigger it
- fans/wind can trigger it
- rubbing/covering microphone can trigger it
- microphone location differs by device
- user may blow at screen but not microphone

This is suitable only as an experiment.

### Option B — camera mouth-position heuristic

A face/landmark detector could estimate:

- face is close to screen
- mouth location
- lips open/pursed

Then create fog centered at the mouth location.

But this detects an apparent breathing pose, not actual exhalation.

It also introduces a face-model dependency that may be large for a deliberately small static toy.

### Option C — hybrid

Use both:

- mouth near screen
- exhalation-like microphone noise

When both occur, generate an expanding local fog patch at the mirrored mouth position.

This is the most convincing proxy but also the most complicated.

### Product decision

Breath detection is **experimental and not required for v0.1**.

The core mirror must be satisfying without it.

For development, add a manual local-fog test gesture/control so the visual behavior of a breath cloud can be tuned independently of sensing.

If a later breath detector is unreliable, do not keep it merely because it is clever.

### Local breath visual effect

Regardless of sensing method, a detected breath should not instantly paint a circle.

Model it as:

- initially strongest near mouth position
- soft expanding elliptical cloud
- slight upward drift before settling
- rapid increase in fine fog
- later conversion of part of that fog into microdroplets/water

Repeated breaths in the same region should increase water accumulation and eventually form larger beads.

---

## 16. Performance architecture

A recommended hybrid approach:

### Low-resolution field simulation

Maintain fog/water/wetness on a grid substantially below display resolution, for example 128–512 pixels along the long axis depending on device performance.

Use interpolation when rendering.

### Particle droplets

Only larger visible beads become particles.

Particle state may include:

```text
x, y
radius / volume
vx, vy
pinned
age
```

Keep the particle count bounded.

### GPU composition

Use WebGL/WebGL2 where practical for:

- camera blur
- refraction
- fog density visualization
- droplet normal/highlight rendering

Canvas 2D fallback is acceptable during early development.

---

## 17. Simulation timestep

Use a time-based simulation, not frame-count assumptions.

For a grid simulation:

- use measured `dt`
- clamp huge `dt` after tab suspension
- optionally use fixed substeps for droplet physics

Visual rendering may run at display refresh independently.

---

## 18. Surface heterogeneity

Perfectly homogeneous glass looks synthetic.

Generate a stable low-amplitude surface map on startup that affects:

- condensation nucleation
- pinning force
- trail direction very slightly

This field should remain fixed for the session so droplets repeatedly interact with the same microscopic "imperfections".

Do not make the noise visually obvious by itself.

---

## 19. Orientation / gravity

For v0.1, gravity may simply be screen-down.

A future option could use device orientation so water always follows physical gravity when the phone tilts.

Do not delay v0.1 for sensor support; convincing condensation physics is more important.

---

## 20. UI

The mirror should occupy almost the entire viewport.

Visible UI should be minimal.

Suggested controls:

```text
[ Steam ]          [ ⋯ ]
```

Settings may contain:

- Camera on/off
- Fog amount
- Re-condensation speed
- Water amount / wetness feel
- experimental Breath mode (future)
- Reset surface

No shutter control.

---

## 21. Sound

Optional, not required.

If added:

- quiet finger-on-wet-glass rubbing
- subtle water-drop movement

Do not add exaggerated arcade sounds.

Audio must be muted by default or easily disabled if it becomes distracting.

---

## 22. Accessibility / reduced motion

Under `prefers-reduced-motion`:

- finger wiping remains functional
- reduce droplet acceleration/animation density
- avoid dramatic sweeping motion

Camera-off fallback must remain usable.

Controls require accessible labels and usable touch targets.

---

## 23. Persistence

Do not persist camera imagery.

Small preferences may use `localStorage`, such as:

- camera enabled preference (permission still controlled by browser)
- fog amount
- re-condensation setting
- sound preference

Surface water state does not need to survive page reload.

---

## 24. Proposed file structure

```text
fogmirror/
├── index.html
├── styles.css
├── AGENTS.md
├── SPEC.md
└── src/
    ├── app.js
    ├── camera.js
    ├── input.js
    ├── condensation.js
    ├── droplets.js
    ├── render.js
    └── breath.js       # optional / experimental, not required v0.1
```

---

## 25. Development milestones

### Milestone 1 — fake mirror prototype

- front camera mirror
- simple fog layer
- finger clears fog
- Steam button restores it

Purpose: validate interaction/layout only.

### Milestone 2 — believable condensation

- nonuniform fog
- pushed moisture at stroke edges
- wetness memory
- gradual re-condensation

### Milestone 3 — droplets

- nucleation
- pinning
- gravity
- merging
- trails
- old-trail preference

### Milestone 4 — optical polish

- refraction
- droplet highlights
- wet streak distortion
- improved fog scattering/blur

### Milestone 5 — gesture drama

- fast broad swipe creates mobile droplets and runoff
- multi-touch tuning

### Experimental milestone — breath

- manual local-fog visual prototype first
- microphone heuristic experiment
- optionally investigate mouth-position detection
- keep only if reliable and privacy-preserving

---

## 26. Acceptance criteria for v0.1

v0.1 is ready when all of these are true:

1. The live front-camera image behaves like a mirror.
2. Camera lifecycle is privacy-safe and stops correctly.
3. The initial mirror looks genuinely steamed/fogged, not merely gray-transparent.
4. Finger drawing can create a clean smiley face or text.
5. A stroke redistributes moisture rather than acting only as an alpha eraser.
6. Cleared regions slowly re-condense.
7. Water gathers preferentially at plausible locations rather than uniformly.
8. Visible droplets have multiple sizes.
9. Tiny drops can remain pinned.
10. Larger drops run downward.
11. Drops merge.
12. Moving drops leave wet/clear trails.
13. Existing trails influence later flow.
14. Re-fogging restores mist without deleting wetness history.
15. Fast broad swipes trigger visibly larger water movement/runoff.
16. Interaction remains smooth on an iPhone/iPad-class device.
17. The app works as a static GitHub Pages site without backend services.
18. No camera imagery is captured, recorded, stored, or uploaded.

Breath sensing is specifically **not** required to satisfy v0.1.
