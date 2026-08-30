# Threebody — Product & Physics Specification

## 1. Product idea

An interactive Earth–Moon three-body sandbox for seeing orbital behavior that is difficult to imagine from textbook diagrams.

The user controls a spacecraft in the Earth–Moon Circular Restricted Three-Body Problem (CR3BP), chooses destinations or orbit families, applies burns, and watches the resulting real trajectory unfold.

The experience should make these phenomena intuitive:

- L1–L5 are not equivalent “parking spots.”
- L1/L2/L3 are unstable.
- L4/L5 support stable tadpole motion in the ideal Earth–Moon CR3BP.
- A horseshoe orbit can wrap around the L3/L4/L5 region in the rotating frame without simply orbiting the Moon.
- The same trajectory looks radically different in rotating and inertial frames.
- Jacobi constant and zero-velocity curves determine which regions are dynamically accessible.
- A small Δv can produce a qualitatively different path days or weeks later.

All trajectories must be numerically integrated from the physical model.

---

## 2. First target system

Use Earth + Moon + massless spacecraft.

### Assumptions

For v0.1:

- Earth and Moon move on circular orbits about their common barycenter.
- Spacecraft does not affect Earth or Moon.
- Motion is planar (`z = zdot = 0`).
- No Sun, oblateness, solar radiation pressure, thrust during coast, or ephemeris perturbations.

These are deliberate CR3BP assumptions, not claims about a flight-certified real mission model.

### Standard normalized units

```text
mu ≈ 0.0121505856
1 DU ≈ 384,400 km
1 TU ≈ 4.3425 days
angular rate n = 1
```

Use a dedicated conversion module for km, days, km/s and m/s display.

---

## 3. Core physics

In rotating coordinates:

```text
Earth = (-mu, 0)
Moon  = (1-mu, 0)

r1 = sqrt((x+mu)^2 + y^2)
r2 = sqrt((x-1+mu)^2 + y^2)

Omega = 0.5*(x^2+y^2)
      + (1-mu)/r1
      + mu/r2

xddot =  2*ydot + x - (1-mu)*(x+mu)/r1^3 - mu*(x-1+mu)/r2^3
yddot = -2*xdot + y - (1-mu)*y/r1^3      - mu*y/r2^3
```

Jacobi constant:

```text
C = xdot^2*(-1) + ydot^2*(-1) + 2*Omega
  = 2*Omega - (xdot^2 + ydot^2)
```

The actual implementation should express this clearly and test it directly.

---

## 4. Main screen

Default view: **rotating / synodic frame**.

Display:

- Earth
- Moon
- barycenter marker
- L1, L2, L3, L4, L5
- spacecraft
- current integrated trail
- velocity vector (toggle)
- current time
- current Jacobi constant
- optional zero-velocity curves

Primary controls:

```text
Destination
Frame
Preset
Burn / Δv
Play / Pause
Time speed
Reset
```

The design should feel like an interactive physical instrument, not a mission-control dashboard.

---

## 5. Reference frames

### Rotating frame

Earth and Moon are stationary.

This is the primary educational/visual frame for:

- L points
- tadpoles
- horseshoes
- zero-velocity curves
- transfer geometry

### Inertial barycentric frame

Transform the same state history into a non-rotating frame.

Required user effect:

A user should be able to watch a horseshoe in the rotating frame, switch frame, and realize that the strange “horseshoe” is a consequence of relative/co-orbital motion rather than a spacecraft literally flying a horseshoe-shaped path through fixed space.

Frame switching must not restart or re-integrate a different trajectory.

---

## 6. Lagrange points

Solve all five equilibrium points numerically from the current CR3BP parameters.

Expected Earth–Moon values are approximately:

```text
L1:  x ≈  0.8369
L2:  x ≈  1.1557
L3:  x ≈ -1.0050
L4: (x,y) ≈ (0.4878, +0.8660)
L5: (x,y) ≈ (0.4878, -0.8660)
```

### Selecting an L point

Selecting a point should open physically meaningful choices.

#### L1 / L2 / L3

```text
Show equilibrium
Fly through
Target point
Enter planar Lyapunov orbit   [when implemented]
```

Warn subtly that the exact equilibrium is unstable.

#### L4 / L5

```text
Show equilibrium
Target region
Enter tadpole orbit
```

Do not imply that reaching an L point automatically means “orbit complete.”

---

## 7. Preset trajectories

Presets are exact initial conditions + integration settings.

### v0.1 required presets

#### A. L4 Tadpole
A small-amplitude trajectory librating around L4.

#### B. L5 Tadpole
Equivalent trailing-family example.

#### C. Earth–Moon Horseshoe
The signature preset.

Requirements:

- actual CR3BP solution,
- surrounds the L3/L4/L5 co-orbital region in the rotating frame,
- natural reversal from dynamics,
- no spline or steering,
- validated Jacobi conservation,
- long enough playback to show the horseshoe behavior clearly.

Because natural horseshoe periods may be long in real time, time acceleration is expected.

#### D. L1 instability
Start extremely close to L1 with a deliberately tiny perturbation and show divergence.

#### E. L2 instability
Same educational behavior at L2.

#### F. Sensitive / chaotic launch
Two nearly identical initial states may be shown together later to demonstrate divergent outcomes.

### Later presets

- planar Lyapunov orbits
- DRO
- resonant periodic families
- quasi-satellite-like motion
- 3D halo
- Lissajous
- NRHO
- invariant-manifold transfers

---

## 8. Horseshoe visualization

This deserves dedicated UI treatment.

### Rotating-frame mode

When the Horseshoe preset is selected:

- keep Earth/Moon/L points visible,
- initially zoom to show the full co-orbital region,
- optionally fade older trail segments but preserve enough history to reveal the full horseshoe,
- provide a “show full trail” option.

### Explanation overlay

Keep explanation concise:

```text
The spacecraft is not bouncing from a wall.
Its orbital energy and angular rate change during the distant interaction with the Moon.
In the rotating frame this produces a slow reversal and a horseshoe-shaped libration.
```

No canned reversal animation.

---

## 9. Jacobi constant and zero-velocity curves

### Jacobi display

Show `C` in an information panel.

Optional advanced diagnostics:

```text
C0
Cnow
ΔC
relative drift
```

### Zero-velocity curves

Toggleable overlay calculated from current C.

The user should be able to observe that changing Δv changes C, which changes the necks/open regions around L1/L2 and therefore which regions are dynamically accessible.

Use contouring of:

```text
F(x,y) = 2*Omega(x,y) - C
```

with the `F=0` contour as the zero-velocity boundary.

Forbidden region:

```text
F < 0
```

Rendering must reflect the actual current C.

---

## 10. Free burns

The user can pause and apply an impulsive Δv.

### Interaction

Possible UI:

- drag an arrow from the spacecraft,
- show direction and magnitude,
- display m/s before committing.

On commit:

```text
vx += dvx
vy += dvy
```

Position is unchanged.

Then recompute future trajectory from that new state.

The app should make small burns interesting; do not default the control scale so high that every gesture is hundreds of m/s.

---

## 11. Destination targeting

The user should be able to request a destination such as L1–L5.

This is a numerical targeting feature, not autopilot steering.

### v0.1 planner

User selects:

- destination,
- optional arrival-time range,
- planning style such as `direct`, `lower Δv`, or `faster` only when actually supported.

Solver performs shooting:

```text
choose Δv guess
propagate
measure terminal residual
compute/update correction
repeat
```

Finite-difference Jacobians are acceptable initially. State-transition matrices may replace them later.

### Results

Show candidate plan:

```text
Δv
flight time
closest/terminal distance to target
residual
post-burn C
```

User explicitly presses `Execute Burn`.

Do not silently teleport/snap at arrival.

### Target semantics

For L1/L2/L3, targeting the mathematical point should not be presented as a stable long-term destination.

For L4/L5, provide both point/region arrival and tadpole insertion when supported.

---

## 12. Integrator

### First implementation

Use adaptive Dormand–Prince 5(4) or better.

Suggested state:

```text
[x, y, vx, vy]
```

Integrator exposes:

```text
absTol
relTol
minStep
maxStep
acceptedSteps
rejectedSteps
```

### Architecture

Do not couple solver steps to rendering frames.

Preferred flow:

```text
initial state / maneuver
        ↓
Web Worker trajectory integration
        ↓
sampled physical state history
        ↓
renderer interpolation/playback
```

### Long-duration validation

Horseshoe integration must be run at multiple tolerances. If significant secular Jacobi drift or topology changes appear, improve the integrator before shipping the preset.

---

## 13. Time controls

Natural orbital phenomena operate on hours, days, weeks or longer.

Provide playback speeds such as:

```text
1×
10×
100×
1 day/s
5 days/s
```

Playback speed only changes how quickly cached/integrated states are displayed. It must not alter physical integration results.

---

## 14. Earth and Moon rendering

Use visually enlarged radii if necessary for readability, but distinguish:

```text
physicalRadius
renderRadius
```

Gravity and collision detection use physical radius only.

Suggested visual treatment:

- Earth recognizable but restrained
- Moon smaller
- dark space background
- L points clearly labeled
- trajectory line is the visual focus

No need for photorealistic planet rendering in v0.1.

---

## 15. Collision / escape

### Collision

If spacecraft crosses the physical Earth/Moon radius:

- stop propagation,
- mark impact location,
- report collision.

No automatic bounce.

### Escape / numerical domain

Define a generous domain boundary for visualization/integration safety. Crossing it should be labeled `left display domain` or `escape-like trajectory`, not necessarily physical escape from the real Earth–Moon–Sun system.

---

## 16. Numerical validation suite

Before calling v0.1 physically trustworthy, test:

1. L-point positions against published Earth–Moon values.
2. Stationary exact L point remains stationary within numerical tolerance when unperturbed.
3. Tiny perturbations at L1/L2/L3 grow as expected.
4. L4/L5 small perturbations produce bounded/tadpole behavior.
5. Jacobi constant drift remains within target tolerance on ordinary trajectories.
6. Horseshoe remains the same family when tolerances are tightened.
7. Rotating→inertial→rotating round-trip returns the same state within floating-point tolerance.
8. Zero-velocity contour changes consistently after Δv.
9. Collision detection uses physical, not rendered, body radius.
10. If JPL periodic-orbit reference states are used, propagated family behavior agrees with the reference.

---

## 17. v0.1 acceptance tests

A user can:

1. open the app and immediately see Earth, Moon and L1–L5,
2. select L4 tadpole and watch a true integrated trajectory,
3. select Horseshoe and eventually see the characteristic rotating-frame horseshoe,
4. switch to inertial view without changing the physical solution,
5. toggle zero-velocity curves,
6. inspect Jacobi constant,
7. apply a Δv and watch the future path change,
8. request an L-point target and receive a numerically solved candidate burn,
9. execute the burn without position snapping,
10. intentionally perturb L1 and watch instability develop.

---

## 18. Non-goals for v0.1

Not yet:

- full ephemeris Earth–Moon–Sun model
- lunar mascons
- J2
- solar radiation pressure
- continuous finite thrust
- station keeping
- operational navigation uncertainty
- Monte Carlo covariance analysis
- 3D halo / NRHO
- mission certification

Those are future layers. v0.1 first proves that the planar CR3BP itself is correct and fun.

---

## 19. Success criterion

The user should repeatedly discover paths that look impossible, switch on the explanatory overlays, and realize:

**the weird path was not animated by us — the equations produced it.**
