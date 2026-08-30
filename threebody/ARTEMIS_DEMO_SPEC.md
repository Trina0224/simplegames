# Threebody — Artemis Demo Specification

## Purpose

This document defines an **Artemis demo layer inside the existing Threebody 3D mode**. It is not a separate application and it must not replace or weaken the existing Earth–Moon CR3BP validation work.

The goal is to connect the abstract 3D libration-point dynamics already implemented in `threebody/` to real, recognizable Artemis-era concepts such as Gateway, NRHO, CAPSTONE, Orion rendezvous, and lunar-surface access.

These demos are educational representations built on the existing Earth–Moon CR3BP model. They must remain explicit about what is modeled exactly, what is a CR3BP approximation, and what is only a mission-context overlay.

---

## Integration with the existing UI

Do not create a second app.

Add Artemis entries to the existing 3D preset selector, clearly labeled so a user can distinguish mathematical orbit-family presets from mission-context demos.

Suggested grouping:

```text
3D CR3BP
  L1 Halo
  L2 Halo

Artemis demos
  Artemis — Gateway-like NRHO
  Artemis — CAPSTONE NRHO
  Artemis — Low lunar orbit vs NRHO
  Artemis — Orion to Gateway rendezvous concept
```

The exact HTML grouping may use `<optgroup>` or equivalent styling, but the words `Artemis` and the demo identity should remain visible.

Switching into an Artemis demo must not silently alter the underlying physics model.

---

## Current public-program context

As of 2026, NASA describes Gateway as a lunar space station intended to operate in a **near-rectilinear halo orbit (NRHO)** around the Moon. NASA states that Gateway's NRHO completes one orbit in about **6.5 days**, with an approximate closest lunar distance of **1,500 km (1,000 miles)** and farthest distance of about **70,000 km (43,500 miles)**.

NASA's current Artemis architecture also places the 2027 Artemis III mission in low Earth orbit as a rendezvous/docking demonstration, with Artemis IV targeted as the first subsequent crewed lunar-surface mission. Therefore, do not present outdated text implying that Artemis III itself is currently planned as the next lunar landing mission.

Program facts are labels/context, not inputs to the CR3BP equations.

---

# Demo A — Artemis: Gateway-like NRHO

## Goal

Give a general user an immediate answer to:

> Why would NASA put a lunar space station on a strange 3D orbit instead of simply circling close to the Moon?

## Required behavior

Use a **numerically corrected Earth–Moon CR3BP NRHO-family member**, not a hand-drawn elongated loop.

The demo should clearly show:

- the Moon,
- Earth direction / Earth–Moon line,
- the NRHO trajectory in 3D,
- the `z=0` reference plane,
- closest and farthest lunar passages,
- orbital period,
- current spacecraft position,
- optional ground-track / plane projection already used by the 3D renderer.

Suggested label:

```text
Artemis — Gateway-like NRHO
```

Suggested concise explanation:

```text
Gateway is planned for a near-rectilinear halo orbit rather than a low circular lunar orbit. The orbit repeatedly passes relatively close to the Moon, then travels far into cislunar space while remaining in the Earth–Moon three-body geometry.
```

## Numerical requirement

A Gateway-like preset must come from continuation/correction of the actual spatial CR3BP orbit family.

Do not tune a curve visually to NASA's published closest/farthest distances.

Where possible, choose a family member whose dimensionalized geometry and period are reasonably representative of Gateway-class NRHO values, then report the actual values produced by the simulator.

If the CR3BP member differs from current operational Gateway design values, display both clearly:

```text
simulated CR3BP member: ...
NASA Gateway reference: ~6.5 d, ~1,500 km / ~70,000 km from Moon
```

Never overwrite a simulated result with a NASA reference value merely to make the numbers match.

---

# Demo B — Artemis: CAPSTONE NRHO

## Goal

Connect the simulation to a spacecraft that has actually flown in lunar NRHO.

CAPSTONE is especially valuable as a demo because it makes NRHO concrete: this is not merely a theoretical family proposed for Gateway.

## Required behavior

Suggested preset label:

```text
Artemis — CAPSTONE NRHO
```

Use either:

1. a validated CR3BP NRHO member selected to approximate the published CAPSTONE orbit geometry, or
2. if a trustworthy published state is incorporated later, a documented reference-state propagation with an explicit model disclaimer.

For the first version, option 1 is preferred because it stays inside the current CR3BP architecture.

Display context:

```text
CAPSTONE tested operations and navigation in the NRHO family planned for Gateway.
NASA reference geometry is roughly 1,000 miles at near pass and 43,500 miles at far pass, with a cycle of about 6.5 days.
```

Do not claim the CR3BP preset is CAPSTONE's precise flight ephemeris.

Required wording if using the family approximation:

```text
CAPSTONE-like CR3BP demonstration — not reconstructed flight ephemeris
```

---

# Demo C — Artemis: Low Lunar Orbit vs NRHO

## Goal

This should be the most immediately understandable comparison demo.

Show why `lunar orbit` is not one single thing.

A user should be able to compare:

- a conventional low circular/near-circular lunar orbit concept,
- a Gateway-like NRHO.

## Presentation

Suggested selector label:

```text
Artemis — Low lunar orbit vs NRHO
```

Prefer a toggle or side-by-side/overlay comparison in the same 3D scene.

Required visual differences:

### Low lunar orbit

- remains close to Moon,
- nearly circular for the teaching illustration,
- much shorter orbital period,
- visually reads as an ordinary Moon-centered orbit.

### NRHO

- highly elongated in Moon-relative distance,
- leaves the immediate lunar neighborhood,
- strongly 3D / libration-point-family geometry,
- period around several days for Gateway-class members.

## Physics labeling

Do not imply that the low lunar orbit and NRHO are produced by the same approximation if they are not.

If the low lunar orbit is generated with a simple Moon-centered two-body comparison rather than full CR3BP propagation, label it explicitly:

```text
comparison orbit — Moon-centered two-body illustration
```

Better, if practical, initialize it in the Earth–Moon CR3BP and propagate it through the same integrator so the comparison remains under one model.

The purpose is comprehension, not mission optimization.

---

# Demo D — Artemis: Orion to Gateway rendezvous concept

## Goal

Explain what `reach Gateway` actually means without turning Threebody into a complete Artemis mission simulator.

Suggested label:

```text
Artemis — Orion to Gateway rendezvous concept
```

## Scope

This is a **concept demonstration**, not a reconstruction of an Artemis IV operational trajectory.

It may show:

1. Orion represented at an initial cislunar state,
2. Gateway moving on the selected NRHO,
3. a planned approach/rendezvous trajectory,
4. arrival at a chosen rendezvous condition near Gateway.

The point is that Gateway itself is moving on a 3D orbit, so the destination is a **state in motion**, not a fixed point in space.

## Required targeting semantics

Do not target a frozen marker.

The terminal condition must compare the spacecraft state with Gateway's state at the same future time.

At minimum expose:

```text
relative position at arrival
relative speed at arrival
time of flight
Delta-v if a burn is solved
```

A position-only intercept is not a rendezvous.

If the current targeting implementation cannot constrain relative velocity, label the first version:

```text
intercept concept — rendezvous velocity matching not yet implemented
```

Do not call it docking until relative-state conditions support that term.

---

# Optional Demo E — Why Gateway is not "parked at L2"

This is a lightweight educational toggle and may be folded into Demo A rather than exposed as a separate preset.

Show simultaneously:

- L1,
- L2,
- the Moon,
- the Gateway-like NRHO.

Concise explanation:

```text
Gateway is not sitting on the mathematical L2 point. NRHO is a three-dimensional periodic family associated with the Earth–Moon libration-point region.
```

This is particularly useful because many users hear "L2" and imagine a stationary parking point.

---

# Optional Demo F — NRHO close pass / far pass

If the camera and time controls make it useful, add two one-tap viewpoints:

```text
Near pass
Far pass
```

They should seek or highlight the actual extrema measured from the selected simulated trajectory rather than predetermined timestamps.

Display:

```text
distance from Moon
current 3D state
elapsed orbit phase
```

This makes the near-rectilinear character much easier to understand than watching an entire orbit at uniform speed.

---

# Artemis context overlays

Artemis labels must be concise and removable so the simulator remains a physics toy rather than becoming a mission slide deck.

Useful annotations:

- `Gateway` marker on Gateway-like NRHO
- `CAPSTONE-like` marker/preset
- `Moon South Pole` orientation cue if it can be represented honestly in the simplified coordinate model
- near-pass / far-pass distance labels
- approximate NASA reference period

Avoid:

- decorative SLS launch sequences,
- Earth atmospheric launch simulation,
- lunar landing animation,
- astronaut animation,
- mission timelines unrelated to the orbital dynamics on screen.

---

# Model honesty

The existing Threebody app uses the ideal Earth–Moon CR3BP.

Real Artemis navigation and Gateway operations use substantially higher-fidelity models, including ephemeris motion and perturbations that are outside this toy.

Every Artemis demo must preserve this distinction.

Recommended small disclaimer:

```text
Earth–Moon CR3BP educational model; mission context is real, trajectory is not an operational ephemeris.
```

Do not add Sun gravity, lunar harmonics, station keeping, finite burns, spacecraft mass, or operational navigation merely to make an Artemis label more realistic. Those would be a later model layer and require separate validation.

---

# 3D integration contract

Artemis presets live inside the current validated 3D subsystem.

They must obey `THREE_D_AGENT.md`, `THREE_D_SPEC.md`, and `THREE_D_RESEARCH.md`.

In particular:

- 3D state is `[x,y,z,vx,vy,vz]`,
- trajectory is numerically integrated,
- halo/NRHO family members are produced by correction/continuation,
- no hand-authored mission curves,
- frame changes do not change the underlying state history,
- 2D baseline remains unaffected,
- Jacobi drift and closure remain measurable.

---

# Proposed implementation order

## Phase A — NRHO family capability

1. Continue the existing L1/L2 halo machinery toward near-rectilinear members.
2. Establish a numerically validated NRHO member.
3. Measure period, closure, Jacobi drift, minimum Moon distance and maximum Moon distance.
4. Add regression tests for the selected canonical member.

Do not build the Artemis UI before a valid NRHO exists.

## Phase B — Gateway-like demo

5. Add `Artemis — Gateway-like NRHO` to the 3D preset selector.
6. Add near/far pass metrics and reference annotations.
7. Verify all camera modes and playback.

## Phase C — CAPSTONE context

8. Add a CAPSTONE-like preset or reuse the validated family member with a separate explanatory context if the geometry is sufficiently representative.
9. Label approximation vs flight ephemeris explicitly.

## Phase D — comparison

10. Add `Low lunar orbit vs NRHO` comparison.
11. Keep comparison rendering and model provenance explicit.

## Phase E — rendezvous concept

12. Only after moving-target state targeting is available, add Orion-to-Gateway intercept/rendezvous demonstration.
13. Distinguish intercept from true rendezvous by relative velocity.

---

# Acceptance tests

An Artemis demo build is acceptable only if all applicable statements are true:

1. `Gateway-like NRHO` is a real corrected/continued spatial CR3BP trajectory.
2. Its path is not a visually elongated halo drawn to resemble NASA diagrams.
3. Reported period and Moon distances are measured from the simulated trajectory.
4. NASA reference values are visibly distinguished from simulation values.
5. CAPSTONE demo does not claim to reproduce its real flight ephemeris unless actual ephemeris data is explicitly incorporated and documented.
6. NRHO remains the same physical orbit under camera/view changes.
7. Jacobi drift remains inside the established numerical budget.
8. Low-lunar-orbit comparison is clearly labeled by the model used to generate it.
9. Orion/Gateway targeting, when added, targets Gateway's future moving state rather than its current/frozen position.
10. A demo cannot be labeled `rendezvous` if only position is matched and relative velocity is unconstrained.
11. Artemis labels/context can be removed without changing the underlying physics.
12. Existing L1/L2 halo and 2D presets remain numerically unchanged except for deliberate versioning/import changes.

---

# Public reference facts used for the demo

Current NASA public material describes:

- Gateway as a lunar space station planned for near-rectilinear halo orbit.
- Gateway NRHO period: approximately 6.5 days.
- Gateway lunar distance: approximately 1,500 km at closest approach and 70,000 km at farthest.
- CAPSTONE as an NRHO pathfinder supporting Gateway/Artemis operations and navigation understanding.
- Artemis III (2027) as a low-Earth-orbit rendezvous/docking demonstration under NASA's current architecture.
- Artemis IV as the subsequent planned first crewed lunar-surface mission under that current architecture.

Because Artemis architecture and dates can change, mission-number/date text is context metadata and should be easy to update without changing orbit code.

Primary public sources for those contextual facts:

- NASA Gateway FAQ / Gateway mission pages
- NASA CAPSTONE mission page
- NASA Artemis campaign and Artemis III 2026 updates

The physics implementation must not depend on those web pages at runtime.
