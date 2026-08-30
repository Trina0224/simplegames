# Threebody — 3D Research Notes

## Purpose

This file is the research companion to `THREE_D_SPEC.md`. It covers the spatial Earth–Moon CR3BP phase only: halo orbits first, then Lissajous and NRHO families.

The current 2D implementation remains the validated baseline. The 3D phase must reproduce the planar dynamics exactly when `z = vz = 0`.

---

## Canonical spatial CR3BP

Use the same nondimensional Earth–Moon system as the 2D solver:

```text
state = [x, y, z, vx, vy, vz]
mu ≈ 0.0121505856
Earth = (-mu, 0, 0)
Moon  = (1-mu, 0, 0)
```

Distances:

```text
r1 = sqrt((x+mu)^2 + y^2 + z^2)
r2 = sqrt((x-1+mu)^2 + y^2 + z^2)
```

Potential and equations:

```text
Omega = 0.5*(x^2+y^2) + (1-mu)/r1 + mu/r2

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

---

## Tier A — halo-orbit foundations

### Richardson (1980)

**David L. Richardson, “Analytic construction of periodic orbits about the collinear points,” Celestial Mechanics 22(3), 241–253 (1980). DOI: 10.1007/BF01229511.**

Why it matters:

- gives a third-order analytical construction of halo-type periodic motion near collinear libration points,
- provides a useful initial guess / seed for numerical differential correction,
- should not be used as the final displayed trajectory without numerical correction and propagation.

The project may use a Richardson approximation to initialize an L1/L2 halo corrector.

### Howell (1984)

**Kathleen C. Howell, “Three-dimensional, periodic, ‘halo’ orbits,” Celestial Mechanics 32, 53–71 (1984). DOI: 10.1007/BF01358403.**

Why it matters:

- numerically studies families of spatial periodic halo orbits near the collinear libration points,
- establishes halo families as genuine CR3BP periodic families rather than isolated curves,
- supports the project requirement that a halo preset should come from a corrected family member and preferably continuation.

### Howell & Breakwell (1984)

**Kathleen C. Howell and John V. Breakwell, “Almost Rectilinear Halo Orbits,” Celestial Mechanics 32, 29–52 (1984). DOI: 10.1007/BF01358402.**

Why it matters:

- examines halo families approaching thin, nearly rectilinear geometry near a primary,
- is foundational for understanding the family structure related to modern near-rectilinear halo orbit terminology,
- useful before attempting NRHO continuation.

---

## Tier B — operational and historical context

### Farquhar / ISEE-3

Robert Farquhar’s libration-point work and the ISEE-3 mission provide historical proof that halo-orbit dynamics are not merely theoretical. ISEE-3 became the first mission to exploit a halo orbit near a libration point.

Useful references include:

- Farquhar, “The Control and Use of Libration-Point Satellites,” NASA TR R-346 (1970).
- Farquhar, Muhonen & Richardson, “Mission Design for a Halo Orbiter of the Earth,” Journal of Spacecraft and Rockets 14 (1977), 170–177.
- Farquhar et al., “Trajectories and Orbital Maneuvers for the First Libration-Point Satellite,” Journal of Guidance and Control 3 (1980), 549–554.

These are context references, not the primary numerical algorithm reference for this codebase.

---

## Tier C — Lissajous and quasi-periodic motion

### Howell & Pernicka (1988)

**Howell & Pernicka, “Numerical Determination of Lissajous Trajectories in the Restricted Three-Body Problem.”**

Use this when the project moves beyond periodic halo families to quasi-periodic motion near L1/L2.

Important product distinction:

- halo orbit: periodic family member,
- Lissajous trajectory: generally quasi-periodic,
- do not label a Lissajous trajectory periodic merely because its plotted path visually seems to close over a short interval.

---

## Tier D — NRHO

NRHO should be approached as a region/subset of the Earth–Moon halo-family landscape, not as an unrelated canned orbit.

### Howell & Breakwell foundation

The 1984 almost-rectilinear-halo work is the key classical family reference.

### Modern Earth–Moon NRHO literature

Modern cislunar literature treats Earth–Moon L2 near-rectilinear halo orbits as central mission-design objects. Recent work continues to study their stability and operational behavior in the CR3BP and higher-fidelity models.

For this toy:

- first generate/continue the CR3BP family,
- verify near-rectilinear geometry and lunar close approach,
- do not imply Gateway-level operational fidelity,
- do not add Sun, ephemerides, lunar harmonics or station keeping unless a future higher-fidelity mode is explicitly scoped.

---

## Numerical strategy for the first halo family

Recommended pipeline:

```text
1. choose L1 or L2
2. construct a small-amplitude spatial seed
   - Richardson third-order approximation is acceptable
3. propagate to a symmetry section / half period
4. differential-correct selected initial-state components
5. require periodic closure / symmetry residual convergence
6. propagate a full period
7. measure closure error and Jacobi drift
8. continue in amplitude / state parameter to neighboring family members
```

Do not rely on unconstrained random search for a halo family.

As with the 2D horseshoe, the hard part is locating/correcting the measure-zero periodic solution, not evaluating the equations of motion.

---

## Symmetry and correction

Spatial halo families admit symmetry that can reduce the correction problem. The exact state variables chosen for a corrector may depend on the chosen section and convention, but the implementation should:

- state the symmetry assumptions explicitly,
- state which initial components are fixed,
- state which components are corrected,
- state the event/section used for the half-period condition,
- state the residual driven to zero.

A solution should be accepted on numerical residuals, not visual closure.

---

## Continuation

Once a single corrected halo solution exists, continuation should be the default way to build a family.

Acceptable approaches include:

- parameter continuation in a selected initial-state amplitude,
- continuation in Jacobi constant,
- pseudo-arclength continuation if simple parameter continuation folds or becomes ill-conditioned.

Store family provenance. A preset should identify where it came from rather than storing an unexplained six-state vector.

---

## Validation targets

For every claimed 3D periodic preset record:

```text
initial state [x,y,z,vx,vy,vz]
period
C
absolute / relative Jacobi drift
periodic closure error
correction residual
accepted/rejected integration steps
integration tolerance
```

Also re-run with tighter tolerances. A visually similar orbit is not sufficient if the topology, period or amplitude changes materially.

The planar invariant-subspace test is mandatory:

```text
3D([x,y,0,vx,vy,0])
```

must agree with the existing validated 2D solver.

---

## 3D reference frames

The current frame philosophy remains unchanged: one physical state history, multiple display transforms.

Rotating → inertial:

- rotate `(x,y)` about `z`,
- preserve `z`,
- transform `(vx,vy)` with the frame angular velocity term,
- preserve `vz` under the planar-axis rotation.

Earth-following:

- start from the barycentric inertial six-state,
- subtract Earth’s simultaneous inertial position and velocity,
- preserve the spacecraft’s relative `z` because Earth remains in the reference plane in the ideal CR3BP.

No display frame gets its own integration.

---

## 3D zero-velocity geometry

In spatial CR3BP the zero-velocity boundary is a surface:

```text
2*Omega(x,y,z) = C
```

This should be deferred until after halo rendering works. An isosurface can easily hide the orbit and can be computationally expensive.

If implemented later, use a real isosurface of the current Jacobi geometry; do not extrude the 2D ZVC or draw a decorative shell.

---

## Rendering research direction

For scientific readability, an orthographic 3D camera is a strong default because apparent orbit geometry does not change with perspective depth. Perspective may be offered as an optional presentation mode.

Required visual references:

- `z=0` plane,
- Earth–Moon line / L-point positions,
- top and side views,
- depth cue on trajectory,
- camera-independent physical coordinates.

The renderer must never become the source of an orbit’s `z` coordinate.

---

## Sources to keep near the implementation

1. Richardson, D. L. (1980), “Analytic construction of periodic orbits about the collinear points,” Celestial Mechanics 22(3), 241–253. DOI `10.1007/BF01229511`.
2. Howell, K. C. (1984), “Three-dimensional, periodic, ‘halo’ orbits,” Celestial Mechanics 32, 53–71. DOI `10.1007/BF01358403`.
3. Howell, K. C. & Breakwell, J. V. (1984), “Almost Rectilinear Halo Orbits,” Celestial Mechanics 32, 29–52. DOI `10.1007/BF01358402`.
4. Farquhar, R. W. (1970), “The Control and Use of Libration-Point Satellites,” NASA TR R-346.
5. Howell & Pernicka (1988), numerical Lissajous trajectory determination in the restricted three-body problem.
6. Koon, Lo, Marsden & Ross, _Dynamical Systems, the Three-Body Problem and Space Mission Design_, for spatial invariant-manifold context after the periodic-orbit milestone.

---

## Immediate implementation recommendation

Do **not** begin with NRHO, 3D free launch, 3D targeting or a zero-velocity isosurface.

Begin with:

```text
six-state propagator
    -> planar regression test
    -> L1 or L2 halo seed
    -> differential correction
    -> one validated periodic halo
    -> 3D camera/viewer
    -> family continuation
```

That sequence proves the 3D physics before expanding the product surface.
