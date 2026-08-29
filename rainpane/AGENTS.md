# AGENTS.md — Rainpane

## Purpose

Rainpane is a touch-friendly browser simulation of rain striking and running down a pane of glass.

The experience is atmospheric rather than game-like. A scene sits behind a virtual pane; rain impacts the pane, spreads, pins, coalesces, forms rivulets, and drains under gravity. Layered rain audio completes the ambience.

Primary targets:

- iPhone
- iPad / iPad mini
- modern Android phones/tablets when practical
- desktop browsers as fallback

Static GitHub Pages. No backend.

---

## Read this before editing physics

Do not treat Rainpane as a particle-effects demo. The water layer is a coupled interfacial-flow simulation.

Before modifying rain impact, surface water, pinning, merging, rivulets, or water rendering, read the research hierarchy below and `SPEC.md`.

### Canonical research hierarchy

#### Tier A — continuous surface water / merging

1. **Ruyer-Quil, Bresch, Gisclon, Richard, Kessar & Cellier (2023), “Sliding and merging of strongly sheared droplets,” Journal of Fluid Mechanics 972, A40. DOI: 10.1017/jfm.2023.726.**
   - Uses an augmented shallow-water formulation with surface tension/full curvature, viscous effects, a capillary variable, and disjoining-pressure/contact-angle hysteresis.
   - Models displacement and merging of droplets as a continuum rather than as circles that only merge on overlap.
   - Its forcing is gas shear, not gravity-driven rain-on-glass. Reuse the interfacial/capillary/hysteresis/merging ideas; replace the forcing with the physical gravity and impact terms appropriate to Rainpane.

2. **Chen, Chen & Wong (2013), “A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.**
   - Directly targets glass panes.
   - Combines particles/fronts with a height map.
   - Uses an ID map for efficient drop/flow merging.
   - Preserves residual droplets/water after flow passes.
   - This is the primary realtime architecture reference.

#### Tier B — impact, shape, pinning, sliding

3. **Goto, Tanaka & Sagawa (2009), “Real-Time Rendering of Flow of Water Drops on a Windshield,” IEEJ Transactions on Electronics, Information and Systems 129(12), 2152–2158. DOI: 10.1541/ieejeiss.129.2152.**
   - Grid for irregular glass-surface motion.
   - 2D metaballs for realistic drop shape and fusion/separation.
   - Particles for thin water near a wiper.
   - Important lesson: use different representations for bulk drops versus thin streaks; do not force one primitive to represent every scale.

4. **Ahmed, Sellier, Jermy & Taylor (2014), “Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces,” European Journal of Mechanics B/Fluids 48, 218–230. DOI: 10.1016/j.euromechflu.2014.06.003.**
   - Advancing/receding contact angles and hysteresis materially affect depinning and terminal velocity.
   - Rainpane should model start/stop hysteresis, not one radius threshold.

5. **Šikalo, Tropea & Ganić (2005), “Impact of droplets onto inclined surfaces,” Journal of Colloid and Interface Science 286, 661–669.**
   - Experimental regimes for deposition/rebound on smooth/rough glass and other surfaces.
   - Impact behavior depends on normal impact component, Weber/Reynolds numbers, inclination, and wettability.

6. **Droplet Impact and Spreading on Inclined Surfaces, Langmuir 37(46), 2021, 13737–13745. DOI: 10.1021/acs.langmuir.1c02457.**
   - Post-impact spreading has distinct stages: early inertia-dominated spreading, followed by pinning/retraction when surface forces dominate.
   - Use this to avoid instant conversion from impact to a static circular bead.

#### Tier C — rainfall statistics and airborne visual rain

7. **Marshall & Palmer (1948), “The distribution of raindrops with size,” Journal of Meteorology 5, 165–166.**
   - Canonical exponential drop-size distribution as a function of rainfall rate.
   - Use as a statistical prior for drizzle/light/moderate/heavy rain rather than treating intensity as only spawn frequency.
   - Exact meteorological fidelity is optional, but rain intensity must change both count and size spectrum.

8. **Garg & Nayar (2006), “Photorealistic Rendering of Rain Streaks,” ACM Transactions on Graphics 25(3), 996–1002 / SIGGRAPH 2006. DOI: 10.1145/1141911.1141985.**
   - Falling drops oscillate and generate complex motion-blurred streak brightness through reflection/refraction.
   - Relevant only to airborne/distant rain outside the glass, not the glass-surface runoff solver.

### Reference priority rule

When references disagree or operate at different scales:

- prefer the more physical continuum result for qualitative dynamics,
- preserve Chen-style realtime state/connectivity where a full PDE solve is unnecessary,
- use impact papers to initialize post-impact state,
- use Marshall–Palmer only for incoming-rain statistics,
- use Garg–Nayar only for airborne appearance.

Do not copy a forcing term from a paper whose physical forcing differs from Rainpane.

---

## Product principles

1. **Physics is the feature.** Rain is not a looping sprite sheet.
2. **The glass is a continuous simulation surface.** Water belongs to a field/body, not a list of unrelated marbles.
3. **Mass is conserved approximately.** Impact adds mass; merge combines mass; runoff redistributes mass; residual film removes mass from a mobile head but not from the system.
4. **Coalescence is topological.** Head-head, head-body, and body-body contact can all merge flows.
5. **Impact has a transient.** A drop spreads/deforms first; it does not appear as an already-relaxed perfect circle.
6. **Pinning has hysteresis.** Starting motion and continuing motion are different states.
7. **Runoff evolves downstream.** A moving rivulet should collect water, widen, and generally move more readily as mass increases.
8. **Multiple water scales need multiple representations.** Thin film, pinned bead, bulk drop, and rivulet do not have to share one primitive.
9. **Rain intensity changes the entire system.** Count, size distribution, impact energy, surface coverage, runoff density, and sound all respond.
10. **Rendering derives from water geometry.** Optical distortion and highlights are consequences of the water state.
11. **Audio is part of the simulation.** It is layered and event-reactive.
12. **Privacy is strict.** Local photos/camera remain local; no capture/upload/recording.

---

## Required physics state

The implementation may use WebGL/WebGPU/Canvas/typed arrays, but conceptually maintain these quantities.

### Surface continuum

- `h(x,y)` or `water[x,y]` — free-liquid thickness / unresolved water film.
- `u(x,y), v(x,y)` or an equivalent flux/momentum representation where water is mobile.
- `wet(x,y)` — longer-lived wetted-surface/contact-line memory.
- `flowId(x,y)` or connected-component ownership for broad-phase topology/merge handling if the continuum representation does not already provide connectivity naturally.
- `pinning(x,y)` — stable low-amplitude surface heterogeneity/contact-line resistance.

### Macroscopic objects, if used

A hybrid solver may retain active heads/fronts for efficiency, but they are proxies for connected liquid bodies. A head must carry mass and connectivity, not behave as an isolated sprite.

### Recommended hybrid strategy

Use a continuum height/film representation everywhere, with adaptive/macroscopic structures for the thickest drops and runoff fronts. This is closer to Chen + Ruyer-Quil than a pure particle cloud.

---

## Incoming rain model

Incoming rain has two distinct visual/physical domains:

### A. Airborne rain outside the pane

This is an optical ambience layer. Use Garg–Nayar-inspired variation in streak length, brightness, oscillation, view/light dependence, and motion blur when useful.

Airborne streaks must not be mistaken for glass-surface runoff.

### B. Impacts on the pane

Each impact has at least:

- position
- diameter/mass
- normal velocity component
- tangential velocity component if wind/oblique rain is enabled
- impact time

Rain intensity determines a stochastic drop-size distribution. Use a Marshall–Palmer-style exponential distribution as a baseline prior and tune perceptually.

Do not use one fixed drop radius for all rain.

---

## Impact response

Impact response is staged.

1. **Contact / inertial spreading**
   - rapid local spread
   - asymmetric spread for oblique impact
   - temporary deformation/oscillation

2. **Surface-force takeover**
   - rim/contact line slows
   - some edges pin
   - some liquid retracts toward a bead/body

3. **Relaxed attached state**
   - pinned bead, thin film, local ridge, or connection to existing water

4. **Possible immediate join**
   - if impact hits existing film/rivulet, it feeds that connected body rather than creating an independent bead.

Full splash/breakup can be deferred, but impact cannot be visually instantaneous.

---

## Contact angle / pinning contract

Do not implement:

```text
if radius > threshold: move
```

Use a hysteretic state with advancing/receding behavior. Conceptually:

```text
drive = gravity_along_glass * mobile_mass + transient_impact_momentum
resistance = contact_line_resistance(local_surface, footprint, wetness)

pinned -> moving only when drive > depin_threshold
moving -> pinned only when drive < repin_threshold
```

with `depin_threshold > repin_threshold` to create hysteresis.

Wet trails should generally reduce resistance.

---

## Coalescence / merging contract

This is a hard requirement.

### Merge modes

- head-head
- head-body
- body-body
- impact-body

### Physics expectations

When two connected liquid regions touch:

- establish a neck/bridge rather than teleporting instantly into one circle,
- transfer mass continuously,
- damp capillary oscillation over time,
- conserve mass approximately,
- conserve momentum approximately when meaningful,
- resolve to one connected body/front when appropriate.

The 2023 JFM paper is the qualitative reference for continuum merging; Chen's ID map is the practical realtime reference for topology.

Two parallel rivulets that come into contact must not continue forever as unrelated lines.

---

## Rivulet contract

A rivulet is a connected thickness field/body, not a drawn stroke.

It should:

- have variable width,
- thicken after collecting impact water or beads,
- thin where water is depleted,
- retain a wet residual path,
- bend mildly because of surface heterogeneity/contact-line pinning,
- merge with neighboring rivulets,
- exhibit a thicker mobile front/head when appropriate.

Downstream behavior must emerge from mass flux, not a hardcoded “bigger lower on screen” visual trick.

---

## Gravity

Reuse the field-tested Fog Mirror DeviceMotion mapping. Do not redesign it during Rainpane development unless a real-device regression is demonstrated.

Golden behavior:

- upright -> down
- right edge physically down -> right
- left edge physically down -> left
- nearly flat -> small in-plane gravity

Use `DeviceMotionEvent.accelerationIncludingGravity` with the known-good low-pass mapping from Fog Mirror. Do not add a second screen-orientation rotation without device evidence.

---

## Rendering contract

The scene/background is separate from water physics.

Preferred pipeline:

1. background image / camera / built-in scene
2. airborne rain layer
3. water-thickness normal generation
4. refraction/distortion of background through glass water
5. meniscus/contact-line shading
6. partial Fresnel/specular highlights
7. subtle motion/deformation for active impacts and coalescence
8. UI

### Do not render

- full gray/white outlines around every drop
- black “trails” disconnected from thickness
- identical circular sprites
- parallel same-width runoff lines

### Macroscopic shape

Metaballs/SDF/implicit surfaces are acceptable for thick-water shape reconstruction if driven by physical mass/connectivity. Goto 2009 is the reference for hybrid metaball/particle scale separation.

---

## Scene modes and privacy

Modes:

1. built-in scene
2. local user image
3. optional live camera

Local images remain local. Camera requires explicit permission, view only, no capture, no recording, no upload, stop tracks on hide/exit.

---

## Rain intensity

Expose a simple perceptual control, but internally map it to physical/statistical parameters.

Intensity changes at least:

- total mass flux to glass
- impact event rate
- incoming diameter distribution
- impact velocity distribution or impact-energy proxy
- pane wet fraction
- probability of connected runoff
- airborne streak density
- impact-audio density
- ambient-rain spectrum/loudness

Do not implement intensity as only `spawnRate`.

---

## Audio architecture

At minimum:

1. ambient exterior rain bed
2. discrete/clustered glass-impact events
3. heavier runoff/storm texture

Optional:

- wind
- lightning/thunder
- room/interior ambience

Impact audio should be statistically coupled to impact events or the same intensity process, not scheduled independently with no relationship to the visual rain.

No microphone is needed.

---

## Performance philosophy

Do not prematurely simplify physics solely because a paper is from 2023 or because a PDE sounds expensive. Current iPhone/iPad hardware is the target; measure first.

Allowed optimizations after profiling:

- lower-resolution film grid
- semi-Lagrangian/advection approximations where visually acceptable
- compute/WebGL ping-pong textures
- spatial tiling / active-region updates
- adaptive timestep
- hybrid thick-drop implicit representation
- reduced solver iterations outside active regions

Never replace a correct merge/topology model with unrelated particles merely to gain FPS without measurement.

Target 60 fps when practical; stable 30 fps under storm load is acceptable.

---

## Suggested module structure

```text
rainpane/
  index.html
  styles.css
  AGENTS.md
  SPEC.md
  src/
    app.js
    scene.js
    rain.js
    impact.js
    surface.js
    flows.js
    gravity.js
    render.js
    audio.js
```

- `rain.js` — rainfall process / Marshall–Palmer-style sampling / airborne events
- `impact.js` — impact spreading/deformation/deposition initialization
- `surface.js` — thickness, momentum/flux, wetness, pinning, topology maps
- `flows.js` — optional macroscopic connected bodies/fronts, merge bookkeeping
- `gravity.js` — copied/adapted known-good Fog Mirror mapping only
- `render.js` — normals/refraction/implicit-surface shading
- `audio.js` — layered/event-coupled rain sound

---

## Acceptance invariants

A build is not acceptable if any of these are false:

1. Drizzle and storm differ in drop-size spectrum as well as count.
2. An impact visibly spreads/deforms before relaxing.
3. Small beads can pin.
4. Depinning/repinning exhibits hysteresis.
5. Water mass is approximately conserved across collection and merge.
6. A descending body grows when it intercepts water.
7. Two contacting beads merge through a bridge/continuous transition.
8. Two contacting rivulets become one connected flow.
9. Connected water has variable width/thickness.
10. Trails contain residual simulated water.
11. Later runoff can reuse wet trails.
12. Device gravity follows the proven mapping.
13. Airborne rain and glass runoff are visibly different systems.
14. Water optics come from geometry/thickness, not cartoon outlines.
15. User media never leaves the device.

---

## Non-goals for first playable build

These can wait unless they fall out naturally from the solver:

- atomistic contact-line physics
- fully resolved 3D Navier–Stokes/VOF for every impact
- physically exact splash fragmentation
- weather API integration
- meteorological certification
- multiplayer

The goal is a physically coherent, perceptually convincing rain-on-glass simulation.