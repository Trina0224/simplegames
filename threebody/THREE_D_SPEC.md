# Threebody — 3D Phase Specification

## 1. Purpose

The 2D Earth–Moon CR3BP sandbox is considered feature-complete enough to begin a true spatial (3D) phase.

3D is an **additional physical mode**, not a replacement for the existing 2D experience. The 2D mode remains the clearest place to understand horseshoes, tadpoles, zero-velocity curves, free launch, targeting and reference-frame effects.

The reason to add 3D is to expose dynamics that do not exist in the planar problem:

- out-of-plane motion,
- halo orbits,
- Lissajous trajectories,
- near-rectilinear halo orbit (NRHO) families,
- later, spatial invariant manifolds and 3D free launch.

Do not make the first 3D milestone a visual extrusion of the 2D canvas. The state and dynamics must genuinely include `z` and `vz`.

---

## 2. Canonical 3D CR3BP state

Use the same normalized Earth–Moon CR3BP conventions as the existing solver.

State:

```text
[x, y, z, vx, vy, vz]
```

Primary distances:

```text
r1 = sqrt((x+mu)^2 + y^2 + z^2)
r2 = sqrt((x-1+mu)^2 + y^2 + z^2)
```

Effective potential:

```text
Omega = 0.5*(x^2+y^2)
      + (1-mu)/r1
      + mu/r2
```

Equations:

```text
xddot =  2*vy + dOmega/dx
yddot = -2*vx + dOmega/dy
zddot =          dOmega/dz
```

with

```text
dOmega/dz = -(1-mu)*z/r1^3 - mu*z/r2^3
```

Jacobi integral:

```text
C = 2*Omega - (vx^2 + vy^2 + vz^2)
```

The existing planar system must be an invariant subspace of the 3D implementation: if `z=0` and `vz=0`, the 3D propagator must reproduce the validated 2D trajectory to numerical tolerance.

---

## 3. Architecture rule

Do not rewrite or destabilize the validated 2D core merely to obtain 3D.

Preferred structure:

```text
existing 2D mode
    remains available and regression-tested

3D dynamics layer
    six-state propagation
    spatial periodic-orbit correction
    3D rendering/camera
```

Shared numerical utilities are acceptable only if the 2D regression suite remains unchanged in result.

No 3D feature may silently alter:

- 2D horseshoe initial states,
- 2D Jacobi behavior,
- 2D targeting,
- 2D free launch,
- 2D frame transforms,
- collision semantics.

---

## 4. Phase 1 — minimum 3D milestone

The first 3D release should be intentionally narrow.

Required:

1. true six-state 3D CR3BP propagation,
2. a 3D camera with orbit/rotate, zoom and reset,
3. Earth, Moon and L1–L5 rendered in a spatial scene,
4. an ecliptic/reference plane so out-of-plane motion is visually obvious,
5. one numerically corrected Earth–Moon halo orbit family member,
6. preferably both an L1 and L2 halo preset once the first one is trustworthy,
7. Jacobi diagnostics and convergence checks,
8. frame switching where physically meaningful without re-integrating.

Not required in Phase 1:

- 3D free launch,
- 3D manual burn editing,
- 3D target planner,
- NRHO,
- Lissajous,
- 3D zero-velocity surfaces,
- invariant manifolds.

Do not expand scope until the first halo orbit is demonstrably real.

---

## 5. Halo orbit requirement

The first 3D acceptance target is a genuine periodic halo orbit near a collinear libration point.

It must be generated from the CR3BP equations and a numerical correction/continuation process. It may use a literature analytical approximation or published state as an initial seed, but the displayed orbit must be propagated and corrected by this project.

Forbidden:

- hand-authored 3D loops,
- Bézier/spline halo shapes,
- simply tilting a planar Lyapunov orbit,
- keyframing `z`,
- changing the renderer while keeping a 2D physical state.

A halo preset must expose enough provenance to reproduce it:

```text
mu
initial six-state vector
period
Jacobi constant
correction residual
integration tolerance
closure error after one period
```

### Numerical method

A Richardson third-order halo approximation is acceptable as a seed, not as the final numerical trajectory.

Use differential correction / shooting to satisfy periodicity and symmetry constraints. Continuation should then be used to obtain neighboring family members rather than independently hand-tuning states.

The implementation should exploit symmetry when practical, e.g. an appropriate section crossing and half-period correction.

---

## 6. 3D camera and presentation

The 3D view must help users understand vertical structure rather than merely look cinematic.

Required camera interactions:

- drag/orbit camera,
- pinch or wheel zoom,
- reset/fit,
- top view,
- side view,
- an oblique default view.

Recommended visual aids:

- translucent or subtle `z=0` reference plane,
- faint barycentric axes or optional axis toggle,
- L-point labels,
- trajectory with a clear depth cue,
- spacecraft marker/sprite,
- Earth/Moon visual treatment consistent with 2D.

Do not use perspective or camera motion that makes orbital shape impossible to judge. Orthographic projection is acceptable and may be preferable as a scientific default; perspective can be optional.

A user should be able to switch to top view and verify how the 3D orbit projects into the planar geometry, then rotate to the side and see the real `z` excursion.

---

## 7. Reference frames in 3D

The rotating and barycentric inertial transforms extend directly to 3D.

For rotating → inertial, rotate the `x-y` components about the `z` axis while preserving `z`; velocity transformation must include the rotating-frame angular velocity as in the current 2D implementation, with `vz` unchanged by the planar frame rotation.

Earth-following may also be supported by subtracting Earth's simultaneous inertial six-state contribution where applicable.

All frames must display the same integrated six-state history. Never integrate separate frame-specific trajectories.

---

## 8. Validation contract

Before shipping any 3D halo preset, validate at least:

1. `z=0, vz=0` reproduces the 2D solver within the established tolerance.
2. 3D Jacobi drift remains within the numerical budget during unforced propagation.
3. Rotating → inertial → rotating six-state round trip returns the same state to floating-point tolerance.
4. A corrected halo orbit closes after one period within the stated residual/error budget.
5. Tightening integration tolerance does not materially change the halo topology, period or amplitude.
6. Tightening the correction tolerance converges until the numerical noise floor is reached.
7. Mirrored north/south halo solutions obey the expected symmetry if both are provided.
8. Collision detection uses physical Earth/Moon radii in 3D distance, not 2D projected distance.
9. Camera rotation/zoom never changes physical state or solver output.
10. A 3D preset stores a real six-state vector; no hidden renderer-only `z` offset is permitted.

---

## 9. Phase 2 — after halo is trustworthy

Add spatial families in this order unless implementation evidence suggests otherwise:

### Lissajous

Quasi-periodic 3D motion near L1/L2. It should not be mislabeled as periodic unless a periodic solution was actually corrected.

### NRHO

Treat NRHO as part of the halo-family landscape, not as a decorative special orbit. Use continuation from an appropriate halo family and verify the characteristic near-rectilinear lunar close-approach geometry.

Do not claim operational Gateway fidelity: this project is still ideal Earth–Moon CR3BP unless a higher-fidelity ephemeris model is explicitly added later.

### Optional family browser

Once continuation is reliable, expose a family parameter/amplitude slider rather than a collection of unrelated hand-picked presets.

---

## 10. Phase 3 — interactive 3D sandbox

Only after the 3D periodic-orbit solver and renderer are stable:

- 3D free launch with user-selected `z` and `vz`,
- 3D impulsive burns,
- 3D targeting,
- spatial invariant manifolds,
- optional zero-velocity surfaces.

A 3D Free Launch interaction must have an understandable way to set all three velocity components. Do not hide `vz` behind an arbitrary default and call the control fully 3D.

---

## 11. Zero-velocity surfaces

In 3D the Jacobi boundary becomes a surface:

```text
2*Omega(x,y,z) = C
```

This is useful but is not a Phase 1 requirement because a volumetric/isosurface visualization can easily obscure the orbit.

If later implemented:

- derive it from the live Jacobi constant,
- do not use a decorative mesh,
- allow transparency/slicing,
- keep the trajectory readable,
- recompute only when `C` changes, not every animation frame.

---

## 12. Performance

3D rendering must not pressure the solver into lower accuracy.

Keep the existing separation:

```text
numerical integration / correction
        ↓
validated sampled six-state history
        ↓
playback / frame transform
        ↓
3D renderer
```

Web Worker computation remains preferred for long integrations and correction iterations.

Avoid rebuilding expensive geometry every frame. Camera movement is purely visual.

---

## 13. Acceptance definition for first 3D release

The first 3D phase is complete when a user can:

1. enter 3D mode without breaking the existing 2D mode,
2. load a genuine Earth–Moon halo preset,
3. watch the propagated spacecraft leave the `z=0` plane,
4. rotate the camera freely,
5. switch top/side/oblique views,
6. inspect Jacobi and numerical diagnostics,
7. switch display frames without re-integration,
8. observe the halo close on itself over one period within the validated error budget.

The success criterion is simple:

**3D must reveal real spatial dynamics that the 2D toy cannot show. If removing the camera tilt makes the feature disappear, it is not a 3D physics feature.**
