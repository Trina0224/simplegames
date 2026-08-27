# Fog Mirror — Physics Redesign Notes

## Why this redesign exists

The first playable prototypes treated visible water mostly as independent particles. That produced several artifacts that do not match a real steamed mirror:

- too many isolated beads
- beads appearing away from wiped edges
- nearby streams remaining parallel instead of coalescing
- droplets not growing enough as they travel
- trail geometry behaving like independent lines rather than one connected flow
- tuning depending too heavily on magic thresholds

The next model is based on the graphics literature for real-time water on glass, plus basic contact-angle hysteresis behavior.

## Primary reference model

Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong, **“A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 2013, 963–973.** DOI: 10.1016/j.cag.2013.08.004.

Useful ideas adopted from that work:

- combine moving particles / flow fronts with a **height map** that stores water on the glass
- use a persistent map to support efficient **drop/flow merging**
- represent a moving water flow by its **front**, with the body/trail following behind
- preserve **residual water** after a flow passes instead of deleting all liquid
- allow water flows to meander rather than moving as perfectly straight lines
- convert a water-height representation into optical normals for rendering rather than outlining droplets with strokes

We are not copying the paper implementation exactly. Fog Mirror has a different source of water: condensed steam plus finger wiping, and it must run inside mobile Safari. The architecture is adapted to that use case.

## Contact-angle hysteresis / pinning

Reference: **“Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces,” European Journal of Mechanics B/Fluids 48 (2014), 218–230.** DOI: 10.1016/j.euromechflu.2014.06.003.

Important behavior:

- gravity pulls a drop downslope
- contact-angle hysteresis resists motion while the contact line is pinned
- the advancing and receding sides of a moving droplet behave differently
- a droplet therefore does not begin sliding merely because gravity exists
- once a drop grows, merges, or enters an already-wet trail, the effective resistance can fall enough for it to move

Fog Mirror will use a coarse heuristic form of this rather than solving lubrication equations.

## Rendering reference

Modern real-time rain-window implementations such as `frmlinn/raindrops-v2` separate the 2D condensation / merging simulation from optical rendering and use downsampled buffers, normals, and refraction rather than strong drawn outlines. Fog Mirror should follow the same separation: simulation state first, optics second.

## New state model

### 1. Fog field

`fog[x,y]`

Microscopic condensation responsible for blur and milkiness. This is not a set of visible macroscopic particles.

### 2. Surface-water height map

`water[x,y]`

Liquid water currently spread across the glass as film, ridges, residual trails, and small unresolved beads.

Water must be conserved approximately:

- wiping converts part of fog into liquid water
- a visible flow head removes water from the height map when it collects it
- a moving flow leaves a smaller amount behind as residual water
- merging sums the masses of the merged flows

### 3. Wetness / hysteresis map

`wet[x,y]`

Longer-lived memory of recently wetted glass. It modifies pinning and future condensation without itself representing a large quantity of liquid.

### 4. Flow-ID map

`flowId[x,y]`

A low-resolution integer map identifying which active flow or recent trail owns a region. It is used for broad-phase merging: two flow bodies that touch should merge even when their circular head particles are not yet overlapping.

### 5. Active flow heads

There should normally be only a small number of active macroscopic objects.

Each flow contains approximately:

```text
id
x, y               current front/head position
mass                total mobile water
vx, vy
pinned
age
footprintRadius
trailWidth
```

The visible “drop” is the head/front of a connected body, not an isolated marble.

## Finger wiping

A finger is a displacement event, not an eraser.

For each stroke sample:

1. reduce fine fog under the contact footprint
2. convert a meaningful fraction of removed fog into surface water
3. move most of that water toward the **gravity-down edge** of the footprint
4. keep a thinner ridge on the side edges
5. update wetness along the cleared stroke
6. mark the disturbed region as a candidate source for a small number of flow heads

Do not randomly nucleate drops over the whole wet area.

A single local wiped region should generally end up with **one dominant collector or a few at most**.

## Head formation

A new active flow head may form only when:

- the candidate location is associated with a recent wipe / disturbed edge, and
- enough water exists in the nearby height map, and
- no existing dominant head is close enough to collect that water instead

When possible, feed an existing nearby head rather than creating another one.

## Capillary collection and coalescence

Once a head exists, it is a collector.

At every update it should:

- collect surface water from a catchment larger than its visible footprint
- collect more aggressively while moving
- attract nearby smaller mobile/pinned heads over a short range
- merge immediately when head footprints overlap
- merge when their **flow-ID regions / wet bodies touch**, even if head centers are still separated

This is the main mechanism that should turn several close streaks into one dominant flow.

## Mass, size, and speed

The flow must grow as it descends.

Conceptually:

```text
mass(t+dt) = mass(t)
           + collected height-map water
           + intercepted droplet mass
           - residual water left in the trail
```

Visible head radius should derive from mass with a sub-linear relation. The exact scale is perceptual, but it must not grow without a corresponding mass increase.

Larger drops should generally:

- depin more easily
- have a wider collection footprint
- leave a wider trail
- reach a higher terminal speed

This produces the desired sequence:

```text
small pinned bead
→ collects neighbours
→ becomes a small drop
→ begins creeping
→ sweeps up more water
→ becomes larger
→ slides faster
```

## Pinning heuristic

Use a force-style comparison rather than only `radius > threshold`.

Approximate:

```text
drive = gravityAlongGlass * mass
resistance = basePinning
             * surfaceHeterogeneity
             * drySurfaceFactor
             * contactPerimeterFactor
```

Reduce resistance when:

- the head is on an old wet trail
- it has just merged
- the local water film is thick

Increase resistance for:

- very small heads
- dry / untouched glass
- strong local surface-pinning noise

## Motion

The main flow direction comes from the flow front and gravity.

Motion should include:

- physical gravity projected into screen coordinates
- damping / terminal velocity
- very small lateral variation from stable surface heterogeneity
- preference for existing wet trails

Do not use large random jitter.

## Trail deposition

A moving flow head should write a connected body into the height map and flow-ID map.

The trail should:

- be narrower than the head
- retain some residual water
- remain optically clearer than untouched fog
- reduce later pinning
- allow nearby later flows to join it

The trail should not be represented only as a visual line disconnected from the simulation.

## Merge behavior

There are two merge tests:

### Head merge

If two visible heads overlap or nearly overlap, combine mass and momentum.

### Body / flow-ID merge

If the rasterized bodies/trails of two active flows touch or overlap, unify them into one flow ID and choose a dominant head. The larger / farther-downstream head normally becomes the surviving front.

This is needed for realistic joining of nearby parallel streaks.

## Gravity / orientation

Water direction must follow physical gravity on the device.

Because DeviceMotion conventions differ across devices/orientations, do not depend on one hard-coded sign convention. Use a calibration/reference strategy and verify on iPad/iPhone:

- portrait upright → down is screen-down
- right edge physically downward → flow moves screen-right
- left edge physically downward → flow moves screen-left
- nearly flat → in-plane gravity approaches zero and drops mostly pin/pool

A debug overlay or console hook for raw and transformed gravity vectors is acceptable during development.

## Rendering implications

Visible water should be derived from the surface height plus active heads.

Avoid complete gray/white outlines.

Preferred optical cues:

- height-gradient normals
- refraction/distortion of the camera image
- partial Fresnel highlight
- subtle darker meniscus / contact region
- slight elongation of a moving head
- trail normals blended continuously into the head

## Performance strategy

The physically inspired representation is deliberately low resolution:

- height / wet / flow-ID maps: approximately 128–256 cells on the shorter dimension for mobile
- only a small set of active flow heads
- use spatial buckets or the flow-ID map instead of O(N²) interactions when possible
- renderer may upscale/smooth the maps independently

## Acceptance tests for this redesign

1. Untouched fog does not spontaneously become a field of visible beads.
2. Wiping produces water mainly on the gravity-down edge of the stroke.
3. Repeated wiping in one local region tends toward one dominant drop or a few, not dozens.
4. A moving drop grows noticeably as it travels through a wet region.
5. Larger drops move faster than smaller drops, while small beads can remain pinned.
6. Two nearby streaks can join into one flow even before their head centers overlap exactly.
7. A merged flow preserves approximately the combined water mass.
8. A flow leaves residual wet water that influences later flows.
9. Rotating the device changes the flow direction correctly.
10. Rendering has no obvious artificial outline around every drop.

## References

- Chen, K.-C., Chen, P.-S., Wong, S.-K. (2013). *A heuristic approach to the simulation of water drops and flows on glass panes.* Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.
- *Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.* European Journal of Mechanics B/Fluids 48 (2014), 218–230. DOI: 10.1016/j.euromechflu.2014.06.003.
- `frmlinn/raindrops-v2` — modern WebGL rain-window experiment using separate 2D condensation logic and optical refraction rendering.
