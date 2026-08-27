# AGENTS.md — Fog Mirror

## Purpose

Fog Mirror is a touch-first browser toy that turns a phone or tablet into a convincingly fogged sauna/bathroom mirror.

The live **front-facing camera** is the reflection. Over it sits a physically inspired condensation layer that can be wiped, written in, re-fogged, and disturbed into droplets that merge and run according to the device's physical orientation.

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
4. **Water has mass.** Droplets should nucleate, grow, merge, accelerate under physical gravity, leave trails, and occasionally split or pin to the surface.
5. **Gravity follows the device.** Water must react to the actual direction of gravity projected onto the glass, not blindly to screen-down.
6. **Touch feels physical.** A fingertip should push/clear moisture locally; a fast broad swipe should disturb a large wet area differently from careful drawing.
7. **The toy must remain private.** No photo capture, no recording, no upload, no camera frames sent to a server.
8. **Graceful degradation.** If camera permission is denied, the condensation toy should still work over a fallback mirrored/neutral background.
9. **Do not fake unsupported sensing.** Breath detection is experimental. Never claim the browser can directly sense humidity or steam when it cannot.

---

## Physics implementation contract

Read [`PHYSICS.md`](PHYSICS.md) before changing condensation, droplet, trail, merge, or gravity behavior.

The water model is intentionally based on a **height-map + active flow-head + flow-ID** architecture inspired by published real-time water-on-glass work. Do not regress it to a large set of independent decorative particles.

Required invariants:

- `fog` is microscopic condensation / optical haze, not a list of macroscopic beads.
- `water` is a conserved-ish surface-water height map and is the source of visible mobile water.
- `wet` stores longer-lived hysteresis / trail memory; it is not free water mass.
- active macroscopic objects are **flow heads/fronts**, normally few in number.
- a head grows only by collecting surface water or merging another flow.
- a moving head leaves residual water in a connected trail/body.
- nearby flow bodies may merge through their rasterized trail/flow-ID regions even when head centers have not literally overlapped.
- repeated wiping in one local basin should preferentially feed a dominant collector rather than make many parallel rivulets.
- larger flows should depin more easily and achieve a higher terminal velocity as their mass increases.
- wiping must place most displaced water on the physical gravity-down edge of the contact patch.

Mass, merge, pinning, and trail behavior are correctness features, not purely visual tuning.

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
- `flowId(x,y)` — ownership/connectivity of active/recent water bodies
- active flow-head velocity — motion of the fronts along the glass
- shared `(gx, gy)` — physical gravity projected into screen/glass coordinates

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
- push moisture primarily to the physical gravity-down edge and secondarily to side ridges,
- leave residual wetness rather than becoming perfectly dry,
- allow smiley faces, names, hearts, etc. to remain readable for a while.

A finger stroke is not an eraser. It redistributes moisture.

### Large / fast swipe

A fast long swipe should produce a visibly different event:

- clear a broader region,
- shear accumulated water,
- feed one or a few dominant collectors near the downhill/leading edge,
- disturb existing flow heads,
- cause runoff after the hand passes.

The toy should reward exaggerated gestures without spraying hundreds of unrelated droplets.

Multi-touch is desirable: several fingers can wipe several paths at once.

---

## Droplet / flow model

This is the core realism requirement. Detailed design lives in `PHYSICS.md`.

### Nucleation

Visible macroscopic heads should emerge only where enough water accumulates from a recent disturbed/wiped region. Untouched fog must not spontaneously become a field of visible beads.

Prefer feeding an existing dominant collector over creating a new head.

### Growth and merge

A formed head actively collects nearby surface water. Moving heads collect from a wider catchment and should grow as they descend through a wet region.

When flows touch, merge their mass and momentum approximately. Body/trail contact counts as a merge condition, not only exact head-circle overlap.

### Gravity and device orientation — REQUIRED FOR v0.1

Do **not** hard-code gravity as screen-down on supported mobile devices.

Use device motion/orientation sensing to estimate the physical gravity vector, then project it into the current screen coordinate system.

Preferred signal:

- `DeviceMotionEvent.accelerationIncludingGravity`
- low-pass filtered to isolate the slowly varying gravity vector
- a calibration/reference strategy rather than relying on one hard-coded axis sign
- screen-orientation delta handling so portrait/landscape changes do not invert flow

The simulation needs the component of gravity **along the mirror plane**:

- device held upright: droplets visibly run toward physical down
- device tilted diagonally: droplets run diagonally
- device rotated 90°: established flows change direction
- device nearly flat: in-plane gravity becomes small, so drops slow, pin, or pool instead of continuing to march toward screen-bottom

Raw accelerometer values must not be fed directly into droplets. Hand tremor and transient motion must be filtered.

### Pinning

Use a force-style comparison, not only a hard radius threshold:

```text
drive      ~= gravityAlongGlass * mobileMass
resistance ~= contact/pinning term modified by local wetness, heterogeneity, and recent merge state
```

Small heads may stay pinned while a larger neighbouring head moves.

### Trails

A moving flow leaves a connected wet body / residual trail in simulation state.

That trail should:

- remain wet for a while,
- reduce future pinning,
- attract/funnel later water,
- participate in body-contact merging,
- gradually narrow/fade as it evaporates/re-fogs.

Do not implement the trail only as a visual line disconnected from the water state.

---

## Camera composition

The user's reflection should sit *behind* the entire simulated glass/water layer.

Recommended conceptual render order:

1. front camera video, mirrored horizontally
2. optical distortion/refraction from water height / large flow heads / streaks
3. fine condensation blur/scatter
4. partial highlights/menisci derived from water normals
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

2. **Face-scale / approach heuristic from camera**
   - Do not assume the mouth can be continuously tracked once the mirror is heavily fogged.
   - More practical signal: a face rapidly grows larger / approaches the device, with recent face motion providing a coarse region where fog should appear.
   - This estimates *intent* and location approximately, not actual steam.

3. **Hybrid heuristic**
   - Require a recent face-approach event plus an exhalation-like microphone signal.
   - Infer a broad target region from the face trajectory rather than demanding precise mouth coordinates.
   - Generate one fairly large local condensation patch; precision is less important than believable cause/effect.
   - More convincing but significantly more engineering and permission burden.

### Scope decision

**Breath sensing is NOT required for v0.1.**

For v0.1 include a manual/gesture-equivalent way to create local fresh fog if useful for testing the visual effect.

For a later experiment, the hybrid face-approach + breath-noise heuristic is the preferred direction. If it is unreliable, remove it rather than shipping a gimmick that triggers incorrectly.

If breath mode is implemented:

- all analysis stays local,
- no audio is stored or transmitted,
- provide a clear microphone-off state,
- ordinary mirror interaction works fully without microphone permission.

---

## Suggested implementation architecture

Keep components separate:

- `camera.js` — front camera acquisition/lifecycle only
- `orientation.js` — device-motion permission, gravity filtering, calibration, screen-coordinate transform
- `input.js` — pointer/multi-touch strokes and gesture velocity
- `condensation.js` — fog / water height / wetness evolution
- `droplets.js` — active flow heads, mass, flow IDs, merge, pinning, gravity, connected trails
- `render.js` — GPU/canvas composition and optical effects
- `app.js` — state, controls, animation loop, persistence
- optional later `breath.js` — local breath heuristic only

A hybrid simulation is required in spirit:

- low-resolution fog/water/wetness maps
- low-resolution flow-ID/connectivity map
- only a few active flow heads
- GPU/Canvas optics layered over that simulation state

Do not simulate millions of literal microdroplets, and do not fake condensation by spawning hundreds of independent macroscopic circles.

---

## Performance requirements

- Target smooth realtime interaction on modern iPhone/iPad Safari.
- Prefer 60 fps, but stable 30 fps is better than unstable 60.
- Scale simulation resolution independently from display resolution.
- Camera video does not need to be processed at native sensor resolution.
- Keep active flow-head count small.
- Use flow-ID/spatial structures rather than large O(N²) particle clouds when possible.
- Pause expensive simulation and stop the camera when the document is hidden.
- Respect `prefers-reduced-motion` by reducing flowing/animated motion while keeping wiping functional.

---

## Controls

Keep controls minimal and visually secondary.

Required:

- Re-fog / Steam
- Camera on/off
- one-time motion/orientation permission flow where required by the platform

Possible settings hidden behind a small settings control:

- fog density
- re-condensation speed
- water amount / wetness feel
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
5. Water appears mainly at the gravity-down edge of disturbed regions.
6. Repeated wiping in one local basin tends toward one dominant flow or a few, not dozens of parallel drops.
7. Tiny heads can remain pinned while larger flows move.
8. A moving flow grows as it collects water and can visibly accelerate with added mass.
9. Two nearby flow bodies can merge through trail/body contact.
10. Flows respond to the physical gravity direction of the device on supported mobile hardware.
11. Rotating/tilting the device changes water-flow direction plausibly.
12. Nearly flat orientation reduces in-plane flow rather than forcing water toward screen-bottom.
13. Running flows leave persistent residual wet trails that influence later water.
14. Re-fogging covers the mirror again without erasing all wetness memory.
15. Camera frames are never captured, stored, uploaded, or recorded.
16. The toy remains usable when camera or motion permission is denied, with appropriate fallbacks.
17. It runs as a static GitHub Pages app with no backend.

Breath sensing is explicitly outside the v0.1 acceptance gate.
