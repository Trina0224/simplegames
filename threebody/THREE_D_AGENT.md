# THREE_D_AGENT.md — Implementation Rules for the 3D Phase

Read these before changing Threebody for 3D:

- `AGENTS.md`
- `SPEC.md`
- `RESEARCH.md`
- `THREE_D_SPEC.md`
- `THREE_D_RESEARCH.md`

The existing 2D implementation is the regression baseline. Do not rewrite it casually.

## Hard rules

1. 3D means a real six-state CR3BP state `[x,y,z,vx,vy,vz]`; renderer-only depth is forbidden.
2. `z=0, vz=0` must reproduce the validated planar dynamics.
3. First milestone is a numerically corrected halo orbit, not NRHO and not 3D Free Launch.
4. A literature/Richardson analytical halo is a seed only; the displayed orbit must be corrected and numerically propagated.
5. No Bézier/spline/keyframed halo paths.
6. Preserve Jacobi diagnostics and add full-period closure/correction residual diagnostics.
7. One integrated six-state history is transformed among display frames; never integrate a prettier frame-specific path.
8. Camera orbit/zoom/top/side/fit are presentation only and may never affect physical state.
9. Collision distance is three-dimensional physical distance to Earth/Moon centers.
10. Do not weaken 2D tests to make 3D pass.

## First implementation sequence

```text
A. six-state equations + integrator support
B. regression: z=vz=0 against existing 2D trajectories
C. 3D frame-transform round-trip tests
D. L1 or L2 halo seed
E. differential correction to a periodic solution
F. full-period closure + Jacobi validation
G. continuation to at least one neighboring family member
H. 3D viewer/camera with top, side and oblique views
I. expose the validated halo preset in the product
```

The numerical orbit should exist before presentation polish.

## Halo acceptance

A halo preset is accepted only if the commit/report records:

```text
initial six-state
period
Jacobi constant
correction residual
full-period closure error
integrator tolerance
Jacobi drift
accepted/rejected steps
```

Tightening tolerances must not materially change the family/topology.

## Scope freeze for Phase 1

Do not implement yet unless explicitly requested after the halo milestone passes:

- NRHO
- Lissajous
- 3D free launch
- 3D manual burns
- 3D targeting
- 3D zero-velocity isosurface
- invariant manifolds

The goal is to prove real spatial dynamics with the smallest trustworthy milestone.
