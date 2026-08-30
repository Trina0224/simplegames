# Threebody — Earth–Moon CR3BP

An interactive Earth–Moon three-body sandbox. A spacecraft with no engine, in the
gravity of two bodies, doing things that look impossible — and every path on
screen is numerically integrated from the CR3BP equations rather than drawn.

That rule is the product. `AGENTS.md` forbids Bézier curves as orbits, splines
imitating horseshoes, steering the spacecraft's position toward a destination,
and hand-authored behaviour near the Moon. What is left is harder to build and is
the only version worth having: **the weird path was not animated by us, the
equations produced it.**

The design requirements are external and are not authored here:
[`SPEC.md`](SPEC.md), [`AGENTS.md`](AGENTS.md), [`RESEARCH.md`](RESEARCH.md).

```sh
python3 -m http.server 8000      # then open /threebody/
node --experimental-default-type=module threebody/tools/validate.mjs   # the physics
node --experimental-default-type=module tools/stamp.mjs                # the build stamp, all apps
```

## Using it

Pick a preset and watch. The **horseshoe** is the one to start with: leave it in
the rotating frame until it has gone round once — a little over six months at
eight days a second — then walk it through the other two frames. The strange
U-shape turns into an ordinary near-circular orbit around the Earth, because it
never was a shape in space. It was a shape *relative to the Moon*.

There are three frames, and the whole point of having them is that the same
integrated trajectory looks like three different things:

| frame | what it holds still | what it is good for |
|---|---|---|
| **rotating — horseshoe view** | Earth, Moon and L1–L5 | the horseshoe, the tadpoles, the zero-velocity geometry |
| **Earth-following — intuitive view** | Earth, at the origin | the familiar picture: the Moon goes round the Earth once a month |
| **barycentric inertial — space view** | nothing | what is actually happening, out in space |

The middle one is a bridge rather than a physical claim. It is *not* an inertial
frame and the app never calls it one: Earth is not held still in the equations,
it is held still on the screen, by subtracting Earth's own barycentric motion
from everything drawn. That is the one-line definition and the code does exactly
it, `r − r_Earth` and `v − v_Earth`, with nothing else added. Two details fall
out of the subtraction rather than being arranged: the Moon sits at exactly 1 DU
and revolves once per sidereal month, and the barycentre marker sits 4671 km from
Earth's centre toward the Moon — inside the Earth, which is the honest reason the
frame is not inertial. That point is what goes round in a circle. The Earth
wobbles about it.

- **Drag the spacecraft** to burn. Its position does not change, its velocity
  does, and the Jacobi constant changes with it. Everything after is ballistic.
- **Drag anywhere else** to pan. **Pinch or scroll** to zoom, about the point
  under your fingers. **Fit**, or a double-tap on empty space, restores the
  framing the preset asked for.
- **Zero-velocity** draws, in yellow, the boundary of where the spacecraft can be
  at all at its current energy. Burn, and watch the necks around L1 and L2 open
  or close. It used to be a dim blue, on the reasoning that the trajectory should
  stay the subject of the picture; that was wrong for this curve, which you turn
  on deliberately and then have to be able to see. Warm also puts it as far from
  the cyan trajectory as the colour wheel allows.
- **3D** switches to the spatial problem: a real six-state `[x, y, z, vx, vy, vz]`
  and two numerically corrected halo orbits. Drag to orbit the camera; **Top**,
  **Side**, **End** and **Oblique** are fixed projections.
- **Free launch** hands the initial condition to you. Drag the spacecraft to
  place it, drag the yellow handle to aim and set the speed, watch the dashed
  preview, and press Launch when it looks interesting. Crashes and escapes are
  valid answers; the mode does not pick a safe orbit for you.
- **Target** solves for a burn that arrives, by shooting — not by steering. It
  reports Δv, flight time, miss distance and the Jacobi constant either side, and
  when it cannot find one it says so — and says what got in the way — instead of
  snapping to the destination.
- **Arriving at a libration point is not stopping at one.** The transfer delivers
  the spacecraft there with velocity to spare, and the executed run is more than
  twice the flight time long, so what happens afterwards is often more
  interesting than the arrival — including hitting something. The note names both
  events with their times, because it used to name only the first.
- L1, L2 and L3 are drawn as crosses because nothing rests there; L4 and L5 as
  rings because things can.

### Which gesture is which

Decided by where the pointer went down, not by what it did afterwards — so a
drag never changes its mind halfway:

```text
within 26 px of the spacecraft  ->  burn
anywhere else                   ->  pan
two fingers, or the wheel       ->  zoom about the midpoint
```

The hit target is in screen pixels rather than model units, because in DU it
would shrink to nothing zoomed out and swallow the view zoomed in. The burn
scale is per pixel of drag for the same reason: the same gesture means the same
Δv however far the camera is zoomed.

**None of the camera can reach the physics.** Zoom and pan change two numbers,
`span` and `centre`, that live in the renderer. A trajectory integrated at one
zoom level is byte-identical at another, and Fit restores the framing without
re-integrating anything.

## What is here

| file | what it owns |
|---|---|
| `src/constants.js` | the Earth–Moon system and every unit conversion |
| `src/cr3bp.js` | the equations of motion, the effective potential, the Jacobi constant |
| `src/lagrange.js` | the five equilibria, solved, with their linear character |
| `src/integrator.js` | adaptive Dormand–Prince 5(4) with dense output |
| `src/trajectory.js` | propagation, event detection, family correction, classification |
| `src/frames.js` | rotating ↔ inertial, the transform the validation suite checks |
| `src/display.js` | the three display frames, and the inverse Free Launch needs |
| `src/freelaunch.js` | the candidate being edited, and what makes it invalid |
| `src/freelaunch3d.js` | the 3D editor: free launch and impulsive burns, one object |
| `src/cr3bp3d.js` | the six-state equations. The planar problem is a subspace of them |
| `src/trajectory3d.js` | spatial propagation, and the `y = 0` section the corrector shoots to |
| `src/frames3d.js` | the same three frames, extended to six states |
| `src/halo.js` | Richardson seed, differential correction, continuation |
| `src/presets3d.js` | the corrected halos and the Lissajous arcs, with their provenance |
| `src/render3d.js` | the orthographic camera. Presentation only |
| `tools/halo.mjs` | regenerates the halo family from nothing |
| `tools/family.mjs` | writes `src/family3d.js`, the branches the slider browses |
| `src/family3d.js` | generated: 34 members per branch, every number measured |
| `assets/spacecraft-v1.png` | the sprite. Presentation only; the version is in the name |
| `src/zvc.js` | zero-velocity curves from the live Jacobi constant |
| `src/targeting.js` | shooting for a burn that arrives |
| `src/presets.js` | reproducible initial states with their provenance |
| `src/worker.js` | the solver, off the main thread |
| `src/render.js` | drawing, and only drawing |
| `src/app.js` | the clock and the controls |
| `tools/validate.mjs` | the suite below |
| `tools/horseshoe.mjs` | regenerates the horseshoe family from nothing |
| `../tools/stamp.mjs` | puts one `?v=` on every module reference, and checks it — shared by every app |

### How the app is put together

Three separate jobs, because they want different things. The **worker** computes
physical states as fast as it can. The **clock** plays back what has been
computed, at whatever rate the user asked for. The **renderer** draws. Playback
speed therefore changes how quickly cached states are shown and never touches the
integration, so a horseshoe watched at eight days a second is the same trajectory
as one watched at one.

Switching frames transforms the stored trajectory; it never re-integrates. There
is one physical solution and three ways of looking at it, which is the entire
point of having the switch. Every physical thing on screen goes through the same
function in `display.js`, at its own time — a trail is a sequence of states from
different instants, and rotating all of them by the time of the newest one would
draw a curve nobody flew. `render.js` does not know how any of the frames work.

The frames are also the reason a burn dragged out with a finger still means what
it looks like. The gesture is read in whatever frame is on screen and the Δv is
rotated back into rotating coordinates before it reaches the integrator, because
that is where the integrator lives. The Earth-following frame needs no extra
handling there: it differs from the inertial one by a translation, and a
translation common to both ends of a difference leaves the difference alone.

Body radii are drawn larger than life — Earth is three pixels at true scale and
the Moon is under one — but the enlarged radius exists only in `render.js`.
Collision is tested against the physical radius in `trajectory.js`, which cannot
see the renderer.

### 3D: a halo, corrected into existence

Phase 1 of the spatial phase, in the order `THREE_D_AGENT.md` sets out: six-state
equations, planar regression, frame round-trips, a Richardson seed, differential
correction, closure validation, continuation, then the viewer. The numerical
orbit existed before anything was drawn.

**The planar problem is an invariant subspace, exactly.** `∂Ω/∂z` carries a
factor of `z`, so a state that starts in the plane cannot leave it — measured,
`z` and `vz` stay *identically* zero over a full horseshoe period, and the
six-state equations agree with the planar ones to 0. The two propagators do not
take identical steps (the error norm is an RMS over the state width, and two
exact zeros change it), so agreement is shown by refinement rather than by an
equality that would be luck:

```text
tolerance   1e-9       1e-11      1e-13
horseshoe   96.69 m -> 15.48 m -> 0.23 m
```

The integrator became width-generic to carry six components. `THREE_D_SPEC.md` 3
allows a shared utility only if the 2D suite is unchanged in result, so that is
what was checked: the planar suite's output before and after is identical
character for character.

**Why a halo needs a third-order seed** when the 2D horseshoe needed none: near a
collinear point the in-plane and out-of-plane motions have *different*
frequencies, so a linear seed traces a Lissajous figure that never closes. They
only resonate at finite amplitude, through the constraint `l₁Ax² + l₂Az² + Δ = 0`.
That relation is the reason halo orbits exist and it cannot come from linear
theory. Richardson supplies it; the seed is never displayed.

The corrector states its assumptions, as `THREE_D_RESEARCH.md` requires:

| | |
|---|---|
| assumed | symmetry about the x–z plane: two perpendicular crossings, half a period apart |
| fixed | `z₀`, the amplitude the family is continued in |
| corrected | `x₀` and `vy₀` |
| section | the next `y = 0` crossing after `t = 0` |
| residual | `(vx, vz)` there, driven to zero |

The Legendre coefficients come out at published Earth–Moon values (L1 γ =
0.150934, c₂ = 5.147595, λ = 2.334386), which is the first sign the seed is right.
The sign convention of the expansion's x axis differs by text and getting it
wrong is silent — the seed still *looks* like a halo — so it was settled by
measurement: `+1` converges in 4 iterations at both points, `-1` needs 8 at L1
and fails outright at L2.

Continuation needed a **secant predictor**. Holding `x₀` and `vy₀` while stepping
`z₀` works while the family is flat and stops the moment it curves; at L1 it
survived exactly two steps. Extrapolating along the family instead costs nothing
and gets 20 of 20 members out to `z₀` = 38 440 km.

Both presets store **full double precision, not a tidy twelve decimals**. A halo
is unstable — that is what makes it need correcting — so truncating the state is
not a rounding, it is a different orbit: measured, 12 decimals costs a factor of
122 in closure at L1 and 705 at L2. The 2D horseshoe taught the same lesson at
1.8e5 per period.

The viewer is orthographic, which `THREE_D_RESEARCH.md` argues for and which has
a specific reason: under perspective the apparent size of a loop depends on how
far away it is, so you cannot judge whether the far side of a halo matches the
near side. Two things make the out-of-plane motion legible — the `z = 0` grid,
and the **ground track**: the orbit projected straight down onto that plane, plus
a dropline under the spacecraft. That is the projection check `SPEC.md` 6 asks
for, except visible from every angle rather than only from the top.

**`Side` turned out to be the least useful of the three projections.** Along a
halo, `x` and `z` co-vary, so the x–z view collapses to nearly a straight line —
74 px wide against 177 tall on the L1 preset. Physically correct, visually
useless. Hence **End**, looking down the Earth–Moon line, where the loop opens
out and the z excursion is the thing you are looking at.

### Browsing the family instead of listing it

`THREE_D_SPEC.md` 9's third item: "expose a family parameter/amplitude slider
rather than a collection of unrelated hand-picked presets". The **Orbit** menu's
last group holds the two branches, and the slider walks them — 34 members each,
sampled evenly from one continuation. The end of the L2 branch **is** the NRHO
preset, component for component; it is not a separate discovery.

`src/family3d.js` is generated by `tools/family.mjs` and every number in it is
measured from the propagator afterwards. Re-flown by the suite, all 68 members
close (worst 3.3e-10), and none passes inside the Moon.

**The most important thing this exposed: a small residual is not enough.** The
corrector drives `(vx, vz)` to zero at the next `y = 0` crossing, which is the
half-period crossing *only while the orbit has exactly two such crossings per
revolution*. Deep in the L1 branch that stops being true — the orbit grazes the
Moon and the topology changes — and the corrector then reports a residual of
**1e-12** for a state whose orbit misses itself by **2.4 DU** after "one period".
A whole stretch of the family was numerically converged and physically nonsense.
Nothing catches it but asking whether the orbit actually closes, so that is now
the gate, and the L1 branch stops where it should.

And the family does not do what I first asserted it did. Perilune falls all the
way down both branches, but **`|z|` rises, peaks and falls again** — the turning
point is where the orbit stops growing taller and starts growing thin, which is
the near-rectilinear transition itself. My first version of that check was
accidentally always true (`… === false || true`) and hid it completely.

```text
L1   perilune 51 120 → 1 788 km    |z| 2 049 → 95 266 km    slenderness 0.17 → 4.53
L2   perilune 50 922 → 7 412 km    |z| 2 323 → 77 778 → 74 611 km    0.10 → 3.40
```

### 3D free launch and burns: the third component is a control, not a default

Phase 3's first two items. `THREE_D_SPEC.md` 10 is blunt about the trap: *"Do
not hide `vz` behind an arbitrary default and call the control fully 3D."*

The difficulty in one sentence: **a screen point is a line through a 3D scene,
not a point**, so a drag can only ever set two of three components. Something has
to choose the third, and the honest answer is that you do:

| | |
|---|---|
| drag the spacecraft | x and y, on the horizontal plane at its current height |
| the **z** slider | height, in thousands of km |
| drag the yellow handle | vx and vy, on the plane through the arrow's own tip |
| the **v<sub>z</sub>** slider | the vertical component, in m/s |

Nothing is inferred and nothing interferes: the suite checks that the height
control moves `z` **and only** `z`, that a horizontal drag never disturbs `vz`,
and that placing never touches velocity.

Both handles are tied to `z = 0` by a dashed dropline with a foot marker. That is
not decoration — a loose arrow in an orthographic 3D scene is genuinely
unreadable, because you cannot tell whether it points up and away or down and
toward you. The foot says where; the line says how high.

`toPlane()` returns **null** when the camera is within about 12° of level,
because then the pick-ray never meets the plane and any answer would be invented.
The editor says "tilt the camera to place" rather than guessing.

**A burn is the same editor with the position locked.** Not tidiness: it is how
the burn inherits the preview, the validity rules and the frame handling without
a second copy that could disagree. Place and height are simply refused in burn
mode — an impulse changes velocity, not position — and the readout reports the Δv
by component. Verified end to end: the position does not move, and Launch uses
exactly the state the preview was drawn from (`C0` identical to the candidate's
`C`).

Validity is the three-dimensional distance to a body centre against the
**physical** radius, the same test collision uses. A projected 2D test would
happily allow a spacecraft placed 869 km directly above the Moon's centre.

Still out of scope, as asked: 3D targeting and zero-velocity surfaces.

### Saying what the model does not contain

The deepest member of the L1 family passes **51 km above the lunar surface**. It
is kept: the family is not trimmed for presentation, because a truncated family
is a claim about the physics that the physics did not make.

What that member needs is the model's limits stated, not removal. Every 3D run
now reports its closest approach as an **altitude** — "1 788 km from the Moon"
sounds roomy and "51 km above it" does not, and the second is the one that tells
you what you are looking at — measured from the propagated samples rather than
read from a stored field, so it will still be right for a free-launched
trajectory that has no stored anything.

Below 100 km the page says so outright:

> Closest approach 51 km above the Moon. This is an idealized CR3BP result: the
> Moon is a point mass here, and lunar mascons, nonspherical gravity and terrain
> are not modeled. A real orbit this low would not behave like this and would not
> stay.

Amber rather than red, deliberately. This is a true member of a real family and a
correct result of the model — it is the model's scope that needs stating, not the
number that needs a warning triangle.

### NRHO: the same family, walked until it goes thin

`THREE_D_SPEC.md` 9 and `THREE_D_AGENT.md` both insist NRHO is a **region of the
halo family's own landscape**, not a decorative special orbit. So it is the same
corrector that produced the small halos, walked 64 members down the L2 branch.

Two things the walk needed, and both were discovered rather than designed:

**The family stops being a function of z₀.** Partway down, two members share a
z₀ and the corrector cannot choose between them — that fold is exactly where
NRHO territory begins. Holding x₀ instead keeps going: 33 steps in z₀, then 31
in x₀.

**The stride halves rather than stopping.** A failed step almost never means the
family has ended; it means the predictor overshot into somewhere the corrector
cannot recover from, and the family continues perfectly well at half the stride.
Measured: a fixed stride reaches a perilune of 13 931 km, adaptive stepping
reaches 7 412 km.

It is near-rectilinear **by measurement**, not by the shape it draws:

```text
|z| max      74 611 km        perilune   7 412 km from centre
x span       21 971 km                   5 675 km altitude
slenderness       3.40        apolune   77 696 km
period          7.86 days     closes     3.3e-10
```

**It is not Gateway.** Gateway's NRHO has a perilune near 3 200 km and a period
of 6.56 days in a 9:2 lunar resonance; reproducing that needs an ephemeris model
this project does not have. The spec says not to claim operational fidelity, so
none is claimed — this is ideal CR3BP and says so.

### A Lissajous is not a halo, and is not called one

Phase 2's first item. A Lissajous is the **same third-order expansion** as a
halo with the amplitude constraint dropped: `Ax` and `Az` become independent, the
in-plane and out-of-plane frequencies stop agreeing, and the path never closes —
it winds around a torus. Sharing the expansion is deliberate, so that the
constraint is the *only* difference rather than two formulas that might drift.

The objects carry no `period` and no `residual`, because they have none.
`THREE_D_SPEC.md` 9 forbids calling a Lissajous periodic, and the surest way to
keep that promise is to leave it nothing to quote. The readout says
`quasi-periodic, 1.0448:1, holds 34 TU` instead.

**Proved rather than asserted**, and by the same measurement for both: the height
at every second crossing of the x–z plane. For a periodic orbit that is the same
point every time.

```text
halo-l1        3 crossings within 21 m       — not zero, because a halo is unstable
lissajous-l1   8 crossings spread 3 944 km
                                             a factor of 191 709
```

**A raw third-order seed lasts about a revolution and a half.** L1 and L2 have an
e-folding time under half a time unit, so the seed's small unstable component
owns the trajectory within 4.4 TU. Fixing it needs no state-transition matrix: a
trajectory near a collinear point leaves either toward the nearer primary or away
from it, which one depends continuously on the initial state, and the set that
leaves *neither* way is the boundary between them. So bracket the two behaviours
and bisect. Each halving buys roughly another e-folding until double precision
runs out — measured, 4.4 TU becomes 35.9 TU, about thirteen revolutions.

They are not forever, and the presets say so rather than looping silently. Real
Lissajous trajectories need station keeping for exactly this reason.

Two bugs found here. The crossing walk rediscovered the crossing it was handed —
the section residual is 1e-16 rather than exactly zero, and the search only skips
its start when `y` is *exactly* zero — which broke the alternation and silently
mixed the two faces of the orbit together, making the halo measure a 45 000 km
"spread" and look as aperiodic as the Lissajous. And the lifetime test asked only
whether the arc had left a ball, so an arc that ended *in the Moon* was reported
as "bounded for 30 TU".

### Free launch: your initial condition, their equations

`FREE_LAUNCH_SPEC.md` is mostly a list of things this must not become — no
atmosphere, no staging, no propellant, no finite burn, no autopilot. What is
left is the whole point: the spacecraft is the same massless test particle it
always was, and all the mode does is let you write `[x, y, vx, vy]` with your
finger.

Two decisions carry it, and both are about keeping the three frames honest.

**The candidate is stored in rotating coordinates, always.** You place and aim
in whichever frame is on screen, and it is converted once on the way in, through
the inverse of the transform that draws it. Switching frames mid-edit therefore
cannot produce a second physical state — there is only ever one. Measured: six
frame switches while holding a candidate leave its rotating components
*bit-identical*.

That inverse is `displayToRotating` in `display.js`, and it takes a whole state
rather than a velocity, because a velocity cannot be inverted on its own: the
rotating↔inertial velocity map carries a term in the **position**. Aiming the
same 45° screen gesture in each of the three frames gives the same displayed
speed and three genuinely different rotating states, which is the correct answer
and not a bug:

```text
rotating    vx  0.702753   vy  0.702753     1.018 km/s at 45° in this frame
Earth-fol.  vx  0.329420   vy  0.733936     1.018 km/s at 45° in this frame
inertial    vx  0.329420   vy  0.746086     1.018 km/s at 45° in this frame
```

**The editor works at epoch t = 0 and the clock is held there.** The scene you
aim into is the scene the trajectory starts in. Editing at a running clock and
resetting to zero on Launch would move the Moon between the last preview and the
launch, which is precisely the "preview must not silently change" the spec
forbids.

Two handles rather than one gesture, because "move the spacecraft" and "set the
velocity" are different verbs and a single drag outward from the sprite would
have to guess. The aim handle is drawn even at zero speed, parked a fixed
distance away on a dashed line — otherwise a candidate at rest has no visible
way to be given a velocity at all.

The speed rule is screen-space, 6 m/s per pixel, so the same hand movement means
the same speed at every zoom level; a comfortable 300 px drag spans 0 to about
1.8 km/s. The arrow is drawn at the exact inverse of that rule, so its head stays
under the pointer however far you have zoomed.

The preview is a real propagation by the same worker and the same tolerances as
everything else — never a spline. One job is in flight at a time: a drag posts a
new candidate every frame, and the worker is a queue rather than a pool, so
starting them all would put the preview further behind the finger the longer you
dragged. Holding the newest and starting it when the last one lands bounds the
work by how fast the solver is. Measured after a 60-step, 8-second drag: nothing
pending, and the displayed preview starts from exactly the state being held.

Two numbers on screen are deliberately different. The chip beside the arrow
reports speed **in the displayed frame**, because that is what the drag is
setting; the readout keeps quoting rotating speed, as it does for a live run. A
first version quoted the rotating speed next to the words "in this frame", which
the frame-invariance test caught.

### A transfer that arrives, and a collision eight days later

Reported as a targeting bug: L4 tadpole, target L5, plan, execute — the app said
*miss 0.0 km* and then *impact: Moon*, which reads as a solver that accepted a
path through the Moon.

It was not. Measured on the reported case: the burn is 384.8 m/s, the spacecraft
reaches L5 at 21.7 days with a miss of 0.0 km, and its closest approach to the
Moon along the way is 216 000 km — the Moon's radius is 1737 km. The collision is
at 29.7 days, **8.0 days after arriving**, because arriving at a libration point
is not stopping at one and the executed run is 2.2× the flight time long. Both
facts were on screen and nothing connected them or said which came first, so the
note now names both events and the gap between them:

```text
executed Δv 384.8 m/s → L5 in 21.71 d, miss 0.0 km
   ·   then, still coasting, impact: Moon at 29.7 d — 8.0 d after arriving
```

The guard that was asked for went in anyway, because the planner genuinely
lacked it. `solveBurn` scored candidates on terminal residual alone, and
`propagate` stops early on impact — so its terminal state is wherever it stopped,
and differencing *that* against the target still produces a number. For a target
near a body that number can be small: aimed at a point on the Moon's surface, the
old planner returned a 111 m/s transfer reporting a **0.23 km miss** whose arc
ends in `impact: Moon`. It now tracks the best iterate that actually flew the
whole flight time, separately from the nearest one that did not, and quotes a
miss only for the former.

Two things worth being straight about. Through the app this was unreachable: the
only targets offered are L1–L5, all of them 58 000 km or more from the Moon, so
an arc that stopped at the surface could never score as an arrival. Across 4 480
L-point transfers the guard changes nothing — old and new agree exactly. It is a
real fix to `targeting.js` as a module, not to the reported symptom.

And the collision test itself was suspected of stepping over bodies, since it
looks only at the end of each accepted step. It was hunted for: **67 372 arcs
that genuinely enter a body, all 67 372 detected, none missed** — the adaptive
step collapses near a body long before a step could straddle it. So the
integrator and the event detection were left alone.

### Nothing sits on top of anything else

Three things used to collide on a portrait tablet, and all three were the same
mistake — a position chosen once, for one screen:

The blurb and the diagnostics were two separately placed fixed boxes. That is
fine until the viewport is narrow enough for them to reach each other, and then
the readout simply covered the blurb. They are one flex row now, which cannot
overlap itself: the readout keeps the width its content needs and the blurb takes
what is left. The row is transparent to the pointer, so the gap between the two
panels is still canvas and still pans — measured, not assumed.

The readout's own longest line was wider than the `max-width: 46vw` it had been
given, and `overflow: hidden` ate the end of it silently. Its width is in `ch`
now, because the content is monospace and its longest ordinary line is a known
number of characters. Plus 30px, because `box-sizing` is `border-box` here and a
bare `53ch` spends 28 characters' worth on the padding — which is exactly the bug
in miniature, so it is written down rather than tuned around.

The scale bar sat in the bottom-left corner, which on a narrow screen is
underneath the controls. `render.js` is now told where that panel starts and puts
the bar above it when the two would meet. On a wide screen the panel is centred
and nowhere near, so nothing moves.

Below 640px the blurb, ten lines of diagnostics and the controls are the entire
screen, with nowhere left to watch the orbit — so there the diagnostics fold
behind a summary. Collapsed, not dropped: SPEC.md 9 says they are not to be
removed to tidy up the small view, and one tap is not removal. They are forced
open again the moment there is room, because a `details` that is closed stays
closed even where its summary is hidden.

### Why every import carries a `?v=`

Safari caches ES modules hard, and GitHub Pages serves them with a lifetime of
its own. Rainpane lost an afternoon to that once: a bug was fixed, pushed, and
still reproduced on the device, because the browser was running the old file. A
version on the URL makes a new build a new URL, and there is then nothing to
serve from the cache.

It has to be *every* reference, and that is the part worth being careful about.
Versioning only the entry point buys a **worse** failure than versioning nothing:
a fresh `app.js` beside a cached `cr3bp.js` is a mixed build, which behaves like
neither version and reports the new one. An import map in the HTML would cover
the page, but not the worker — a worker does not get the page's import map, and
`worker.js` imports `trajectory.js`, so the solver is exactly the half that would
be left able to go stale. Hence the version lives in the source:

```sh
node ... tools/stamp.mjs threebody 20260901a   # set it everywhere
node ... tools/stamp.mjs                       # check every app, exit 1 if mixed
```

Check mode is the one that earns its keep. It fails if any local module reference
is missing a version or disagrees with the rest — the *bumped eleven files out of
twelve* mistake, which is otherwise silent and produces exactly the mixed build
described above. It names the file that was left behind rather than listing the
forty-three that are right.

The tool lives at the repository root and covers Threebody, Rainpane and Fog
Mirror, because it moved there the day Rainpane was found serving a mixed build
on `main` — `index.html` and `app.js` at one version, `surface.js` still being
imported at the previous one by three of its siblings. One tool, one rule.

**Bump it on every deploy**, not only when this mechanism changes. What the
version is for is telling a person whether the page in front of them is the one
that was just pushed; a change that ships under the old stamp cannot be
distinguished from a cached copy of the previous one, which is the confusion the
whole thing exists to remove. The tool cannot catch this — it checks that the
version is *consistent*, not that it *moved* — so it is a habit, written down
here because it has already been forgotten once.

The readout's `build` line is not a constant either. `app.js` compares the stamp
it was built with against the `?v=` the browser actually requested, and when they
disagree it says so:

```text
build    20260830d — but loaded as 20260828a, so the page is cached
```

That is the one case a version string cannot fix by itself: `index.html` can be
cached too, and a stale page asks for stale modules perfectly consistently. So
the app reports it instead of quietly claiming to be a version it is not
running — which is the whole failure this mechanism exists for.

### What is physical about the bodies, and what is decoration

The centres are physical: fixed in the rotating frame, circling the barycentre in
the inertial one, and in the Earth-following frame that same inertial motion with
Earth's own subtracted out. The surfaces are a mixture, and it is worth being clear which
is which.

**Physical.** The light comes from a direction fixed in *inertial* space, because
the Sun does not co-rotate with the Moon — so in the rotating frame the
terminator sweeps round once per synodic period, which is the slowest and most
truthful motion on screen. And the Moon's surface does not rotate in the rotating
frame at all: it is tidally locked, so the same face really is always turned
toward the Earth. In the two frames that do not rotate with it, it turns once per
orbit, which is the same statement said differently — and the Earth-following
view is where you can actually watch it happen.

**Decoration, and labelled as such in the code.** The continents are a suggestion
of continents rather than a map. The Earth's spin rate is chosen by eye: a true
sidereal day is about a quarter of a time unit, which at eight days a second is
eight turns a second and strobes. It is the only number in the project picked for
how it looks, and it drives nothing.

## What was measured

| | |
|---|---|
| L1, L2, L3 | solved to 0.8369151, 1.1556822, −1.0050626; gradient residual 1e-16 |
| L4, L5 | 0.4878494, ±0.8660254; residual 4e-17 |
| collinear instability | e-folding 1.48, 2.01 and 24.4 days |
| triangular stability | no growing direction; mass ratio 0.012151 is under the 0.03852 limit |
| L4 released at rest | does not move at all in 1737 days |
| L1 released at rest | holds 13 days, then leaves at 2.83/TU against the eigenvalue's 2.93 |
| Jacobi drift, 434 days | 2.3e-9 at tolerance 1e-9; 2.2e-11 at 1e-11; 1.5e-13 at 1e-13 |
| tadpoles at L4 | offsets 0.002/0.01/0.02 librate over 3.7°, 19°, 54° of longitude |
| frame round trip | rotating → inertial → rotating, off by 1.1e-16 |
| Earth-following position | equals inertial − Earth inertial, to 0 ulp |
| Earth-following velocity | equals inertial − Earth inertial, to 0 ulp |
| Earth in that frame | at the origin exactly, not to tolerance |
| Moon and barycentre | 1 DU and MU along the Earth–Moon line, off by 1.1e-16 |
| L1–L5 in that frame | the same subtraction, to 0 ulp |
| cycling all three frames | leaves the state bit-identical |
| a gestured burn | returns to rotating coordinates, off by 1.7e-18 VU |
| module requests on load | 17, all versioned, 0 bare — the worker's four included |
| panel overlap at 390, 744, 834 and 1280 px wide | 0 px², nothing clipped, ten readout lines everywhere |
| a drag in the gap between the panels | pans the camera; the run is untouched |
| a drag on the blurb | moves the camera 0.000000 DU |
| the reported L4 → L5 burn | 384.8 m/s, arrives 21.7 d, miss 0.0 km, nearest the Moon 216 000 km |
| its collision | 29.7 d — 8.0 d after arriving, not before |
| quoted miss distances | 490 of 490 belong to an arc that flew the whole way; 164 did not before the fix |
| a target on the Moon's surface | refused; 111 m/s "miss 0.23 km" was offered before the fix |
| L-point transfers offered | 95, none with an arc that ends early — the same before and after |
| missed collisions | 0 of 67 372 arcs that enter a body |
| a candidate across six frame switches | rotating components bit-identical |
| the same aim gesture in three frames | one displayed speed, three rotating states, round trip 2.2e-16 |
| zoom and pan while editing | candidate identical |
| Launch | uses exactly the state the preview was drawn from |
| a 60-step drag | preview settles on the state actually held, nothing queued |
| the sprite | reaches no numerical module — 10 of them checked for it |
| **L1 halo** | `[0.8245886263759395, 0, 0.065, 0, 0.17657533043323353, 0]`, T = 2.7674202404692116 TU |
| | C = 3.1411548908811935, residual 1.0e-14, closes 6.4e-13, drift 5.5e-14, 380 steps / 0 rejected, tol 1e-13, max \|z\| 24 986 km |
| **L2 halo** | `[1.1044958584642677, 0, 0.045, 0, 0.22115577335987788, 0]`, T = 3.3777355930591972 TU |
| | C = 3.133250450207309, residual 2.2e-15, closes 1.1e-12, drift 2.5e-14, 425 steps / 0 rejected, tol 1e-13, max \|z\| 25 810 km |
| halo topology under tightening | period stable to 9 figures across 1e-9 … 1e-14; max \|z\| moves 0.0000 km |
| northern vs southern halo | exact mirrors — every component agrees with z negated, to 0 |
| the 3D camera | orbit, zoom and pan leave the run identical |
| L1 Lissajous | `[0.8265876806734829, 0, 0.012600695082136853, 0, 0.10557236481730659, 0]`, no period |
| | C = 3.177632536340015, 2.309798 : 2.268831, holds 35.9 TU, 8 crossings spread 3 944 km |
| L2 Lissajous | `[1.1373725408640845, 0, 0.028017446905756273, 0, 0.08496866288616428, 0]`, no period |
| | C = 3.164342354612123, 1.866213 : 1.786176, holds 34.4 TU, 8 crossings spread 15 623 km |
| halo vs Lissajous, same test | 21 m against 3 944 km — a factor of 191 709 |
| L2 NRHO | `[0.9870857208063908, 0, 0.019267509954168757, 0, 1.087606474285779, 0]`, T = 1.8109336821422881 TU |
| | C = 3.0285534103016762, residual 1.6e-12, closes 3.3e-10, drift 6.1e-14, 731 steps / 0 rejected |
| | perilune 7 412 km from centre (5 675 km altitude), apolune 77 696 km, slenderness 3.40 |
| the L2 branch | 64 members from a Richardson seed; perilune falls 50 922 → 7 412 km monotonically |
| the browsable families | 68 members; all close when re-flown, worst 3.3e-10; none inside the Moon |
| the end of the L2 branch | identical to the NRHO preset, component for component |
| the closure gate | caught members with residual 1e-12 whose orbits missed themselves by 2.4 DU |
| the L1 family's deepest member | 51 km above the lunar surface — kept, and flagged as idealized |
| the 3D height control | moves z and only z; a horizontal drag never disturbs vz |
| a 3D burn | cannot move the spacecraft; reports Δv by component |
| 3D Launch | uses exactly the previewed state — C0 identical to the candidate's C |
| entering and leaving 3D | the 2D run is identical |
| stamping the version in | leaves the validation output identical character for character |
| the same burn from Earth-following and inertial | identical, to 0 ulp |
| collision | detected against the physical radius, not the drawn one |

### Two things worth knowing about the numbers

**An equilibrium that cannot be held is not a broken integrator.** L1 released
exactly at rest drifts 0.14 DU over 434 days — because it is a saddle with a
1.5-day e-folding time, so the round-off in its own coordinates is amplified by
about e³⁰⁰. Asking it to sit still for a year is asking arithmetic to be exact.
What can be checked is that it holds for a few e-folding times and then departs
at the rate the linear analysis predicts, and it does.

**Tighter is not better past a point.** Drift falls with tolerance down to about
1e-11 and then stops: that is the round-off floor, where more steps accumulate
more error than they remove. The default is set there rather than at the
tightest value the integrator will accept.

## The horseshoe

`AGENTS.md` makes an Earth–Moon horseshoe a first-class acceptance target and
forbids drawing one that did not come out of the equations. **It is found, and it
is a converged member of the natural family.**

```text
C       = 3.000
x0      = -1.267104822143678      (perpendicular crossing on the far side)
vy0     =  0.436635825362         (fixed by C, not stored separately)
period  = 43.937540294751 TU  =  190.8 days
```

| | |
|---|---|
| crossing residual, vx | 4.1e-13 — the shooting function's own noise floor |
| closes on itself after one period | 1.1e-8 |
| libration | ±158° about the far side; L4 and L5 sit at ±120 |
| mean semi-major axis | 0.9997 — a genuine 1:1 co-orbital, not merely a U-shape |
| closest approach to the Moon | 145 000 km |
| same family at tolerance 1e-9 / 1e-11 / 1e-13 | libration span 315.2° all three |

`tools/horseshoe.mjs` regenerates the whole family from nothing — no seed, no
table — by sweeping perpendicular far-side crossings at fixed C, bracketing every
sign change of vx at the next crossing, and correcting each bracket. It finds
eleven horseshoes across C = 3.00, 3.05 and 3.10.

### Why searching for it first failed

Three thousand initial conditions found nothing, and the reason was two
compounding mistakes, neither of them physics.

**The energy window was wrong.** The co-orbital literature gives the Earth–Moon
horseshoe range as C(L4) < C < **C(L2)** = 3.172. The search was capped at C(L3)
= 3.012 — the bottom sixth of it — on an assumption about zero-velocity geometry
that was never checked against the source.

**The search band was far too narrow.** The initial conditions came from a
guiding-centre approximation, which put the co-orbital band at |Δr| < 0.127 DU.
The real family runs from r = 0.605 to 1.367 — a radial half-width of 0.32, two
and a half times wider. That approximation is excellent at small mass ratios and
poor at the Moon's, which is exactly where the answer changed.

**And no grid would have worked anyway.** These orbits amplify a perturbation by
1.8e5 per period. An unstable family is a measure-zero set: the states that stay
on it have to be *corrected* into existence, never stumbled upon. That is why
`correctAtEnergy` exists, and it is the machinery the targeting feature needs
too.

The earlier reading — that the family disappears above a mass ratio of about
2e-3 — was wrong. What disappears above that ratio is the *initial-condition
sweep's* ability to land on it, because the guiding-centre guess it rests on
degrades. The family itself is there.

### Two numerical points worth keeping

**The corrector's target cannot be tighter than its own noise.** vx at the
crossing is the end of a 20-TU integration at tolerance 1e-13, so it is only
knowable to about 1e-12. Asking Newton for 1e-13 has it chasing integration noise
instead of the root, and it never converges.

**An unstable orbit cannot close better than its instability allows.** With a
residual of 4e-13 in the initial condition and 1.8e5 amplification, closure lands
at 1e-10 and no tighter. The period is stored to twelve figures for the same
reason: rounded to six, the orbit does not come back to where it started, and
that is a real 2e-4 error rather than a display choice.

## What the app measures at runtime

| | |
|---|---|
| one full horseshoe period played through | returns to x = −1.26710 against a start of −1.267104822 |
| Jacobi drift over that period | 2.8e-11 absolute, 9.4e-12 relative, 1456 steps, 0 rejected |
| frame switch | transforms the stored trajectory; round trip 2.2e-16 |
| eight frame switches while playing | run identical: 20000 samples, C0 3, 1456/0 steps |
| Moon's bearing from Earth, Earth-following | 0°, 45°, 90°, 135°, 180°, −135°, −90°, −45°, 0.2° over one sidereal month |
| targeting, L4 tadpole → L2 | Δv 94.0 m/s, 17.4 days, miss 0.4 km, C 2.988073 → 2.984761 |
| targeting, near L4 → L4 | Δv 9 m/s |
| targeting, near L1 → L5 | Δv 1057 m/s — expensive, and it says so |
| the `free` preset | ends in `impact: Moon`, detected on the physical radius |

The camera has no effect on any of it. Zooming, panning and fitting through a
whole session leaves the run's sample count, `C0` and step count byte-identical —
checked, not assumed.

One thing worth recording. The readout first showed a Jacobi drift of 1.5e-5
while the solver was holding 1e-11, because the displayed velocity was
reconstructed by differencing sampled positions. The diagnostics were reporting
their own arithmetic rather than the integration — precisely what `RESEARCH.md`
says not to hide. Velocities are sampled from the interpolant now and the
readout shows 1.2e-8, which is the interpolation between samples and nothing
else.

## Next

1. Family continuation in C, so the horseshoe becomes a slider across the family
   rather than two fixed members.
2. Planar Lyapunov orbits and DRO; then 3D — halo, Lissajous, NRHO.
3. Invariant-manifold transfers, which is what the targeting wants to grow into:
   the tubes are real conduits and cheaper than shooting at a point.
