# Fog Mirror — Product & Engineering Specification

## 1. Product goal

Fog Mirror turns a phone or tablet into a convincing steamed bathroom / sauna mirror.

The front camera is the reflection. A simulated glass surface carries fine condensation, liquid water, wetness memory, and a small number of connected water flows. The user can wipe fog with a finger, write on the mirror, press Steam to re-fog it, and watch displaced water pool, merge, depin, and run according to real device gravity.

The product succeeds only if the water feels like one physical surface with memory. It must not look like a drawing canvas plus decorative raindrop particles.

Primary devices:

- iPhone
- iPad / iPad mini
- Android phones/tablets where practical

Static GitHub Pages. No backend.

---

## 2. Current verified state

### Gravity — VERIFIED / FROZEN

The iPad gravity mapping from repository commit `89b765f0420f40e0f7c1831d56a242b50dc1dce5` has been verified on real hardware and is the golden reference.

The validated approach uses:

```js
DeviceMotionEvent.accelerationIncludingGravity
```

with low-pass filtering and direct mapping:

```js
tx = -a.x / |a|
ty = -a.y / |a|
```

without an additional `screen.orientation` rotation.

Expected tested behavior:

- upright device -> water runs screen-down
- physical right edge downward -> water runs screen-right
- physical left edge downward -> water runs screen-left
- nearly flat -> in-plane gravity becomes weak

This mapping must not be changed unless a new real-device regression is first demonstrated.

### Water physics — NOT YET ACCEPTED

The current visible water still behaves too much like independent drops dragging lines. The next implementation must use the connected-flow model in this document and `PHYSICS.md`.

---

## 3. Primary user experience

1. User opens Fog Mirror.
2. User taps once to grant front-camera and motion permission as needed.
3. The live front camera appears horizontally mirrored.
4. The reflection is heavily obscured by nonuniform condensation.
5. User drags a finger through the fog.
6. The finger clears the fine mist but also redistributes its water.
7. Liquid is pushed mainly toward the physical gravity-down edge of the contact footprint.
8. One or a few local collectors grow from accumulated water.
9. Small heads can remain pinned.
10. Larger heads collect film, depin, and begin running.
11. Running flows grow as they sweep up water and nearby small flows.
12. Nearby streams merge into dominant connected flows.
13. Flowing water leaves residual wet trails that affect later runoff.
14. Steam restores fine fog without deleting surface wetness history.

---

## 4. Camera and privacy

Use the front-facing camera by default:

```js
getUserMedia({
  video: { facingMode: 'user' },
  audio: false
})
```

Requirements:

- preview is horizontally mirrored
- no shutter UI
- no photos
- no video recording
- no blobs / screenshots
- no frame upload or transmission
- stop tracks when camera is disabled, page becomes hidden, or user navigates away
- simulation remains usable if camera permission is denied

Breath/microphone experiments are separate and optional.

---

## 5. Simulation architecture

The simulation must conceptually contain four persistent surface representations plus a small active-flow set.

### 5.1 Fog field

`fog(x,y)`

Represents microscopic condensation responsible for blur and milky scattering.

Fog is not a list of macroscopic droplets.

### 5.2 Surface-water height map

`water(x,y)`

Represents unresolved liquid water on the glass:

- thin film
- wiped ridges
- local pools
- residual runoff water
- small unresolved beads

This is the reservoir from which visible flows obtain mass.

### 5.3 Wetness / hysteresis memory

`wet(x,y)`

Represents longer-lived surface wetting and recent flow history.

It affects:

- local pinning resistance
- future condensation tendency
- preferred flow channels

It is not interchangeable with liquid-water mass.

### 5.4 Flow-ID / connectivity map

`flowId(x,y)`

A low-resolution integer/ownership map identifying connected active or recent flow bodies.

Uses:

- detect head-body contact
- detect body-body contact
- merge nearby rivulets before their head centers overlap exactly
- preserve connectivity between a visible head and its trail/body

### 5.5 Active flow heads/fronts

Only a small number of macroscopic moving objects should exist.

Each flow should conceptually track:

```text
id
x, y
mass
vx, vy
pinned
footprintRadius
trailWidth
age
```

A visible drop is the front/head of a connected water body, not an isolated particle.

---

## 6. Water mass accounting

The simulation is heuristic, but visible water must approximately conserve mass.

Allowed mass transfers:

```text
fog -> water              wiping / condensation
water -> active flow      collection / pooling
flow A + flow B -> flow C merge
active flow -> water      residual trail deposition
```

Forbidden behavior:

- a visible drop increases radius without consuming water or merging
- Steam directly creates large drops
- untouched fog randomly produces many visible beads
- a swipe spawns a large set of particles without available local water mass

Conceptually:

```text
M_next = M_current
       + collectedSurfaceWater
       + mergedFlowMass
       - residualTrailDeposit
```

Visible footprint must derive from `mass`, not from an independent radius-growth timer.

---

## 7. Finger wiping

A finger stroke is a moisture-transport event.

For every stroke sample:

1. lower `fog` under the contact footprint
2. convert a fraction of removed condensation into `water`
3. move/redistribute available local `water`
4. concentrate most mobile liquid toward the physical gravity-down edge of the fingertip footprint
5. retain a smaller side ridge and wet center film
6. update `wet`
7. create or feed only a small number of nearby collector candidates

### Slow drawing

Should:

- create a readable clear path
- keep soft, wet edges
- avoid uniform beads along the stroke
- retain enough moisture memory that later fog/runoff reacts to the same path

### Fast swipe

Should:

- clear a broader region
- transport more water
- feed a dominant downhill/leading-edge pool
- disturb existing heads
- trigger stronger runoff after the gesture

It must not spray hundreds of unrelated droplets.

---

## 8. Nucleation and pooling

Macroscopic visible flow heads may form only where liquid water has accumulated.

Preferred locations:

- gravity-down edge of a recent finger footprint
- intersection of wet strokes
- existing wet trail
- locally thick height-map pool
- vicinity of an existing dominant head

Rules:

- untouched fog does not randomly nucleate visible drops
- prefer feeding an existing nearby collector over making a new head
- repeated wiping in one local basin should converge toward one dominant collector or a few at most

---

## 9. Capillary collection

Once a head exists, it becomes a local collector.

A head should:

- collect water from a catchment larger than its visible footprint
- collect more aggressively while moving
- consume nearby unresolved film from the height map
- absorb nearby smaller heads / flows
- grow only when mass is acquired

Expected progression:

```text
small bead
-> collects film
-> grows
-> depins
-> begins moving
-> sweeps more water
-> grows further
-> moves faster
```

---

## 10. Merge model

Merging is a core acceptance requirement.

### 10.1 Head-head merge

When visible heads overlap or nearly overlap:

- combine mass
- combine momentum
- choose one surviving head
- expand footprint from combined mass

### 10.2 Head-body merge

If a head reaches another flow's connected trail/body:

- join that flow system
- transfer/unify ownership
- allow the dominant/downstream head to become the active front

### 10.3 Body-body merge

If two flow-ID regions or sufficiently wet connected bodies touch:

- unify flow IDs
- merge active flow ownership
- select one dominant front

This is essential. Two close parallel streaks must not remain separate indefinitely just because their circular head centers never collide.

### 10.4 Dominant collector capture

Within a local basin, a larger flow may capture smaller nearby pinned or slow flows.

The result should visually simplify into one or a few main rivulets.

---

## 11. Pinning and contact-angle hysteresis

Small drops do not automatically move simply because gravity exists.

Use a force-style heuristic inspired by contact-angle hysteresis:

```text
drive = inPlaneGravity * mobileMass
resistance = basePinning
           * contactFactor
           * surfaceHeterogeneity
           * dryWetFactor
```

Movement begins when drive exceeds resistance with reasonable hysteresis.

Resistance should decrease when:

- on an old wet trail
- local film is thick
- a recent merge has destabilized the contact line

Resistance should increase when:

- head is tiny
- glass is dry / untouched
- local stable pinning noise is high

Once moving, avoid immediately re-pinning every frame. Use hysteresis between start and stop conditions.

---

## 12. Motion, growth, and speed

Gravity uses the frozen validated `orientation.js` implementation.

A moving flow should experience:

- physical in-plane gravity
- mass-dependent drive
- viscous/contact damping
- weak stable heterogeneity
- preference for existing wet trails

Larger flows should generally:

- depin more easily
- collect from a wider catchment
- leave a wider trail
- reach a higher terminal velocity

Therefore a flow moving down a wet region should visibly become somewhat larger and faster as it descends.

Do not normalize away gravity-plane magnitude: nearly flat devices should produce weak flow.

---

## 13. Trail/body model

A moving flow writes real simulation state behind it.

Each trail should contain:

- residual `water`
- increased `wet`
- reduced local `fog`
- `flowId` / body ownership

Expected behavior:

- trail is narrower than the head
- trail width varies with flow mass
- residual water persists temporarily
- later flow preferentially follows/joins it
- trail can merge with another connected body
- optical trail fades faster than all physical wetness memory disappears

A constant-width black visual line is not acceptable as the physical representation.

---

## 14. Rendering model

Render the water from simulation state, not from arbitrary drop sprites.

Recommended conceptual order:

```text
UI
water highlights / meniscus
water refraction from height gradients / flow heads
fine condensation scattering / blur
mirrored front camera
```

Preferred cues:

- normals from water-height gradients
- camera-image displacement/refraction
- partial Fresnel highlight rather than full outline
- subtle dark meniscus/contact region
- rounder pinned head
- elongated moving head
- continuously connected head-to-trail shape
- downstream widening when flow mass increases

Avoid:

- outlined circles
- identical dot sprites
- constant-width dark strings
- independent particle trails disconnected from the water map

A WebGL path is desirable after the simulation behavior is correct. Canvas2D may remain as the prototyping renderer.

---

## 15. Steam / re-fog

Steam restores fine condensation over approximately 1–3 seconds.

Steam:

- increases `fog`
- does not delete `water`
- does not delete `wet`
- does not directly spawn macroscopic drops
- allows old wet trails to influence later condensation and runoff

The surface should feel persistent across repeated Steam cycles.

---

## 15a. Fresh — an even sheet again

Steam is additive and deliberately keeps everything: it is for making the glass
mistier while the water you already have is still running. It is not a way back
to a clean mirror, and after a few minutes of play there is no way back at all.

Fresh is that way back. It clears `water`, `wet` and `flowId` outright and lays
down one even sheet of new condensation — thick enough to hide the reflection,
with only a trace of the patchiness a mirror always has. It is the state the
glass is in when you walk into the bathroom, before anyone has touched it.

---

## 16. Natural re-condensation

Cleared areas may slowly re-fog without pressing Steam.

Keep this slow enough for finger drawings to remain enjoyable.

Recently wet areas may re-condense somewhat differently from untouched glass.

---

## 17. Surface heterogeneity

Generate a stable low-amplitude per-session field that slightly influences:

- pinning
- local flow steering
- nucleation preference

Requirements:

- deterministic within a session
- subtle
- gravity remains dominant
- no Brownian wandering / random zig-zagging

---

## 18. Performance targets

- current iPhone/iPad Safari
- stable 30 fps minimum goal; 60 fps preferred
- simulation grid roughly 128–256 cells on the shorter axis
- render resolution independent from simulation resolution
- small active-flow count
- use flow-ID/spatial maps rather than large all-pairs particle interaction
- measured `dt`; clamp large suspension gaps
- stop camera and expensive work when hidden

---

## 19. Implementation boundaries

Recommended responsibilities:

```text
camera.js       front camera lifecycle
orientation.js  frozen validated physical gravity mapping
input.js        pointer/touch paths and gesture velocity
condensation.js fog + water height + wetness + water transport
droplets.js     active flow heads + mass + pinning + merge + flow ID
render.js       camera/fog/water optical composition
app.js          orchestration and controls
breath.js       future experiment only
```

`orientation.js` is not part of the water-physics rewrite.

---

## 20. Breath experiment

Outside v0.1.

A browser cannot directly sense mirror humidity.

If investigated later, use only an optional local heuristic such as:

- face rapidly approaching the device
- optional exhalation-like broadband microphone signal
- broad local fog event

No recording or upload. No dependence on breath mode for normal operation.

---

## 21. Milestones

### Milestone A — lock known-good infrastructure

- camera works
- gravity stays on golden implementation
- touch paths work
- Steam works

### Milestone B — connected-flow physics

- surface-water height map is authoritative
- mass accounting works
- wiping transports water downhill
- few dominant collectors
- capillary collection
- head/head merge
- head/body merge
- body/body merge
- pinning hysteresis
- mass-dependent speed

### Milestone C — flow rendering

- continuous head/body shapes
- height-gradient normals
- refraction
- non-constant trail width
- no artificial outlines

### Milestone D — polish

- stronger hand swipe behavior
- multi-touch tuning
- Steam/re-condensation tuning
- performance profiling

---

## 22. v0.1 acceptance criteria

v0.1 is not accepted until all of these are true:

1. Front camera behaves like a mirror and remains privacy-safe.
2. Initial fog looks nonuniform and strongly obscures detail.
3. Finger can draw a recognizable path through condensation.
4. Wiping redistributes water instead of only erasing opacity.
5. Water accumulates mainly on the physical gravity-down side of disturbed regions.
6. Untouched fog does not spontaneously become a field of visible macroscopic beads.
7. Repeated wiping in one local region creates one dominant collector or a few, not dozens.
8. Small heads may remain pinned.
9. Larger heads depin more readily.
10. A moving head grows as it sweeps surface water.
11. A larger / heavier moving flow can reach a visibly higher speed.
12. Two nearby heads merge.
13. A head can merge into another flow's body/trail.
14. Nearby connected bodies can merge even without head-center collision.
15. Merge approximately conserves combined water mass.
16. A moving flow leaves residual water and wetness memory.
17. Old trails influence later flow.
18. Gravity remains correct on the already-tested iPad.
19. Nearly flat orientation reduces in-plane flow.
20. Steam restores fog without deleting water/wetness history.
21. Water rendering no longer looks like dots dragging constant-width dark lines.
22. Interaction remains stable on iPad/iPhone-class hardware.
23. App remains static-hostable with no backend.

Breath detection is not required for v0.1.

---

## 23. References

### Water on glass / merging / residual water

Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong. **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics*, 37(8), 963–973, 2013.

DOI: https://doi.org/10.1016/j.cag.2013.08.004

Key ideas used here:

- particle / flow-front + height-map hybrid
- ID-map-assisted merging
- water-flow formation
- residual water droplets / wet bodies

### Contact-angle hysteresis / sliding

Gulraiz Ahmed, Mathieu Sellier, Mark Jermy, Michael Taylor. **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics - B/Fluids*, 48, 218–230, 2014.

DOI: https://doi.org/10.1016/j.euromechflu.2014.06.003

Key ideas used here:

- gravity competes with contact-line resistance
- advancing and receding behavior differ
- hysteresis materially affects terminal sliding behavior

### Realtime rendering / architecture reference

`frmlinn/raindrops-v2`

https://github.com/frmlinn/raindrops-v2

Useful architectural ideas:

- separate 2D glass-surface condensation/merge logic from optical rendering
- downsampled buffers
- refraction based on droplet/water normals
- GPU-oriented rendering and object reuse

Fog Mirror adapts these ideas for touch-driven condensation on mobile Safari. It is intentionally a realtime heuristic model, not a full CFD solver.
