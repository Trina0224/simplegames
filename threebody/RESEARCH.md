# Threebody — Research Notes

## Scope

This project is an interactive Earth–Moon Circular Restricted Three-Body Problem (CR3BP) sandbox. The user flies a massless spacecraft in the rotating Earth–Moon frame, explores the five libration points, and can launch or target physically integrated trajectories such as tadpole, horseshoe, Lyapunov, halo/NRHO (later 3D), quasi-satellite-like and chaotic paths.

The simulator must use the actual CR3BP equations of motion. Visual paths are never hand-authored.

---

## Canonical model

Use the standard nondimensional Earth–Moon CR3BP.

- Primary masses: Earth and Moon.
- Spacecraft mass is negligible.
- Primaries move in circular orbits about their barycenter.
- Rotating/synodic frame keeps Earth and Moon fixed on the x-axis.
- Earth–Moon distance is 1 DU.
- Angular rate is 1 in normalized units.
- Earth–Moon mass parameter is approximately `mu = 0.0121505856`.
- Typical dimensional conversion: 1 DU ≈ 384,400 km; 1 TU ≈ 4.3425 days.

Primary positions:

```text
Earth: (-mu, 0, 0)
Moon:  (1-mu, 0, 0)
```

Distances:

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

Equations of motion:

```text
xddot - 2*ydot = dOmega/dx
yddot + 2*xdot = dOmega/dy
zddot            = dOmega/dz
```

Jacobi integral:

```text
C = 2*Omega - (xdot^2 + ydot^2 + zdot^2)
```

The Jacobi constant is the primary numerical integrity check. Zero-velocity curves/surfaces are obtained from `2*Omega = C`.

Representative Earth–Moon libration-point positions in normalized rotating coordinates:

```text
L1 ≈ ( 0.8369,  0)
L2 ≈ ( 1.1557,  0)
L3 ≈ (-1.0050,  0)
L4 ≈ ( 0.4878, +0.8660)
L5 ≈ ( 0.4878, -0.8660)
```

Compute these numerically in the implementation rather than hardcoding them as truth.

---

## Research hierarchy

### Tier A — CR3BP fundamentals and invariant geometry

1. **Koon, Lo, Marsden & Ross — _Dynamical Systems, the Three-Body Problem and Space Mission Design_.**
   - Primary conceptual reference for CR3BP phase-space geometry, libration-point dynamics, invariant manifolds, low-energy transfers and mission design.
   - Use for rotating-frame equations, Jacobi geometry, stable/unstable manifolds and transport tubes.

2. **NASA Astrodynamics Convention & Modeling Reference, TP-20220014814 (2022).**
   - Practical convention reference for CR3BP coordinates, equilibrium points and Jacobi constant.
   - Use to prevent frame/sign convention mistakes.

3. **JPL Three-Body Periodic Orbits API.**
   - External validation/reference data for known Earth–Moon periodic orbit families, including halo, Lyapunov, DRO and resonant families.
   - Do not make runtime correctness depend on network access; use it as development/validation data only.

### Tier B — libration-point periodic orbits and targeting

4. **Howell (1984), “Three-dimensional, periodic, ‘halo’ orbits,” Celestial Mechanics 32, 53–71. DOI: 10.1007/BF01358403.**
   - Numerical families of halo orbits near collinear libration points.
   - Relevant when the project expands from 2D to 3D.

5. **Howell & Breakwell (1984), “Almost Rectilinear Halo Orbits.”**
   - Important foundation for the family that includes modern NRHO-like geometry.

6. **Howell & Pernicka (1988), “Numerical Determination of Lissajous Trajectories in the Restricted Three-Body Problem.”**
   - Useful for quasi-periodic libration-point trajectories and numerical correction.

7. **Gómez, Koon, Lo, Marsden, Masdemont & Ross (2001–2004), invariant-manifold / spatial three-body mission-design work.**
   - Stable and unstable manifold tubes around libration-point orbits are genuine dynamical conduits.
   - Later transfer-planning modes should expose this geometry rather than inventing “curved routes.”

### Tier C — co-orbital motion: tadpole, horseshoe, quasi-satellite

8. **Shen, Liu & Liao (2023), “Analytical Study of the Co-orbital Motion in the Circular Restricted Three-body Problem.” DOI: 10.1088/1674-4527/acc29c.**
   - Recovers tadpole, horseshoe and quasi-satellite families in circular RTBP.
   - Use as a modern classification reference for 1:1 co-orbital behavior.

9. **Liao (2023), “A semi-analytical model for coorbital motion,” MNRAS 522, 2821–2834. DOI: 10.1093/mnras/stad1059.**
   - Describes transitions between horseshoe and quasi-satellite regimes.

10. **Low-thrust transfer to the Earth–Moon triangular libration point via horseshoe orbit (Acta Astronautica, 2020).**
    - Directly relevant to Earth–Moon horseshoe motion.
    - In planar Earth–Moon CR3BP, horseshoe trajectories encompass L3, L4 and L5 and are constrained by Jacobi energy / zero-velocity geometry.

11. **Murray / co-orbital literature and numerical studies of horseshoe companions.**
    - The defining visual feature is clearest in the rotating frame, not the inertial frame.
    - Tadpoles librate around L4 or L5, horseshoes librate about 180° and encompass both triangular points, and quasi-satellite motion librates about 0° in the resonant angle.

---

## Numerical integration policy

Physics fidelity is more important than drawing speed.

### Required

- Integrate the differential equations numerically.
- Use double-precision JavaScript numbers.
- Use an adaptive higher-order method for trajectory generation.
- Initial implementation may use Dormand–Prince RK5(4) with strict tolerances.
- For long horseshoe trajectories, benchmark invariant drift; upgrade to DOP853 or a suitable structure-preserving method if RK5(4) does not maintain the required error budget.
- Trajectory computation should run separately from animation playback; Web Worker is preferred for long integrations.

### Forbidden

- Euler integration.
- “Pretty” Bézier/spline paths in place of dynamics.
- Moving the spacecraft toward a target by steering its position directly.
- Renormalizing the state every frame to force Jacobi conservation.
- Silently clipping close encounters to make trajectories look stable.

### Numerical invariant

For unforced propagation the Jacobi constant must remain approximately constant. Track:

```text
relativeJacobiDrift = abs(C(t)-C0) / max(1, abs(C0))
```

The UI/debug view should expose drift. Final tolerances must be established by convergence testing; the implementation may not claim physical fidelity without this check.

---

## Lagrange-point interpretation

Do not present all five L points as equivalent parking spots.

- `L1`, `L2`, `L3`: collinear equilibria; dynamically unstable in the planar problem. A spacecraft placed exactly at the mathematical equilibrium remains there only in the ideal model; arbitrarily small perturbations grow.
- `L4`, `L5`: triangular equilibria. The Earth–Moon mass ratio is below the classical triangular-point stability limit, so small planar motions can produce stable tadpole families in the ideal CR3BP.

User-facing destination semantics should reflect this:

```text
L1/L2/L3:
  Fly through
  Target equilibrium (educational / unstable)
  Enter Lyapunov family
  Later: halo / Lissajous / manifold transfer

L4/L5:
  Reach region
  Enter tadpole orbit
  Enter short/long-period family when implemented
```

---

## Horseshoe orbit contract

Horseshoe is a hard requirement for the first interesting build.

A valid horseshoe trajectory must:

- arise from direct CR3BP integration,
- be viewed primarily in the rotating frame,
- encompass the L3/L4/L5 region in the characteristic horseshoe topology,
- avoid collision with the Moon,
- maintain acceptable Jacobi drift,
- exhibit the expected slow reversal near the secondary’s longitude rather than being manually turned around.

The same physical trajectory should look much less obviously horseshoe-like in the inertial frame. The app should let the user switch frames and see this difference.

---

## Targeting / trajectory design

“Go to L1” is a boundary-value / targeting problem, not a waypoint interpolation problem.

### Initial 2D targeting

Use single- or multiple-shooting style correction:

1. start from current state,
2. choose a burn vector and/or time of flight,
3. propagate the CR3BP state,
4. evaluate terminal error against a target condition,
5. correct the burn using numerical derivatives / state transition information,
6. iterate to convergence.

Targets may be regions or section conditions, not always exact points.

### Display

A planned maneuver should report at least:

- Δv magnitude and direction,
- time of flight,
- target miss distance / residual,
- initial and post-burn Jacobi constant,
- whether the trajectory is ballistic after the burn.

Do not call a route “minimum Δv” unless an optimization problem was actually solved.

---

## Reference frames

The simulator must support at least:

### Rotating / synodic frame

- Earth and Moon stationary.
- L1–L5 stationary.
- Horseshoe/tadpole geometry is visually obvious.

### Inertial barycentric frame

- Earth and Moon orbit the barycenter.
- Show the exact same integrated spacecraft state transformed into inertial coordinates.
- Never integrate a separate fake inertial trajectory.

Frame switching is a coordinate transform of one trajectory, not two different simulations.

---

## First implementation boundary

v0.1 should remain planar (2D):

- Earth–Moon CR3BP
- all five L points
- direct spacecraft propagation
- rotating/inertial frame switch
- Jacobi constant
- zero-velocity curves
- free Δv burn
- L-point destination targeting
- tadpole presets
- at least one validated horseshoe preset
- chaotic/escape examples if they naturally arise

3D halo, Lissajous, NRHO and full manifold transfer design come after the 2D solver is numerically trustworthy.
