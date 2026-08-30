# Threebody — Earth–Moon CR3BP

An interactive Earth–Moon three-body sandbox. This is the numerical core: the
equations, the equilibria, the integrator and the propagator, with the
validation suite that the specification makes a condition of claiming physical
fidelity. **There is no application yet** — the specs are emphatic that the 2D
solver must be trustworthy before anything is built on it, and this is that
part.

The design requirements are external and are not authored here:
[`SPEC.md`](SPEC.md), [`AGENTS.md`](AGENTS.md), [`RESEARCH.md`](RESEARCH.md).

```sh
node --experimental-default-type=module threebody/tools/validate.mjs
```

## What is here

| file | what it owns |
|---|---|
| `src/constants.js` | the Earth–Moon system and every unit conversion |
| `src/cr3bp.js` | the equations of motion, the effective potential, the Jacobi constant |
| `src/lagrange.js` | the five equilibria, solved, with their linear character |
| `src/integrator.js` | adaptive Dormand–Prince 5(4) with dense output |
| `src/trajectory.js` | propagation, event detection, symmetric-orbit correction |
| `tools/validate.mjs` | the suite below |

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

## Next

1. Frames, zero-velocity curves, burns and targeting. `correctAtEnergy` is
   already the shooting machinery targeting needs.
2. The application: renderer, worker, controls.
3. Family continuation in C, so the horseshoe becomes a slider rather than two
   fixed members.
