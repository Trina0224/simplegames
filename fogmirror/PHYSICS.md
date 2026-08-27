# Fog Mirror — Physics Design Notes

## 1. Why this redesign exists

The early playable prototypes treated visible water mostly as independent particles. Real-device testing exposed several artifacts that do not match a steamed mirror:

- too many isolated beads
- beads appearing away from wiped edges
- several nearby streaks remaining parallel instead of coalescing
- droplets not growing enough while descending through wet regions
- constant-width dark trails that look drawn rather than physical
- large dependence on ad-hoc thresholds and random nucleation

The redesign uses a realtime heuristic architecture informed by published water-on-glass work and contact-angle hysteresis literature.

The goal is not full CFD. The goal is a compact mobile simulation that reproduces the specific macroscopic cues humans expect from water on a fogged vertical glass surface.

---

## 2. Primary literature

### Chen, Chen & Wong (2013)

Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong. **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics*, 37(8), 963–973, 2013.

DOI: https://doi.org/10.1016/j.cag.2013.08.004

The paper explicitly combines a **particle system and height map** for water drops/flows on glass and uses an **ID map** for efficient merging. It also models residual water after a flow passes.

Fog Mirror adopts these ideas in modified form:

- a surface-water height map
- only a few active moving fronts/heads
- connected trail/body state
- a flow-ID/connectivity map
- body-contact merging
- residual water left behind after runoff

Fog Mirror differs because its water source is condensation plus finger wiping rather than rain.

### Ahmed, Sellier, Jermy & Taylor (2014)

Gulraiz Ahmed, Mathieu Sellier, Mark Jermy, Michael Taylor. **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics - B/Fluids*, 48, 218–230, 2014.

DOI: https://doi.org/10.1016/j.euromechflu.2014.06.003

Important implications:

- gravity drives a droplet downslope
- contact-angle hysteresis resists motion
- advancing and receding contact regions behave differently
- a droplet does not slide merely because gravity exists
- including hysteresis improves agreement with measured sliding behavior

Fog Mirror uses a simplified force/hysteresis heuristic rather than solving the lubrication equations.

### Rendering implementation reference

`frmlinn/raindrops-v2`

https://github.com/frmlinn/raindrops-v2

Useful architecture:

- 2D glass-surface condensation / droplet simulation separated from optical rendering
- downsampled buffers
- normals / refraction for the water appearance
- GPU-oriented compositing and object reuse

---

## 3. Golden gravity implementation — DO NOT REDESIGN

Real-device testing established a known-good gravity mapping on the user's iPad.

Golden repository commit:

`89b765f0420f40e0f7c1831d56a242b50dc1dce5`

The verified implementation uses:

```js
const a = e.accelerationIncludingGravity;
const z = Number.isFinite(a.z) ? a.z : 0;
const mag = Math.max(0.001, Math.hypot(a.x, a.y, z));
const tx = -a.x / mag;
const ty = -a.y / mag;
const tz = -z / mag;
```

with low-pass filtering and **no extra screen-orientation rotation**.

Observed correct behavior:

- upright -> screen down
- right physical edge down -> screen right
- left physical edge down -> screen left
- near-flat -> weak in-plane gravity

This is an empirical target-hardware fact for this project. Do not replace it with calibration, a DeviceOrientation reconstruction, or a second rotation unless a new real-device test first proves a regression.

The water-physics redesign must treat gravity as an input and leave `orientation.js` alone.

---

## 4. State model

### 4.1 Fog field

`fog[x,y]`

Microscopic condensation responsible for blur, milkiness, and fine surface texture.

Fog is not rendered as hundreds of macroscopic droplets.

### 4.2 Surface-water height map

`water[x,y]`

Liquid water spread over the glass:

- thin film
- wiped ridges
- local pools
- residual trail water
- unresolved micro-beads that are already liquid but too small to render individually

This is the authoritative source of water mass for active visible flows.

### 4.3 Wetness / hysteresis map

`wet[x,y]`

Longer-lived memory of wet glass.

It influences:

- contact-line resistance
- future condensation
- preferred channels
- trail reuse

It is not itself a mass reservoir.

### 4.4 Flow-ID / connectivity map

`flowId[x,y]`

Low-resolution integer ownership of active/recent connected flow bodies.

Primary purposes:

- head-body intersection
- body-body intersection
- efficient merge broad phase
- connected representation of a rivulet rather than a collection of independent circles

### 4.5 Active flow heads/fronts

There should normally be only a small number of macroscopic moving fronts.

Conceptual record:

```text
id
x, y
mass
vx, vy
pinned
footprintRadius
trailWidth
age
recentlyMerged
```

The rendered visible drop is the thick front/head of a connected water body.

---

## 5. Finger wiping as water transport

A finger is not an opacity eraser.

For each stroke footprint:

1. clear/reduce microscopic `fog`
2. convert some removed condensation into liquid `water`
3. gather some pre-existing local liquid water
4. transport most mobile water toward the physical gravity-down side of the contact footprint
5. leave a smaller side ridge / central wet film
6. raise `wet`
7. update local pooling candidates

Important consequence:

**nucleation must follow transported water**, not random sampling across an arbitrary wet rectangle.

A long stroke may produce several pooling zones, but repeated wiping over one local region should tend toward one dominant collector or a few, not dozens of identical beads.

---

## 6. Water mass accounting

Use approximate mass conservation.

Conceptually:

```text
surfaceMass = sum(water cells)
mobileMass  = sum(active flow mass)
```

Transfers:

```text
fog -> water              wiped condensation / slow condensation
water -> mobile flow      collection / pooling
flow + flow -> flow       merge
mobile flow -> water      residual trail deposit
```

For one active flow:

```text
M(t+dt) = M(t)
        + collectedHeightMapWater
        + mergedFlowMass
        - residualTrailWater
```

Do not independently animate radius upward.

If the visible footprint gets larger, mobile mass must have increased.

---

## 7. Head formation / nucleation

A new macroscopic head may form only when:

- the location is connected to recent disturbance / pooling or an existing wet body
- nearby height-map water exceeds a local threshold
- no existing dominant collector is close enough to take the water instead

Preferred locations:

- gravity-down edge of finger contact
- stroke intersections
- local height-map maxima
- existing trail/body

Untouched fog should not spontaneously create a screen full of visible beads.

---

## 8. Capillary collection heuristic

A formed head acts as a collector.

Each update it should:

- consume height-map water from a radius larger than its rendered footprint
- increase collection radius moderately with mass
- collect more effectively while moving
- prefer water ahead/downstream and along connected wet bodies
- absorb sufficiently close smaller heads

This is a realtime heuristic for the visual effect of coalescence and film collection; it is not a literal capillary-pressure solver.

Expected behavior:

```text
small bead
-> nearby film drains into it
-> bead grows
-> pinning threshold is overcome
-> drop begins moving
-> swept film and small drops increase its mass
-> head gets larger
-> flow gets faster
```

---

## 9. Merge topology

This is the key change from the old independent-particle model.

### 9.1 Head-head

If two heads overlap / nearly overlap:

```text
M = M1 + M2
P ~= P1 + P2
```

Choose one surviving front and derive its footprint from the new mass.

### 9.2 Head-body

If a head reaches cells owned by another flow body:

- merge the two flow systems
- transfer mass/ownership
- normally keep the larger or farther-downstream head as the surviving front

### 9.3 Body-body

If two connected body regions touch/overlap:

- unify their flow IDs
- merge active ownership
- collapse the system to one dominant moving front where practical

This prevents two nearly parallel rivulets from remaining separate forever.

### 9.4 Local dominant collector

Within a local basin, a larger flow should preferentially capture smaller nearby flows or pooling candidates.

This reduces visual clutter and produces the expected one/few main runoff streams.

---

## 10. Pinning / contact-angle hysteresis heuristic

A simple radius threshold is insufficient.

Use separate start/stop conditions.

Conceptually:

```text
drive = planeGravityMagnitude * mass * gravityScale

startResistance = basePinning
                * contactFactor
                * heterogeneity
                * dryWetFactor

stopResistance  = startResistance * hysteresisRatio
```

with `stopResistance < startResistance` so an already-moving drop does not instantly re-pin.

Resistance reductions:

- old wet trail
- thick local liquid film
- recent merge / disturbed contact line

Resistance increases:

- tiny mass
- dry/untouched glass
- locally stronger fixed surface heterogeneity

---

## 11. Motion and terminal speed

The validated gravity vector is the primary direction.

Motion may include:

- gravity drive proportional to available in-plane gravity
- damping / contact resistance
- weak stable lateral heterogeneity
- weak attraction to existing wet trails

Avoid large random jitter.

Mass coupling requirements:

- larger mass -> greater tendency to remain moving
- larger mass -> wider collection footprint
- larger mass -> wider trail
- larger mass -> higher terminal velocity, within a perceptually bounded range

Therefore downstream runoff should commonly appear larger and somewhat faster than the upstream initial bead.

---

## 12. Trail/body deposition

The moving head writes a continuous connected body.

Deposited state:

- residual `water`
- increased `wet`
- reduced `fog`
- active/recent `flowId`

Trail width should depend on current flow mass and be narrower than the head.

Residual deposition must be less than the water swept into the flow or the simulation will create water from nowhere.

Trails should later:

- reduce pinning
- guide new flows
- participate in merge detection
- re-fog optically over time while some physical wet memory persists longer

---

## 13. Rendering implications

The old visual of a circular head dragging a constant-width dark line is not accepted.

Preferred rendering source:

```text
water height map
+ connected body mask / flow IDs
+ active head geometry
```

From that derive:

- normal gradients
- local camera refraction
- soft/highlight meniscus
- mass-dependent footprint
- directional elongation for moving fronts
- continuously varying trail width

Avoid:

- complete outlines
- identical dots
- uniform black strings
- head and trail that look visually disconnected

A future WebGL renderer can downsample the glass water buffer and use its gradients for refraction, similar in architectural spirit to modern rain-window implementations.

---

## 14. Performance strategy

Target mobile Safari.

Recommended scale:

- `fog/water/wet/flowId`: ~128–256 cells on the shorter dimension
- few active heads
- raster body/contact tests instead of large all-pairs particle clouds
- local neighborhood operations only
- renderer resolution independent from physics resolution

Stable 30 fps is preferable to unstable 60 fps.

---

## 15. Validation sequence

Do not tune optics before these physics tests pass.

### Test A — gravity regression

The existing iPad gravity behavior must remain correct. Any water-physics rewrite that breaks it is rejected.

### Test B — one wiped basin

Repeatedly wipe one small vertical region.

Expected:

- water accumulates on the gravity-down side
- one main collector or a few form
- not a uniform bead field

### Test C — downstream growth

Create one moving head over a wet path.

Expected:

- mass increases downstream
- visible head grows moderately
- speed increases moderately

### Test D — two close rivulets

Create two nearby runoff paths.

Expected:

- head-head or body-contact merge occurs
- result becomes one connected dominant flow rather than two forever-parallel lines

### Test E — trail reuse

Steam/re-wet a region containing an old trail.

Expected:

- new water preferentially joins/follows that wet path

### Test F — mass sanity

No macroscopic drop should appear or grow without a traceable local water source / merge.

---

## 16. References

1. Chen, K.-C., Chen, P.-S., Wong, S.-K. (2013). **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics*, 37(8), 963–973. https://doi.org/10.1016/j.cag.2013.08.004

2. Ahmed, G., Sellier, M., Jermy, M., Taylor, M. (2014). **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics - B/Fluids*, 48, 218–230. https://doi.org/10.1016/j.euromechflu.2014.06.003

3. `frmlinn/raindrops-v2` — realtime rain/glass rendering architecture and refraction reference. https://github.com/frmlinn/raindrops-v2

These references guide architecture and qualitative behavior. Fog Mirror remains a realtime heuristic simulation designed for touch-driven condensation and mobile-browser performance.
