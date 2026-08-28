# AGENTS.md — Fog Mirror

## Purpose

Fog Mirror is a touch-first browser toy that makes a phone or tablet feel like a real steamed bathroom / sauna mirror.

The live front camera is the reflection. The simulated glass carries fine condensation, liquid water, wetness memory, and a small number of connected water flows. The user can wipe the fog, write with a finger, re-fog the surface, and watch displaced water gather, merge, depin, and run under physical gravity.

The primary design target is **believable physical behavior**, not a generic particle effect.

Primary devices:

- iPhone
- iPad / iPad mini
- Android phones/tablets where practical

Static GitHub Pages only. No backend.

---

## Read these first

Before changing condensation, droplets, flow, merge, pinning, rendering, or gravity, read:

1. [`SPEC.md`](SPEC.md)
2. [`PHYSICS.md`](PHYSICS.md)

`PHYSICS.md` is the source of truth for the simulation model.

---

## NON-NEGOTIABLE: gravity is frozen

The current iPad gravity mapping is a **golden reference** because it was verified on real hardware by the user.

The verified implementation comes from repository commit:

`89b765f0420f40e0f7c1831d56a242b50dc1dce5` — `Fix Fog Mirror gravity direction on iPad`

Its essential behavior is:

```js
const a = e.accelerationIncludingGravity;
const mag = Math.max(0.001, Math.hypot(a.x, a.y, a.z || 0));
const tx = -a.x / mag;
const ty = -a.y / mag;
```

with low-pass filtering and **no additional `screen.orientation` rotation**.

On the tested iPad this gives the correct physical directions:

- upright device -> screen down
- physical right edge down -> screen right
- physical left edge down -> screen left
- nearly flat -> weak in-plane gravity

### Rule

**Do not rewrite, recalibrate, reinterpret, or replace this gravity mapping unless a new real-device test first demonstrates a concrete regression.**

Do not switch to `DeviceOrientationEvent` merely because it looks theoretically cleaner. Do not add a second screen-orientation transform. Do not infer axis signs from documentation when the existing mapping has already been empirically validated on the target hardware.

Gravity may expose debug data, but debug code must not change the vector calculation.

---

## Core simulation contract

The water model is based on a **surface-water height map + wetness memory + a small number of active flow heads/fronts + a flow-ID/connectivity map**.

It is inspired primarily by Chen, Chen & Wong (2013), who combine particles/fronts with a height map and ID map to simulate water drops, flows, merging, and residual water on glass.

Do not regress this into hundreds of unrelated decorative particles.

Required state concepts:

- `fog(x,y)` — microscopic condensation / optical haze
- `water(x,y)` — liquid-water height map; this is real available water mass
- `wet(x,y)` — longer-lived wetness / hysteresis memory, not free water mass
- `flowId(x,y)` — low-resolution connected-flow ownership / merge support
- active `flow heads` — small set of mobile fronts carrying explicit mass and momentum
- `(gx, gy, plane)` — frozen, validated physical gravity projection

---

## Sizes are physical

Drop sizes are defined in CSS pixels — a stand-in for millimetres — and converted to simulation cells at runtime, never the other way round. A cell is a different real length on every screen, so any size expressed in cells is a different drop on a phone than on a tablet.

Water's capillary length is about 2.7 mm. A drop much bigger than that cannot be held on vertical glass: it sheds into a rivulet or falls off. Nucleation, depinning and the maximum size are all set from that scale, and the pinning resistance, gravity drive and drag are scaled by cell size so the same drop behaves the same way on every device.

If a drop looks too big, the number to change is `MAX_RADIUS_PX`, in millimetres. Do not compensate elsewhere.

---

## Three rules that are not tuning

Each of these was a bug that looked like a tuning problem and was not.

1. **Evaporation is a fraction of the water in a cell, never a fixed amount per cell.** A fixed amount makes the loss proportional to wetted area, and one wipe dries out in seconds.
2. **A thin film must coarsen towards its thickest neighbour.** Diffusion alone smooths water into a sheet too thin to bead, and nothing downstream can happen. Only deep cells level.
3. **The size at which a drop breaks away must be reachable from one catchment.** A bead drains its surroundings and stops growing; if it needs more than that, it sits just under the threshold for ever and never moves, merges or leaves a tail.

---

## Water mass rules

Water may enter or move between representations only through explicit transfers.

Allowed sources / transfers:

- wiping converts part of local fog into liquid surface water
- wiping transports surface water toward the gravity-down side of the contact footprint
- a flow head consumes water from the height map
- one flow may consume / merge another flow's mass
- a moving flow deposits a smaller residual amount into its trail/body
- slow re-condensation may add small amounts of surface water on already-wet glass

Forbidden behavior:

- visible droplets growing without consuming water or merging
- Steam directly spawning macroscopic droplets
- random whole-screen visible nucleation
- generating a large drop from a single tiny fog sample

Approximate conservation is required even though this is a realtime heuristic model.

---

## Finger wiping contract

A finger is a displacement event, not an eraser.

For each stroke sample:

1. reduce fine fog under the contact footprint
2. convert a meaningful fraction of removed condensation to surface water
3. transport most mobile water toward the **physical gravity-down edge** of the contact patch
4. leave a smaller side ridge / wet film
5. update wetness memory
6. offer only a small number of local pooling/nucleation sites

Expected behavior:

- no uniform row of dots along the entire stroke
- no droplets away from disturbed/wet regions
- repeated wiping in one basin should preferentially feed an existing dominant collector
- a fast swipe may create stronger pooling, but must not spray hundreds of unrelated beads

---

## Flow-head model

A visible moving drop is the **front/head of a connected water body**, not an isolated marble.

Each active flow should conceptually contain:

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

A head's visible radius / footprint must derive from its mass.

A moving head should:

- collect height-map water from a catchment larger than its visible footprint
- collect more aggressively while moving
- become visibly larger as mass increases
- become more likely to depin as mass increases
- have a higher terminal speed as mass increases
- leave residual wet water in a connected trail

The desired visual sequence is:

```text
small bead
-> collects nearby film / small drops
-> becomes a small drop
-> depins
-> begins creeping
-> sweeps up more water
-> grows
-> accelerates
```

---

## Merge behavior is a correctness requirement

Two nearby water paths must not remain parallel forever.

Support at least these merge paths:

1. **head-head merge** — visible fronts overlap / nearly overlap
2. **head-body merge** — a head reaches another flow's wet connected body
3. **body-body merge** — two connected trail regions touch / overlap in the flow-ID map
4. **dominant collector capture** — a small nearby bead/flow is pulled into a larger local collector instead of continuing independently

When flows merge:

- preserve approximate combined mass
- combine momentum sensibly
- select one dominant surviving head/front
- unify flow IDs / body ownership
- prefer the larger or downstream head when choosing the surviving front

A merge should normally produce one stronger flow rather than two overlapping rendered lines.

---

## Pinning / hysteresis

Do not use only `radius > threshold`.

Use a force-style heuristic inspired by contact-angle hysteresis:

```text
drive ~= inPlaneGravity * mobileMass
resistance ~= basePinning * contactFactor * surfaceFactor
```

Resistance should decrease on:

- old wet trails
- thick local film
- recently merged flow

Resistance should increase for:

- tiny heads
- dry / untouched glass
- stable surface heterogeneity

Small beads may remain pinned while a neighbouring larger drop moves.

---

## Trail contract

A trail is simulation state, not just a drawn line.

A moving flow must write:

- residual water
- increased wetness
- reduced fog
- connected flow-ID/body information

A trail must be **thin**. This is not a look, it is a physical constraint: a head that leaves
much of itself behind stalls after a few millimetres, and the water it drops re-beads and runs
and drops again, so one wipe produces drops forever. A wiped patch holds a fixed amount of
water. Water inside a flow body that is still running must not nucleate a new head.

A trail should:

- be narrower than the head
- remain wet for a while
- reduce later pinning
- guide future water
- participate in merge detection
- gradually fade / re-fog

Do not render a constant-width dark stroke behind every drop.

---

## Rendering contract

Simulation and optics are separate.

Visible water should be derived from the water height field plus active flow heads/bodies.

Avoid:

- full gray/white outlines around every drop
- constant-width black trails
- circles that read as UI dots
- particle sprites unrelated to underlying water mass

Prefer:

- height-gradient normals
- camera refraction / displacement
- partial Fresnel highlights
- darker meniscus/contact region only where appropriate
- mass-dependent head footprint
- a teardrop shape for a moving head — round in front, tapered behind into its
  own trail; a symmetric ellipse reads as an egg
- continuous blending between head and trail/body
- lower-resolution simulation buffers upscaled smoothly for mobile performance

A modern real-time reference is `frmlinn/raindrops-v2`, which separates glass-surface simulation from optical refraction rendering.

---

## Privacy / camera

- front camera only by default
- horizontally mirror the preview
- `audio: false` for normal mirror use
- no screenshots, photos, blobs, recordings, uploads, or frame transmission
- stop camera tracks when disabled, hidden, or leaving page
- breath experiments, if ever added, require separate explicit microphone permission and remain local-only

---

## Breath scope

Breath detection is experimental and outside the v0.1 acceptance gate.

Do not sacrifice fog/water realism for breath detection work.

If revisited later, prefer a hybrid heuristic:

- face rapidly approaches the screen
- optional exhalation-like local audio signal
- emit one broad local fog event

No claim of actual humidity sensing.

---

## Implementation boundaries

Recommended modules:

- `camera.js` — camera lifecycle only
- `orientation.js` — **frozen validated gravity implementation**
- `input.js` — touch/pointer path and gesture velocity
- `condensation.js` — fog/water/wetness fields and water transport
- `droplets.js` — active flow heads, mass, merge, pinning, flow IDs, connected trails
- `render.js` — optical composition/refraction
- `app.js` — orchestration and controls

Do not hide physics in rendering code.

---

## Performance

- target current iPhone/iPad Safari
- stable 30 fps is acceptable; 60 fps preferred
- simulation resolution independent from display resolution
- keep active flow-head count small
- use flow-ID/spatial maps instead of large O(N^2) particle clouds
- pause expensive work when hidden

---

## Required acceptance tests before calling physics 'better'

1. Gravity remains correct on the previously tested iPad.
2. Untouched fog does not become a field of visible beads.
3. Wiping concentrates liquid primarily at the gravity-down edge.
4. Repeated wiping in one local region tends toward one dominant drop or a few.
5. A moving flow becomes larger as it collects water downstream.
6. A larger flow reaches a higher speed than a smaller flow under the same gravity.
7. Two nearby flows merge through head or body contact rather than remaining parallel indefinitely.
8. Merge preserves approximate combined mass.
9. Trails retain residual water and influence later flow.
10. Water rendering does not look like independent dots dragging black lines.

---

## References

Primary physics reference:

- Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong. **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics*, 37(8), 963–973, 2013. DOI: https://doi.org/10.1016/j.cag.2013.08.004

Pinning / hysteresis reference:

- Gulraiz Ahmed, Mathieu Sellier, Mark Jermy, Michael Taylor. **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics - B/Fluids*, 48, 218–230, 2014. DOI: https://doi.org/10.1016/j.euromechflu.2014.06.003

Realtime rendering / implementation reference:

- `frmlinn/raindrops-v2`: https://github.com/frmlinn/raindrops-v2

These references inform the architecture; Fog Mirror remains a realtime heuristic simulation optimized for mobile Safari, not a full CFD solver.
