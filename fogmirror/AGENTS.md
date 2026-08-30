# AGENTS.md — Fog Mirror

## Purpose

Fog Mirror is a touch-first browser toy that makes a phone or tablet feel like a real steamed bathroom / sauna mirror.

The live front camera is the reflection. The simulated glass carries fine condensation, liquid water, wetness memory, and a small number of connected water flows. The user can wipe the fog, write with a finger, re-fog the surface with Steam, start over with Fresh, and watch displaced water gather, merge, depin, and run under physical gravity. Nothing re-fogs on its own: what is wiped off stays wiped off.

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

**Amendment (display rotation).** The rule above still holds for the *sensor
read*: no second transform is applied to `accelerationIncludingGravity`, and the
mapping is byte-identical to the golden commit. What Fog Mirror now does in
addition is rotate the *answer* into the frame the page is laid out in, because
the simulation relayouts on `orientationchange` and the sensor does not — past
that point the two are in different frames and the water runs the wrong way
across the picture. In portrait the rotation is the identity, so the verified
behaviour is untouched exactly where it was verified.

The important device finding, and the reason the obvious version is wrong:
CoreMotion axes are portrait-based on every iOS device, while
`screen.orientation.angle` is measured from the device's natural orientation,
which is landscape on an iPad — so an iPad held upright reports 90, not 0. **Do
not replace the existing `rotation()` logic with a bare `screen.orientation.angle`
rotation.** `tools/orientation.mjs` covers this and includes a negative control
showing that the bare version makes the world direction wander 180° on an iPad.


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

## Rules that are not tuning

Each of these was a bug that looked like a tuning problem and was not.

1. **Evaporation is a fraction of the water in a cell, never a fixed amount per cell.** A fixed amount makes the loss proportional to wetted area, and one wipe dries out in seconds.
2. **A thin film must coarsen towards its thickest neighbour.** Diffusion alone smooths water into a sheet too thin to bead, and nothing downstream can happen. Only deep cells level.
3. **A trail is drawn from the wetness map, not from the water it deposits.** The deposit is a hundredth of what the optics can read, and it cannot be raised — it comes out of the head. Without a film derived from `wet`, a rivulet is a hole in the fog with no edge and no highlight, and it reads as a scratch. `wet` contributes to the rendered surface only; it is never mass.
4. **Beads must be born close enough together to reach each other.** The spacing rule kept new drops further apart than the bridging distance, so however keen the merging, nothing ever met.
5. **The size at which a drop breaks away must be reachable from one catchment.** A bead drains its surroundings and stops growing; if it needs more than that, it sits just under the threshold for ever and never moves, merges or leaves a tail.
6. **A film cannot coarsen all the way.** Glass holds water: adhesion pins a thin residue that surface tension cannot move, so only the water above a bound height (scaled by the same heterogeneity field that pins drops) is free to gather. A wiped mirror keeps a faint damp haze that only evaporates away. Letting the whole film gather is claiming a perfectly smooth surface, and it makes the tail of every wipe one more bead, and one more. See PHYSICS.md §5a.
7. **A track that water has already run down cannot bead again.** A rivulet drains its channel; what is left is a bound residual film that dries in place. So a marked track evaporates several times faster, is exempt from coarsening, and cannot nucleate until water is actively put back there. Blocking only *live* bodies is not enough — the procession simply restarts the moment the head dies, and a mirror never wells water up out of itself. See PHYSICS.md §11b.
8. **Streams a few millimetres apart converge through wet glass, not through surface tension.** Tension reaches a fraction of a millimetre and must stay that short, or every new bead gets dragged sideways instead of falling. What acts at millimetres is the lower contact angle on already-wet glass, so a head senses `wet` several millimetres to each side and steers towards the wetter one. Being a difference, it is exactly zero on even glass and a lone drop still falls straight. See PHYSICS.md §11c.
9. **The water budget is physical, and scale-independent.** Film thicknesses — fully fogged glass, the thickness at which a film beads up, the residue adhesion binds — are declared in millimetres and divided by the cell size, exactly as drop radii are. They used to be raw height numbers about thirty times too large, so one scribble put two hundred drops' worth of water on the glass and the mirror spent a minute shedding it; and being raw, a tablet got twice the water of a phone for the same wipe. Preserve the *ratio* between the three if you change them. See PHYSICS.md §5a.
10. **A new bead's dewetting patch is solved for, not fixed.** Its mass comes out of the area of film it clears, so a thinner film must clear a wider one; a fixed radius means that below some thickness no bead can ever form. Draining wider than that supply radius is just as wrong — it eats the catchment the newborn needs to grow.
11. **A running drop sweeps the fog it crosses.** That is where most of the water in a long run comes from, it is why a run leaves a clear track and thickens downwards, and it is why runs are longer on foggier glass. It also closes the books: liquid + moving mass + fog×yield is conserved exactly, which the harness checks. See PHYSICS.md §8a.
12. **A finger is a squeegee, and its track is neither wet nor loaded.** It takes every bit of free water under the contact patch, leaving only what adhesion binds, and puts none of it back in the middle — water does not stay where a finger has just been. It also raises `wet` far less than a flow does: both leave "wetted glass", but only a rivulet's track carries the film the optics draw as water. A little of what it gathers leaves on the finger and never comes back. See PHYSICS.md §5.
13. **A finger carries the water with it.** A stroke has a load: each contact sample adds what it mobilises to that load rather than laying it down. Only the excess above what a fingertip can hold comes off along the way — that is what "you drew too long" means — plus a little from the trailing meniscus, and only where the glass grips harder than average. Lifting puts the whole remaining load down at the last point, and that blob is where the real drop comes from. Laying every sample down where it was taken turns one swipe into an even comb of two dozen small drips. See PHYSICS.md §5.
14. **Nothing re-fogs by itself.** There is no ambient re-condensation, and adding one back is not a tuning choice. Fog is worth liquid, so an endless supply of fog is an endless supply of water: a drop sweeps its track, sheds, the wet track re-fogs in seconds, the next drop sweeps it again. Measured after one drag and nothing else: thirteen drops ran for ninety seconds while the liquid on the glass *rose* from 141 to 526. Steam is the only way fog gets onto the glass and Fresh is how you start over — what the user wipes off stays wiped off. See PHYSICS.md §5c.
15. **The head cap is a performance budget, never a metering valve.** If a wiped ridge cannot bead all at once it beads in instalments instead, and keeps making drops for as long as the water lasts — which is exactly what "the glass keeps producing water" looks like. See PHYSICS.md §7a.
16. **Water a flow sheds stays part of that flow.** Excess above the size glass can hold, and the last of a head that dwindles away, are laid down as *track*, claimed in the flow map; and water sagging out of a track carries the track with it. Dropped as loose water on fresh glass it simply beads again a moment later, one line at a time.
17. **Trail width must sit below the drop's own radius, not above it.** The anti-staircase floor was wider than any drop this produces, so every streak came out the same width and three times fatter than its head. Lower the floor, and carry the visible difference in how wet the track is left — which scales with the head's mass. See PHYSICS.md §12b.

---

## Water mass rules

Water may enter or move between representations only through explicit transfers.

The budget is over **three** things, because the condensation is where the water comes from:

```text
water on the glass  +  mass in the flow heads  +  fog x fogYield  ( +  what a finger is carrying )
```

Allowed transfers:

- wiping converts local fog into liquid, and carries it along with the stroke
- a finger lays down what it cannot hold, and the rest where it lifts off
- a running head sweeps the fog it crosses into itself
- a flow head consumes water from the height map
- one flow may consume / merge another flow's mass
- a moving flow deposits a smaller residual amount into its trail/body

The only ways water leaves: **evaporation**, and the small share a finger carries off the
glass. The only way water arrives: **Steam**. Nothing else, ever — see rule 14.

Forbidden behavior:

- visible droplets growing without consuming water or merging
- Steam directly spawning macroscopic droplets
- random whole-screen visible nucleation
- generating a large drop from a single tiny fog sample
- any ambient process that puts fog, or water, back on the glass by itself

This is exact, not approximate, and the harness checks it: a wipe and then minutes of running
water change the total by zero.

---

## Finger wiping contract

A finger is a displacement event, not an eraser.

For each stroke sample:

1. clear the fine fog under the contact footprint, with a definite edge — a fingertip is
   pressed flat, not a soft brush
2. take the liquid that fog was holding, **and** every bit of free water already there, leaving
   only what adhesion binds. The track behind a finger is clear glass, not a wet band
3. add it to the stroke's **load** rather than laying it down
4. shed only what the finger cannot hold, plus a trickle from the trailing meniscus where the
   glass grips harder than average — toward the gravity-down edge and either side of the
   *track*, never into the middle of the footprint
5. raise wetness memory, but far less than a flow does
6. keep a small share on the finger for good

And when the finger lifts, put the whole remaining load down at the last point.

Expected behavior:

- no uniform row of dots along the entire stroke
- a short swipe leaves its drops **only where the finger came off**
- a long swipe leaves a few, unevenly spaced, and still the biggest one where it came off
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
water. Water inside a flow body must not nucleate a new head — not while that body is running,
and not after it has gone either, because the track it left is drained glass.

A trail must also **vary**. Its width follows the head's mass, and so does the wetness it lays
down, which is what the optics turn into a visible film. Identical streaks are the sign that a
grid-derived floor has swallowed the whole range.

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
- `orientation.js` — **frozen validated gravity implementation**, plus the display rotation (see the amendment above)
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
- keep the per-head cost low, but do **not** solve performance by lowering the head cap:
  below what a wiped ridge needs it becomes a metering valve and the glass appears to
  generate water for minutes (rule 15)
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
7. Two nearby flows merge through head or body contact rather than remaining parallel indefinitely; two starting 8 mm apart should join within about a third of that fall, and a lone drop should still fall straight.
8. Merge preserves approximate combined mass.
9. Trails retain residual water and influence later flow, vary in width and strength with the flow that laid them, and do not shed fresh drops of their own once the flow has passed.
10. Water rendering does not look like independent dots dragging black lines.
11. What the user wipes off stays wiped off: a stroke reads zero fog immediately and still reads zero a minute later, and only Steam brings it back.
12. A swipe's water ends up where the finger lifted, not spread evenly along the stroke.
13. One wipe sheds its drops once, within a few seconds, and produces none afterwards while left alone.
14. The budget — water, plus flow-head mass, plus fog times its liquid yield — changes by exactly zero across a wipe and across minutes of running water.

---

## References

Primary physics reference:

- Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong. **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics*, 37(8), 963–973, 2013. DOI: https://doi.org/10.1016/j.cag.2013.08.004

Pinning / hysteresis reference:

- Gulraiz Ahmed, Mathieu Sellier, Mark Jermy, Michael Taylor. **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics - B/Fluids*, 48, 218–230, 2014. DOI: https://doi.org/10.1016/j.euromechflu.2014.06.003

Realtime rendering / implementation reference:

- `frmlinn/raindrops-v2`: https://github.com/frmlinn/raindrops-v2

These references inform the architecture; Fog Mirror remains a realtime heuristic simulation optimized for mobile Safari, not a full CFD solver.
