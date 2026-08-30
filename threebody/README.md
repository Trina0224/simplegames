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

`AGENTS.md` makes an Earth–Moon horseshoe a first-class acceptance target, and
forbids drawing one that did not come out of the equations. **Searching for one
did not find it, and the reason appears to be physical.**

About three thousand initial conditions were tried across two families —
perpendicular x-axis crossings at fixed Jacobi constant, and co-orbital guiding
centres released at the far side — spanning the whole energy window between
C(L4) = 2.98800 and C(L3) = 3.01215. Every one either reached the Moon's
longitude and circulated, impacted, or left the domain. Not one librated about
180°.

The decisive test was to run the same code at mass ratios where horseshoes are
known to exist:

| system | mass ratio | result | Jacobi drift |
|---|---|---|---|
| Saturn–Janus-ish | 1e-8 | horseshoe, 327° libration | 1.3e-15 |
| Sun–Earth-ish | 3e-6 | horseshoe, 327° | 3.6e-15 |
| Sun–Jupiter-ish | 9.5e-4 | horseshoe, 315° | 8.7e-12 |
| — | 2.0e-3 | horseshoe, 323° | |
| — | 3.0e-3 | **none** | |
| **Earth–Moon** | **1.215e-2** | **none**, full circulation | 5.0e-4 |

The family disappears between mass ratios of 2e-3 and 3e-3. Earth–Moon sits five
times above that boundary. The mechanism is visible in the numbers: the
co-orbital energy window admits radial excursions of at most 0.127 DU, and a
horseshoe at this mass ratio would have to turn round further from the Moon than
that window allows, so instead of reversing it runs into the Moon's vicinity and
is scattered — which is what the 5e-4 Jacobi drift in the last row is, a close
encounter the integrator had to work through.

### How strong this claim is

Not a proof of non-existence. It is an exhaustive search of two initial-condition
families, and the guiding-centre guess those families rest on gets worse as the
mass ratio grows — precisely where the answer changed. A horseshoe at this mass
ratio, if one exists, would be strongly unstable, and an unstable family is a
measure-zero set that no grid ever lands on. It has to be *corrected* into
existence, not stumbled upon.

So the next step is not more searching. It is continuation: take the horseshoe
that does exist at 2e-3, correct it to a genuinely periodic orbit, then walk the
mass ratio up in small steps, re-correcting at each one, and watch either the
family arrive at Earth–Moon or terminate somewhere on the way. `correctSymmetric`
in `trajectory.js` is the corrector that does this; what it still needs is the
continuation loop and a reliable way to identify which axis crossing closes the
orbit.

Either outcome is a good result. If the family survives, there is a real
Earth–Moon horseshoe to ship. If it terminates, the app has something better than
a preset: a demonstration of *why* the Moon is too heavy for one, which is a more
interesting thing to learn than that the path is U-shaped.

## Next

1. Continuation in mass ratio to settle the horseshoe.
2. Frames, zero-velocity curves, burns and targeting — the corrector above is
   already the machinery targeting needs.
3. The application: renderer, worker, presets, controls.
