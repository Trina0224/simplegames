# AGENTS.md — Fog Mirror

## Purpose

Fog Mirror is a touch-first browser toy that turns a phone or tablet into a convincingly fogged sauna/bathroom mirror.

The live **front-facing camera** is the reflection. Over it sits a physically inspired condensation layer that can be wiped, written in, re-fogged, and disturbed into droplets that merge and run downward.

The point is not productivity. The point is that touching the screen should feel uncannily like touching a real steamed-up mirror.

Primary targets:

- iPhone
- iPad / iPad mini
- Android phones/tablets when practical

Static hosting on GitHub Pages is preferred. No backend.

---

## Product principles

1. **Realism is the feature.** Do not settle for a translucent gray overlay with erased circles.
2. **The camera is the mirror.** Use the front-facing camera by default and mirror it horizontally so motion matches an actual mirror.
3. **Condensation has memory.** Previously wiped/wet paths should affect where later moisture gathers and runs.
4. **Water has mass.** Droplets should nucleate, grow, merge, accelerate under gravity, leave trails, and occasionally split or pin to the surface.
5. **Touch feels physical.** A fingertip should push/clear moisture locally; a fast broad swipe should disturb a large wet area differently from careful drawing.
6. **The toy must remain private.** No photo capture, no recording, no upload, no camera frames sent to a server.
7. **Graceful degradation.** If camera permission is denied, the condensation toy should still work over a fallback mirrored/neutral background.
8. **Do not fake unsupported sensing.** Breath detection is experimental. Never claim the browser can directly sense humidity or steam when it cannot.

---

## Privacy / camera requirements

- Request `getUserMedia({ video: { facingMode: 'user' }, audio: false })` for normal mirror use.
- Mirror the preview horizontally.
- Do not create photos, blobs, screenshots, recordings, or uploads.
- Stop all camera tracks when the user disables camera, leaves the page, or the document becomes hidden.
- Keep camera lifecycle isolated in its own module when implementation begins.
- If microphone-based breath experiments are added later, request microphone permission separately and only after explicit user action. It must be opt-in and must never be needed for normal use.

---

## Visual model

Treat the mirror surface as several interacting fields, not one opacity mask.

At minimum maintain conceptually separate quantities such as:

- `fog(x,y)` — density of tiny condensation droplets / optical haze
- `water(x,y)` — liquid water accumulated on the surface
- `wetness(x,y)` — persistent surface wetting / recent trail memory
- `velocity(x,y)` or droplet velocity — downward and lateral liquid motion
- optional `temperature(x,y)` or fogging tendency — only if useful for re-condensation behavior

These may be represented with textures, framebuffers, lower-resolution grids, particles, or a hybrid approach. The data representation is an implementation choice; the visible behavior is not.

### Optical appearance

Real fogged glass does not behave like a uniform white alpha layer.

The condensation layer should combine:

- strong local blur / loss of detail in the camera image
- milky forward-scattering appearance
- subtle brightness bloom around highlights
- fine grain / micro-droplet variation
- sharper, darker, more refractive edges around larger droplets
- clearer streaks where liquid has displaced the fine fog

Prefer WebGL/WebGL2 shaders or GPU-backed canvas effects if necessary for convincing realtime blur/refraction. A CPU-only per-pixel simulation at full camera resolution is likely too expensive on mobile.

---

## Fog behavior

### Initial state

The mirror should begin heavily fogged, like a mirror in a hot sauna or bathroom immediately after a shower.

The camera reflection should still be vaguely visible as large blurred forms but facial details should be strongly obscured.

### Re-fog button

Provide one obvious action to restore condensation.

Re-fogging should **not** erase surface history instantly.

If a path was recently wiped or had water run through it:

- fog can return over it,
- but the remaining wetness should encourage new droplets to gather there,
- so old trails subtly reappear as preferred flow channels.

This is important to making the mirror feel like the same physical surface over time.

### Natural re-condensation

After a region is wiped clear, fine fog may slowly return even without pressing Re-fog. Keep this slow enough that drawings remain enjoyable.

---

## Finger interaction

### Slow drawing / writing

Dragging a fingertip should clear fine fog along the path, allowing the camera reflection to show through.

The cleared path should:

- have a soft pressure-sized edge rather than a perfect vector stroke,
- push some moisture toward the stroke edges,
- leave residual wetness rather than becoming perfectly dry,
- allow smiley faces, names, hearts, etc. to remain readable for a while.

A finger stroke is not an eraser. It redistributes moisture.

### Large / fast swipe

A fast long swipe should produce a visibly different event:

- clear a broader region,
- shear accumulated water,
- dislodge/push droplets,
- seed many mobile droplets along the lower/leading edges,
- cause some of them to start running downward after the hand passes.

The toy should reward exaggerated gestures.

Multi-touch is desirable: several fingers can wipe several paths at once.

---

## Droplet model

This is the core realism requirement.

### Nucleation

Large droplets should emerge where enough water accumulates rather than appearing uniformly everywhere.

Probability/growth should be higher:

- along existing wet trails,
- near stroke edges where moisture was pushed,
- where smaller droplets collide,
- in locally wetter regions.

### Growth and merge

Droplets should gradually absorb nearby fine moisture and smaller droplets.

When two drops contact, they should usually merge into a larger drop conserving approximately their combined water amount.

The larger drop should become more likely to overcome surface pinning and move.

### Gravity

Gravity is screen-down by default. Device orientation may later perturb gravity, but v0.1 does not need orientation sensors.

Drops should not all fall at the same speed:

- tiny drops stay pinned,
- medium drops creep,
- large drops accelerate and run,
- drag limits terminal speed.

### Trails

A moving drop leaves a wet trail.

That trail should:

- be clearer than surrounding fog,
- remain wet for a while,
- attract/funnel later water,
- gradually narrow/fade as it evaporates/re-fogs.

This creates the user's requested behavior: places where water previously ran become preferred channels for later water.

### Branching / pinning

Perfectly vertical straight lines look fake.

Introduce small spatial heterogeneity so droplets:

- hesitate at random pinning points,
- wander slightly sideways,
- sometimes follow an existing trail,
- occasionally merge into another stream.

Do not make this look like Brownian noise. Gravity must remain dominant.

---

## Camera composition

The user's reflection should sit *behind* the entire simulated glass/water layer.

Recommended conceptual render order:

1. front camera video, mirrored horizontally
2. optical distortion/refraction from large water droplets and streaks
3. fine condensation blur/scatter
4. droplet highlights, menisci, and edge shading
5. minimal UI controls

The UI should not look like a camera app. No shutter button.

---

## Breath / "haaa" experiment

### Reality constraint

A normal phone browser has no humidity sensor API and the front camera cannot directly see ordinary warm breath reliably.

There are three possible proxies, none perfect:

1. **Microphone exhalation detection**
   - Breath produces broadband low-energy noise.
   - Could inspect local spectral energy / noise character with Web Audio.
   - Problems: speech, wind, fans, rubbing the microphone and room noise produce false positives.
   - Requires microphone permission.

2. **Face / mouth position from camera**
   - If a local face-landmark model is available, detect a face close to the screen and an open/pursed mouth.
   - This estimates *intent* to breathe, not actual breath.
   - A model may be too large/complex for this deliberately small toy and can complicate offline/privacy guarantees.

3. **Hybrid heuristic**
   - Require a face/mouth near a region plus an exhalation-like microphone signal.
   - Generate a local expanding fog patch centered in front of the detected mouth.
   - More convincing but significantly more engineering and permission burden.

### Scope decision

**Breath sensing is NOT required for v0.1.**

For v0.1 include a manual/gesture-equivalent way to create local fresh fog if useful for testing the visual effect.

For a later experiment, microphone-only detection is the smallest viable prototype. If it is unreliable, remove it rather than shipping a gimmick that triggers incorrectly.

If breath mode is implemented:

- all analysis stays local,
- no audio is stored or transmitted,
- provide a clear microphone-off state,
- ordinary mirror interaction works fully without microphone permission.

---

## Suggested implementation architecture

Keep components separate:

- `camera.js` — front camera acquisition/lifecycle only
- `input.js` — pointer/multi-touch strokes and gesture velocity
- `condensation.js` — fog/wetness field evolution
- `droplets.js` — coarse droplet particles, merge, gravity, trails
- `render.js` — GPU/canvas composition and optical effects
- `app.js` — state, controls, animation loop, persistence
- optional later `breath.js` — local breath heuristic only

A hybrid simulation is encouraged:

- low-resolution field texture/grid for fog + wetness
- discrete particles for visible large droplets
- GPU shader for blur/refraction/compositing

Do not simulate millions of literal microdroplets.

---

## Performance requirements

- Target smooth realtime interaction on modern iPhone/iPad Safari.
- Prefer 60 fps, but stable 30 fps is better than unstable 60.
- Scale simulation resolution independently from display resolution.
- Camera video does not need to be processed at native sensor resolution.
- Bound droplet particle counts; merge or recycle small particles when necessary.
- Pause expensive simulation and stop the camera when the document is hidden.
- Respect `prefers-reduced-motion` by reducing flowing/animated motion while keeping wiping functional.

---

## Controls

Keep controls minimal and visually secondary.

Required:

- Re-fog / Steam
- Camera on/off
- optional Flip only if a rear-camera mode is later considered

Possible settings hidden behind a small settings control:

- fog density
- re-condensation speed
- droplet amount
- sound on/off if subtle wiping/water audio is added
- experimental Breath mode (future only)

Do not expose physics tuning parameters to normal users.

---

## v0.1 definition of done

v0.1 succeeds when:

1. The front camera behaves like a mirrored reflection.
2. The screen begins convincingly fogged rather than covered by a simple translucent layer.
3. A finger can write a recognizable smiley face or word into the condensation.
4. Wiping redistributes moisture rather than merely deleting opacity.
5. Moisture gathers into visible droplets.
6. Large droplets merge and run downward at different speeds.
7. Running drops leave persistent wet trails.
8. Old wet trails influence where later water gathers/runs.
9. A fast broad swipe produces many disturbed droplets and visible runoff.
10. Re-fogging covers the mirror again without erasing all wetness memory.
11. Camera frames are never captured, stored, uploaded, or recorded.
12. The toy remains usable when camera permission is denied.
13. It runs as a static GitHub Pages app with no backend.

Breath sensing is explicitly outside the v0.1 acceptance gate.
