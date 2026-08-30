# Threebody — Product & Physics Specification

## 1. Product idea

An interactive Earth–Moon three-body sandbox for seeing orbital behavior that is difficult to imagine from textbook diagrams.

The user controls a spacecraft in the Earth–Moon Circular Restricted Three-Body Problem (CR3BP), chooses destinations or orbit families, applies burns, and watches the resulting real trajectory unfold.

The experience should make these phenomena intuitive:

- L1–L5 are not equivalent “parking spots.”
- L1/L2/L3 are unstable.
- L4/L5 support stable tadpole motion in the ideal Earth–Moon CR3BP.
- A horseshoe orbit can wrap around the L3/L4/L5 region in the rotating frame without simply orbiting the Moon.
- The same trajectory looks radically different in rotating, Earth-following and inertial views.
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
- barycenter marker where meaningful
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
Fit
```

The design should feel like an interactive physical instrument, not a mission-control dashboard.

---

## 5. Reference frames

The app shall expose three ways of looking at the same physical state history.

Suggested UI labels:

```text
Rotating — horseshoe view
Earth-following — intuitive view
Barycentric inertial — space view
```

Frame switching is a display transform only. It must preserve the same integrated trajectory, playback time, current maneuver state and numerical diagnostics.

### 5.1 Rotating / synodic frame

Earth and Moon are stationary.

This is the primary educational/visual frame for:

- L points
- tadpoles
- horseshoes
- zero-velocity curves
- transfer geometry

A user should be able to see why the horseshoe is naturally defined in the co-rotating Earth–Moon geometry.

### 5.2 Earth-following view

This is the most familiar presentation for a general audience.

Earth is visually held at the origin while the Moon revolves around it. This does **not** mean the physical model assumes a stationary Earth. The Earth-following view is an accelerated/non-inertial display frame derived from the same barycentric inertial solution.

Required construction:

1. transform the current rotating CR3BP state to barycentric inertial coordinates,
2. compute Earth's barycentric inertial position and velocity at the same time,
3. translate the displayed origin to Earth.

For position and velocity:

```text
r_EF = r_inertial - r_earth,inertial
v_EF = v_inertial - v_earth,inertial
```

The same transformation rule must be applied consistently to every displayed physical object/history that belongs to the state geometry:

- spacecraft current state,
- travelled spacecraft trail,
- planned trajectory,
- Moon,
- L1–L5,
- velocity vector,
- burn vector,
- zero-velocity geometry when enabled.

Expected visual result:

- Earth remains at the screen-space/model-space origin of this display frame,
- Moon revolves around Earth,
- L1–L5 revolve with the Earth–Moon line,
- spacecraft motion is shown relative to Earth.

This view must not:

- freeze Earth in the physical CR3BP equations,
- invent a separate circular Moon animation,
- re-integrate the spacecraft,
- change Jacobi constant or solver state,
- be labeled as an inertial frame.

The purpose is pedagogical: it gives users an intuitive bridge between ordinary “Moon orbits Earth” thinking and the less intuitive rotating/barycentric views.

### 5.3 Inertial barycentric frame

Transform the same state history into the non-rotating frame centered on the Earth–Moon barycenter.

Earth and Moon both move around their common barycenter.

Required user effect:

A user should be able to watch a horseshoe in the rotating frame, switch to Earth-following to recognize the familiar Earth–Moon geometry, then switch to barycentric inertial and realize that the strange “horseshoe” is a consequence of relative/co-orbital motion rather than a spacecraft literally flying a horseshoe-shaped path through fixed space.

### 5.4 Display-frame validation

At any playback time, transforming rotating → barycentric inertial → rotating should recover the original state within floating-point tolerance.

Earth-following should additionally satisfy:

```text
Earth display position ≈ (0, 0)
Moon display position = Moon_inertial - Earth_inertial
Spacecraft display position = spacecraft_inertial - Earth_inertial
```

For vectors, use the corresponding velocity subtraction where required.

No frame switch may cause re-integration.

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

### Cross-frame explanation

The three frames should teach different things:

- **Rotating:** shows the horseshoe geometry clearly.
- **Earth-following:** shows the motion in the familiar Earth-at-center mental model.
- **Barycentric inertial:** shows the non-rotating physical-space representation around the Earth–Moon barycenter.

Keep explanation concise:

```text
The spacecraft is not bouncing from a wall.
Its orbital energy and angular rate change during the distant interaction with the Moon.
The horseshoe shape appears in the rotating frame because it is a relative 1:1 co-orbital motion.
```

No canned reversal animation.

---

## 9. Jacobi constant and zero-velocity curves

### Jacobi display

Show `C` in an information panel.

Keep the full diagnostics available:

```text
C0
Cnow
ΔC
relative drift
integrator steps
rejected steps
current frame
status
build
```

Do not remove diagnostics merely to simplify the consumer-facing view.

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

When rendered in Earth-following or barycentric inertial views, transform the same geometry for display; do not recompute a different physical invariant.

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

Burn interaction must remain correct in all three display frames. A user gesture may be interpreted in the current display frame, but the resulting Δv must be transformed back into the canonical rotating state before propagation.

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

The Earth and Moon may have visual surface motion and lighting, but those effects must not change their physical centers or orbital dynamics.

In Earth-following view, Earth remains visually centered while Moon orbital motion remains derived from the transformed physical state. The Moon's tidal-lock appearance should remain consistent with the Earth–Moon line.

For now, retain the existing enlarged render-radius behavior under zoom. Do not clamp apparent body size until it has been evaluated on-device.

---

## 15. Camera interaction

The camera is presentation only.

Required interactions:

- pinch zoom on touch devices,
- mouse/trackpad wheel zoom,
- pan by dragging empty space,
- spacecraft drag reserved for burn interaction,
- Fit restores the preset's intended framing without re-integration.

Current interaction rule:

```text
pointer near spacecraft -> burn
pointer on empty space  -> pan
two fingers / wheel     -> zoom
```

Changing zoom, pan or Fit must not alter trajectory samples, C0, solver steps or playback state.

Earth-following should remain fully compatible with the same camera controls.

---

## 16. Collision / escape

### Collision

If spacecraft crosses the physical Earth/Moon radius:

- stop propagation,
- mark impact location,
- report collision.

No automatic bounce.

### Escape / numerical domain

Define a generous domain boundary for visualization/integration safety. Crossing it should be labeled `left display domain` or `escape-like trajectory`, not necessarily physical escape from the real Earth–Moon–Sun system.

---

## 17. Numerical validation suite

Before calling v0.1 physically trustworthy, test:

1. L-point positions against published Earth–Moon values.
2. Stationary exact L point remains stationary within numerical tolerance when unperturbed.
3. Tiny perturbations at L1/L2/L3 grow as expected.
4. L4/L5 small perturbations produce bounded/tadpole behavior.
5. Jacobi constant drift remains within target tolerance on ordinary trajectories.
6. Horseshoe remains the same family when tolerances are tightened.
7. Rotating→barycentric inertial→rotating round-trip returns the same state within floating-point tolerance.
8. Earth-following position equals barycentric inertial position minus Earth's simultaneous barycentric inertial position.
9. Earth-following velocity equals barycentric inertial velocity minus Earth's simultaneous barycentric inertial velocity.
10. Earth is at the Earth-following origin while Moon/L points move consistently with the Earth–Moon line.
11. Switching among all three frames does not change the integrated trajectory or trigger re-integration.
12. Zero-velocity contour changes consistently after Δv.
13. Collision detection uses physical, not rendered, body radius.
14. If JPL periodic-orbit reference states are used, propagated family behavior agrees with the reference.

---

## 18. v0.1 acceptance tests

A user can:

1. open the app and immediately see Earth, Moon and L1–L5,
2. select L4 tadpole and watch a true integrated trajectory,
3. select Horseshoe and eventually see the characteristic rotating-frame horseshoe,
4. switch to Earth-following and see Earth fixed while Moon, L points and spacecraft move relative to it,
5. switch to barycentric inertial without changing the physical solution,
6. switch repeatedly among all three frames without re-integrating,
7. toggle zero-velocity curves,
8. inspect the full Jacobi/solver diagnostics,
9. apply a Δv and watch the future path change,
10. request an L-point target and receive a numerically solved candidate burn,
11. execute the burn without position snapping,
12. intentionally perturb L1 and watch instability develop,
13. zoom, pan and Fit without affecting physics.

---

## 19. Non-goals for v0.1

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

## 20. Success criterion

The user should repeatedly discover paths that look impossible, switch among the three frames, and realize both of these things:

**the weird path was not animated by us — the equations produced it.**

**the shape of an orbit depends on the reference frame from which you choose to look at the same physical motion.**
