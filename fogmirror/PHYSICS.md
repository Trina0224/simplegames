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

## 4.6 Physical scale — sizes are millimetres, not cells

Water has a capillary length of about 2.7 mm: `sqrt(surface tension / (density x g))`.
It is the length at which surface tension stops being able to hold water against gravity.
A drop much larger than that on vertical glass does not creep — it sheds into a rivulet or
runs off. Anyone who has looked at a steamed mirror knows the sizes: a haze of beads well
under a millimetre, a scattering at one millimetre, and the two-millimetre ones are the few
that leave a streak down the glass. Larger than that and it has already gone.

Every size in `droplets.js` is therefore defined in CSS pixels and converted to cells at
runtime, because a cell is a different physical length on every device — nearly twice as
long on a tablet as on a phone. A CSS pixel is close to 0.16 mm on both, so it stands in
for millimetres well enough.

```text
new bead            ~0.5 mm across
breaks away at      ~1.0 mm across, earlier on a wet trail than on dry glass
maximum             ~2.3 mm across; beyond this the head sheds into its trail
terminal speed      ~10-12 mm/s at full size, and it rises with mass^0.4
```

Note that the renderer widens a drop slightly: the water channel is smoothed before it
becomes a surface, which costs a fraction of a millimetre on the apparent diameter. The
smoothing has to stay light for that reason — enough to stop the coarse grid showing as
facets, not enough to fatten every bead.

The three constants that must scale with cell size are the pinning resistance, the gravity
drive, and the drag — otherwise the same drop breaks away at one size on a phone and a very
different one on a tablet. Measured on both, a drop now nucleates, depins and caps out at
the same physical size to within a few hundredths of a millimetre.

A cap is not a special case bolted on. Past it the head keeps collecting and deposits the
excess into its trail, which is exactly how a drop that has outgrown the glass behaves: it
runs, and it leaves the extra water behind it.

---

## 5. Finger wiping as water transport

A finger is not an opacity eraser.

For each stroke footprint:

1. clear/reduce microscopic `fog`
2. convert some removed condensation into liquid `water`
3. gather **all** the free liquid water under the contact patch
4. transport most of it toward the physical gravity-down side of the footprint
5. leave the rest as a ridge either side of the **track**
6. raise `wet` — but only a little
7. update local pooling candidates
8. carry a little of it off on the finger, permanently

### The finger is a squeegee, and its track is not wet

A finger is a displacement, but it is not a *soft* one. Two things followed from treating it as
a brush, and both were wrong:

- It **left water where it had just been**: a little under half of the liquid under the rim of
  the contact patch stayed put, and a further share of what it did gather was deposited back
  into the middle of the footprint. So the whole length of a stroke stayed loaded with water
  and went on beading along its entire length. What actually happens is that a fingertip is
  pressed flat against the glass and takes everything the glass is not holding on to by
  adhesion (§5a) — the track behind it is clear glass. Nothing is put back in the middle.
- Its track **read as a band of water**. The optics derive a film from `wet` (§12a), and the
  wipe was raising `wet` almost as high as a rivulet does. But a rivulet's track really does
  carry a film, and a squeegeed track has had its film taken away. Both are "wetted glass";
  only one of them has water on it. So a finger leaves far less wetness behind than a flow.

Two smaller consequences. The contact patch tapers only at its rim, not smoothly from the
centre, so a finger's track has a definite edge. And the side ridges go either side of the
*track*, which is only the same as either side of gravity while you are drawing a horizontal
line.

Important consequence:

**nucleation must follow transported water**, not random sampling across an arbitrary wet rectangle.

A long stroke may produce several pooling zones, but repeated wiping over one local region should tend toward one dominant collector or a few, not dozens of identical beads.

---

## 5a. Two mistakes that break everything downstream

Both were found by measuring rather than by looking, and both had the same symptom: water
sat there as a film, beads never grew enough to move, nothing merged, and nothing left a tail.

### The water budget is a physical quantity, and it was thirty times too big

How much liquid a wipe yields is not a free parameter. A fully fogged pane carries a film a
few tens of microns thick; a `water` height of 1 means one cell deep, and a cell is about half
a millimetre. So the liquid equivalent of full fog is a few hundredths of a height unit — and
this handed out **0.26**, about 0.15 mm of water, thirty times more than a mirror can hold.
One hand-sized scribble put two hundred drops' worth of water on the glass, and the mirror
then spent a minute working through it, shedding drop after drop. That is the honest answer to
*「還是會生水出來」*: the glass was being given far more water than it had.

Worse, it was **scale-dependent**. A height unit is a cell deep, so the same constant means
twice as much real water on a tablet as on a phone. Every other physical size in this project
is declared in millimetres and divided by the cell size; these were not.

So the three film thicknesses — fully fogged glass, the thickness at which a film breaks up
into beads, and the residue adhesion binds to the glass — are declared in millimetres and
converted, exactly like drop radii. What they must preserve is the *ratio* between them: they
were originally tuned against each other, and the ratio is what decides whether a wipe beads
at all.

Two consequences follow, and neither is optional:

- **The patch a new bead dewets has to be solved for, not fixed.** A bead's mass comes out of
  the area of film it clears, so a thinner film must clear a wider patch. With the radius
  fixed at 2.4 cells, a realistic film simply could never assemble one — fifteen cells passed
  the beading threshold and the best of them could only supply half of what a bead needs. That
  is the starvation trap above, at birth rather than at growth.
- **A running drop has to sweep the fog it crosses.** See §8a.

### Evaporation must be proportional to water, not to area

Removing a fixed amount of water per cell per second makes the total loss proportional to the
**wetted area**. One wipe covers thousands of cells, so the film boiled itself dry in about
five seconds — far faster than any bead could gather from it. Evaporation is a fraction of
what is in the cell.

### A film must coarsen, not just level

Diffusion smooths a film out. On its own it does the opposite of what glass does: a thin film
is unstable, surface tension breaks it up, and it gathers into beads. With levelling alone the
water spread into a sheet too thin to reach any nucleation threshold, and the simulation
became a wet rectangle where nothing ever happened.

Water therefore moves **towards its thickest neighbour** while it is thin, and only levels
once a cell is deep enough to count as a pool. Transfers are explicit, so it stays exactly
conservative. This one term is what makes a wiped mirror pull itself into drops.

Measured after both fixes, from a single straight wipe: 27 beads form, 24 merges happen, and
a drop runs 114 mm down a 145 mm screen.

### ...but a film cannot coarsen *completely*

Coarsening is not free to run to completion, because glass holds on to water. Adhesion — and
on a real mirror, its roughness and whatever is left on it — pins a thin residue that surface
tension cannot drag along, so a wiped pane never resolves itself into beads and clear glass.
It keeps a faint damp haze, and that haze leaves only by evaporating. A perfectly smooth,
ideal surface is the case where the whole film would bead up; a bathroom mirror is not one.

So the gathering term acts only on the water **above** a bound height, and how much is bound
follows the same heterogeneity field that decides where drops pin: glass that holds drops well
holds film well. The levelling term for deep water is unaffected — a pool does level.

Without this the model quietly claims a perfect surface, and the tail of a wipe is a film that
keeps re-gathering into one more bead, and one more, until the water is gone.

### A drop must be able to reach the size at which it moves

A bead drains the film within its reach and then stops growing. If it needs more mass than its
catchment holds, it sits at ninety-odd percent of the pinning threshold indefinitely — and
because drying glass raises that threshold, the gap never closes. Everything that depends on
moving (sweeping up water, growing, merging, leaving a trail) then never happens at all. The
size at which a drop breaks away has to be reachable from what one catchment can supply.

---

## 6. Water mass accounting

Use approximate mass conservation.

Conceptually:

```text
surfaceMass = sum(water cells)
mobileMass  = sum(active flow mass)
```

Not approximate, as it turns out — it is exact, and the harness checks it. But the total has
to include the condensation, because that is where the water comes from:

```text
budget = sum(water cells) + sum(active flow mass) + sum(fog cells) * fogYield
```

Transfers:

```text
fog -> water              wiped condensation / slow condensation
fog -> mobile flow        a running head sweeping the glass it crosses (§8a)
water -> mobile flow      collection / pooling
flow + flow -> flow       merge
mobile flow -> water      residual trail deposit
water -> gone             evaporation, and the share a finger carries off
```

Everything but the last line is a transfer and must conserve exactly. A wipe returns
everything it mobilises to the glass apart from a fixed share that leaves on the finger —
a finger that has wiped a steamed mirror is wet, and that water is off the glass for good.

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

## 8a. Condensation is the reservoir; a run sweeps it up

A drop running down a fogged mirror leaves a clear track. It is not pushing the mist aside —
it is collecting it, and that is where most of the water in a long run comes from. Without
this a head can only live on liquid already lying about, so once the water budget is honest
(§5a) nothing runs more than a few millimetres: every drop bleeds into its own trail and dies.
With it, a run *grows as it goes* — the streak is thin where the drop set off and thick at the
bottom where it has been feeding for a hundred millimetres, which is exactly what a steamed
mirror looks like.

It also closes the accounting. `fog` was previously outside the water budget, mass appearing
from nowhere at the wipe and vanishing at the edges. Now the total — liquid on the glass, plus
liquid in the moving heads, plus fog times its liquid equivalent — is conserved *exactly*
through a wipe and through minutes of running water. The test is in the harness and it returns
zero, not nearly zero.

The practical effect on the complaint above is larger than the budget change itself: a wipe
now sheds its drops once, they run the length of the glass because they are feeding as they
go, and no further water appears afterwards.

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

## 10a. Sideways forces must be a fraction of gravity — and scaled like it

Water on vertical glass falls **down**. Every sideways term — capillary attraction between
neighbouring flows, the preference for running along existing wet glass, the surface's own
unevenness — has to be a fraction of the gravity drive, and has to be scaled by cell size in
exactly the same way.

They were not. Gravity was converted from px/s² into cells/s²; the sideways terms were left
as raw cell-unit numbers. On a tablet that made the attraction between two drops **more than
twice the gravity drive**, so a new bead was hauled sideways the instant it formed and no
trail ever started vertical. Measured after the fix, a lone drop falls 142 cells and drifts
0.1 of a cell: one part in a thousand.

The attraction is also short range now, reaching only a couple of drop radii. A long reach
produces the same symptom by another route — drops curving towards each other across the
glass — and it is not what bridging is. Contact lines bridge when they nearly touch.

## 10b. Grid resolution is not free

A trail one or two cells wide draws a staircase, because a cell is several device pixels and
the trail's position quantises to it. Two things fix it together: enough cells (208 across the
short side, where 144 was visibly stepped on a tablet) and a trail at least a couple of cells
wide. Cost measured on the finer grid: 1.2 ms of simulation and 2.3 ms to pack and draw,
against a 16.7 ms frame.

Note that water height per cell depends on cell area, so **changing the grid changes every
height threshold**. Nucleation, coarsening and sag all had to be rebalanced when the grid
changed.

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

## 11a. A trail must be thin, or one wipe becomes a drip factory

Trail deposition looks like a free parameter and is not. Bleeding much of a head's mass into
its trail has two consequences that are only obvious once you watch it on a device:

- **Drops stall.** A head losing three percent of itself per cell of travel is down to a
  twentieth of its mass after a hundred cells, so it re-pins after a few millimetres. Real
  drops run the length of the glass and leave a long thin streak.
- **The wipe never stops producing.** The water the stalled head dropped re-beads behind it,
  that bead runs, stalls, and drops water of its own. One wipe turns into an endless
  procession of drops, which is the single most unphysical thing this simulation can do —
  a wiped patch holds a fixed amount of water and it either runs off or dries.

So the trail is thin, and water lying inside a body that is **still running** cannot nucleate
a new head. It may bead up later, once that flow has gone; it may not bead up behind a live
one. Measured: one wipe now produces seven drops in the first five seconds and never another,
and a drop runs about 113 mm down a 145 mm screen.

---

## 11b. A track that water has already run down is drained glass

Section 11a stopped a *live* body from beading behind its own head, and that was not enough.
The same column still shed drop after drop for half a minute after the flow had gone: the
head dies, its `flowId` is no longer live, the residual film coarsens (§5a), a new bead forms
in the old track, runs, dies, and the next one starts. On a device this reads as water welling
up out of the glass — the complaint was exactly *「水流下來的位置跟附近還會出水好幾次」*.

The physics says otherwise. A rivulet drains the channel it runs in. What is left behind is a
**bound residual film** held by contact-angle hysteresis, not free water: it is below the
thickness at which a film is unstable, so it does not dewet into fresh beads — it evaporates
in place. Three rules follow, and none of them is a tuned number:

- Residual film in a marked track **dries several times faster** than water elsewhere. It is
  thin, so it has far more surface per unit volume.
- Film in a marked track **does not coarsen**. The gathering term of §5a is what turns a film
  into beads; a pinned residual film is exempt from it.
- A cell that has ever carried a flow **cannot nucleate** until water is actively *put back*
  there — by a new wipe, or by a flow arriving from above. The threshold is far above anything
  the track's own film can reach, so it is a structural block, not a bias.

The track mark is released only when the glass has dried and re-fogged (`wet` below about
0.2), which is also when a real mirror would have forgotten it.

Measured: one wipe near the top now produces eleven drops, **all inside the first five
seconds**, and not one afterwards; before, new heads kept appearing for thirty seconds and
three of them were born inside the run-off tracks.

---

## 11c. Two streams a few millimetres apart join through wet glass

Surface tension has no reach. Two drops bridge when their contact lines nearly touch — a
fraction of a millimetre — and the short-range attraction in §9.1 is deliberately kept that
short, because a long reach is what used to drag every new bead sideways instead of letting it
fall (§10a). But on real glass two rivulets running five or ten millimetres apart *do* converge,
and they were staying parallel to the bottom of the screen here.

The mechanism at that range is not tension, it is the **wet track**. Wet glass has a lower
contact angle, so a flow meets less resistance on the side where the glass is already wet, and
it veers that way. So a head senses `wet` at two lateral distances — its own channel, and about
eight millimetres out, far enough to feel a neighbouring track — and steers towards the wetter
side.

Two things make this safe where a direct attraction was not:

- It is a **difference**. On even glass it is exactly zero, so a lone drop still falls straight
  down: measured 0.1 cells of drift over a 142-cell fall.
- It acts on the *path*, not on the drop, so it cannot pull a bead off the spot where it formed.

Once two heads' trails do overlap, `flowId` joins them into one body, and from then on they are
one piece of water: the pull between them roughly doubles and they merge at several times the
distance. Measured: two flows starting 8 mm apart used to run 76 mm side by side before
merging; they now join after 29 mm. At 12 mm they still run separately to the bottom, which is
correct — nothing at that range should pull them together.

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

## 12a. A trail has to be *seen* as water, and it cannot pay for that itself

A trail deposits very little water — it must, because it comes out of the head, and a head
that leaves much behind bleeds out within a few millimetres. That amount is far below what
the optics can read as a surface: about a hundredth of what registers.

So a rivulet's track was drawn as nothing but a hole in the fog. No edge, no refraction, no
highlight, no meniscus. It read as a scratch or a trickle of sand, not as water, and no
amount of tuning the trail deposit could fix it without killing the drop that lays it.

The wetness map pays for it instead. Wet glass carries a film, so the renderer adds a share
of `wet` to the water height it reads for the optics — not to the simulation, which stays
exactly conservative. The trail then has a surface: gradients at its edges, a highlight along
it, a rounded head. This is a rendering decision resting on a physical fact, and the split
matters: `wet` is not mass and must never become mass.

---

## 12b. Every trail the same width is a grid artefact, not a look

Trail width was `max(2.2 cells, radius * 0.5)`. A drop is about two cells across at the grid
this runs at, so the radius term never once beat the floor: every streak on the glass came out
identical, and each was about three times wider than the drop that laid it. Water does not do
that — *「每個水痕都一樣粗細看起來很怪」*.

The floor exists for a real reason: a trail thinner than about a cell draws as a staircase.
But it must sit *below* the width a drop actually has, not above it, or it swallows the whole
range. With the floor lowered the geometry varies by about 1.7× across the drop sizes this
produces.

That is still not much to look at, so most of the difference a viewer reads has to be carried
by **how wet the track is left**, which §12a turns into a rendered film: a heavy drop leaves a
strongly wet, obviously watery streak, a small one leaves a faint thread. Wetness laid down by
a trail therefore scales with the head's mass. It used to be a constant.

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
- a teardrop for moving fronts: round at the leading edge where water piles up,
  drawn out and narrowed behind into the streak it is leaving. A symmetric
  ellipse — identical at both ends — reads as an egg, not as water
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
