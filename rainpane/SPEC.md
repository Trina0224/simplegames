# Rainpane — Product & Physics Specification

## 1. Product summary

Rainpane is a browser-based rain-on-glass ambience simulator.

A selected scene sits behind a virtual pane of glass. Rain exists in two domains:

1. airborne rain outside the pane,
2. water physically attached to and flowing across the pane.

The user can move continuously from drizzle to storm. Rain intensity changes incoming drop statistics, impact behavior, surface coverage, runoff topology, airborne streak density, and layered sound.

The experience is successful when a user can simply leave it running and enjoy watching the pane evolve.

---

## 2. Research basis

Rainpane does not use one paper as a complete recipe. The implementation combines the strongest parts of several well-established models.

### 2.1 Continuum sliding and merging — primary physical reference

**C. Ruyer-Quil, D. Bresch, M. Gisclon, G. L. Richard, M. Kessar, N. Cellier (2023), “Sliding and merging of strongly sheared droplets,” Journal of Fluid Mechanics 972, A40. DOI: 10.1017/jfm.2023.726.**

Key concepts to adopt:

- shallow-water/thin-layer evolution rather than independent circular particles,
- conserved liquid thickness and momentum-like quantities,
- capillary effects using a formulation that can retain full-curvature behavior,
- disjoining-pressure/contact-angle hysteresis,
- continuum coalescence and merger of neighboring droplets,
- advancing/receding contact-line state influenced by local mass accumulation/reduction.

Important adaptation:

The paper studies droplets driven by gas shear. Rainpane is primarily gravity-driven after impact. Do not copy the shear forcing term. Retain the continuum capillary/hysteresis/merge framework and use Rainpane’s gravity, impact momentum, wetting, and surface forces.

### 2.2 Realtime glass-water architecture — primary engineering reference

**K.-C. Chen, P.-S. Chen, S.-K. Wong (2013), “A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.**

Adoptable concepts:

- height map for glass-surface water,
- moving particles/fronts only where useful,
- ID map / connectivity mechanism for merging water drops and flows,
- residual water left after flow passes,
- smoothing/erosion-style operations for plausible evolving shape,
- realtime focus specifically on glass panes.

This paper is especially useful for deciding what can be represented at grid level and what benefits from explicit flow objects.

### 2.3 Multiscale shape representation

**Y. Goto, T. Tanaka, Y. Sagawa (2009), “Real-Time Rendering of Flow of Water Drops on a Windshield,” IEEJ Transactions on Electronics, Information and Systems 129(12), 2152–2158. DOI: 10.1541/ieejeiss.129.2152.**

Adoptable concepts:

- grid-based irregular movement on glass,
- 2D metaballs/implicit shapes for thick drops,
- fusion and separation through implicit geometry,
- separate representation for thin water/streaks,
- hybrid methods across scales rather than one primitive for all water.

### 2.4 Contact-angle hysteresis and sliding velocity

**G. Ahmed, M. Sellier, M. Jermy, M. Taylor (2014), “Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces,” European Journal of Mechanics B/Fluids 48, 218–230. DOI: 10.1016/j.euromechflu.2014.06.003.**

Adoptable concepts:

- different advancing and receding contact angles,
- hysteresis resists gravity-driven motion,
- start/stop behavior is not represented by one radius threshold,
- hysteresis materially changes predicted terminal velocity,
- center-of-mass motion is a useful measure of sliding speed.

### 2.5 Impact on inclined glass/surfaces

**Š. Šikalo, C. Tropea, E. N. Ganić (2005), “Impact of droplets onto inclined surfaces,” Journal of Colloid and Interface Science 286, 661–669.**

Relevant observations:

- impact regime depends on normal velocity component, Weber/Reynolds numbers, surface wettability, roughness, and inclination,
- smooth glass is explicitly represented in the experiments,
- deposition, rebound and partial rebound occupy different regimes.

**“Droplet Impact and Spreading on Inclined Surfaces,” Langmuir 37(46), 2021, 13737–13745. DOI: 10.1021/acs.langmuir.1c02457.**

Relevant observations:

- post-impact spreading evolves through stages,
- the earliest spreading is inertia-dominated and approximately radial,
- later upstream/contact-line behavior becomes controlled by pinning/retraction/surface forces,
- inclined impact becomes asymmetric.

### 2.6 Rainfall size statistics

**J. S. Marshall, W. McK. Palmer (1948), “The distribution of raindrops with size,” Journal of Meteorology 5, 165–166.**

Use a Marshall–Palmer-style exponential size distribution as the default statistical prior:

```text
N(D) = N0 exp(-Lambda D)
Lambda ≈ 4.1 R^-0.21 mm^-1
```

where `R` is rainfall rate in mm/h in the classic form.

Rainpane may tune the range perceptually, but intensity must change both event rate and diameter distribution. Drizzle is not merely “storm with fewer particles.”

### 2.7 Airborne rain appearance

**K. Garg, S. K. Nayar (2006), “Photorealistic Rendering of Rain Streaks,” ACM Transactions on Graphics 25(3), 996–1002 / SIGGRAPH 2006. DOI: 10.1145/1141911.1141985.**

Relevant observations:

- falling drops oscillate in shape,
- reflection/refraction through oscillating drops produces nonuniform streak brightness,
- motion-blurred streaks can contain speckles, smeared highlights and curved brightness contours,
- appearance depends on view and light direction.

Use this only for airborne/distant rain. Do not apply rain-streak rendering rules to water attached to the glass.

---

## 3. Core product modes

### 3.1 Scene source

Support:

1. built-in scene,
2. user-selected local image,
3. optional live camera.

The glass solver must be independent of scene source.

### 3.2 Rain control

Expose a continuous control with semantic anchors:

```text
Dry — Drizzle — Light — Rain — Heavy — Storm
```

Internally map this to a rainfall-rate-like parameter `R` controlling mass flux and size spectrum.

### 3.3 Sound

Sound is optional but first-class:

- ambient rain bed,
- glass-impact events,
- heavy runoff/storm bed,
- optional thunder/wind later.

---

## 4. Simulation domains

Rainpane separates three coupled but distinct systems.

### Domain A — airborne rain

Purpose:

- distant visual atmosphere,
- some incoming impacts on the pane,
- no direct representation of attached runoff.

State may include stochastic streak events with depth/light-dependent appearance.

### Domain B — attached glass film

A 2D continuum state across the pane.

Minimum conceptual fields:

```text
h(x,y)       water thickness / free liquid
qx(x,y)      x-directed flux or momentum proxy
qy(x,y)      y-directed flux or momentum proxy
wet(x,y)     persistent wetted-surface memory
pin(x,y)     stable surface/contact-line heterogeneity
flowId(x,y)  optional topology/connectivity identifier
```

A solver does not have to use these exact variables, but must represent their physical roles.

### Domain C — thick drops and rivulets

Thick regions may be reconstructed directly from `h`, or represented by auxiliary connected objects/implicit surfaces for efficiency/rendering.

If explicit objects are used, they must remain coupled to the continuum and conserve mass with it.

---

## 5. Rainfall process

### 5.1 Diameter sampling

Use a Marshall–Palmer-style spectrum as baseline.

Qualitative expectations:

- drizzle: high proportion of very small drops, low total mass flux,
- moderate rain: broader distribution and more medium drops,
- storm: substantially larger total flux and more large impacts.

Clamp to perceptually useful browser-scale limits rather than simulating invisible aerosol droplets.

### 5.2 Impact rate

Choose event rate so integrated incoming mass approximates the requested rain intensity.

Do not independently choose event count and size without accounting for total mass flux.

### 5.3 Velocity

Incoming velocity may derive from a terminal-velocity approximation or a perceptual mapping from diameter. At minimum, larger incoming drops should generally deliver greater impact momentum.

Wind/oblique rain can later add a tangential component.

---

## 6. Impact lifecycle

Every significant impact follows a short physical lifecycle.

### Stage 1 — contact and rapid spreading

Duration is short but visible at close range.

- deposit mass,
- convert normal kinetic energy into radial/asymmetric spread,
- expand footprint rapidly,
- preserve tangential momentum for oblique impacts.

### Stage 2 — deformation / oscillation / retraction

- inertia decays,
- capillarity acts on curvature,
- footprint may retract,
- upstream/downstream edges may behave differently,
- local contact line begins to pin.

### Stage 3 — attached state

The impact settles into one of:

- tiny unresolved film deposit,
- pinned bead,
- enlarged neighboring bead,
- connected existing rivulet,
- less commonly, rebound/splash if implemented.

### Existing-water impact

If a raindrop lands on a wet film or flow, feed that connected liquid body. Do not create a separate bead merely because an impact event occurred.

---

## 7. Thin-film / shallow-water evolution

The preferred long-term direction is a GPU-friendly 2D thin-layer solver influenced by the 2023 JFM augmented shallow-water model rather than a pure particle system.

The exact discretization is an implementation choice. Required physical terms/concepts are:

- conservation of water mass,
- advection/flux of liquid thickness,
- gravity projected along the pane,
- viscous damping/friction,
- capillary pressure from surface curvature or a stable approximation,
- disjoining/wetting term near thin contact regions,
- contact-angle hysteresis / pinning,
- source term from rain impact,
- residual film rather than zero-thickness dry cuts behind every flow.

A full 3D Navier–Stokes/VOF solve is not required.

---

## 8. Pinning and contact-angle hysteresis

Rainpane needs two motion thresholds.

Conceptually:

```text
if pinned:
    move only if drive > depinThreshold
else:
    continue moving until drive < repinThreshold

where depinThreshold > repinThreshold
```

`drive` may include:

- gravity component along glass,
- accumulated mass,
- residual impact momentum.

Threshold/resistance depends on:

- advancing/receding contact-angle model,
- local pinning heterogeneity,
- wetness/history,
- footprint/contact-line length.

This is a qualitative approximation of contact-angle hysteresis, not dry friction pasted onto a particle.

---

## 9. Coalescence

Coalescence is a continuum event.

### 9.1 Initial bridge

When two liquid bodies touch:

- create a narrow connecting neck/bridge,
- let surface tension rapidly grow the connection,
- avoid instantaneous teleportation to one perfect circle.

### 9.2 Relaxation

After bridge growth:

- combined body oscillates/deforms briefly,
- viscosity/damping removes excess motion,
- mass remains approximately conserved.

### 9.3 Flow topology

Required join cases:

- bead-bead,
- bead-rivulet,
- rivulet-rivulet,
- impact-existing-body.

If explicit connectivity is needed, use a Chen-style flow-ID map or connected-component approach.

Two rivulets whose liquid regions touch must become one connected hydraulic body. They may still have temporary branches, but they are no longer independent lines.

---

## 10. Rivulet dynamics

A rivulet emerges from connected flowing film.

Required behavior:

- width varies with local flux/thickness,
- lower/downstream areas often become thicker after collection,
- neighboring impacts feed it,
- intercepted beads become part of it,
- branches can form and rejoin,
- residual film remains behind,
- wet history lowers future contact-line resistance,
- path can meander mildly due to surface heterogeneity,
- gravity remains dominant.

A runoff channel must never be implemented as a constant-width black spline.

---

## 11. Mass accounting

Approximate conservation is mandatory.

For the pane:

```text
M(t+dt) = M(t)
        + incoming_rain_mass
        - water_exiting_pane
        - optional_evaporation
```

Within the pane, moving mass between film/bead/rivulet representations must not create or destroy significant water.

Visual radius/width derives from thickness/mass, not arbitrary growth timers.

---

## 12. Gravity

Reuse the field-tested Fog Mirror gravity implementation as a frozen initial reference.

Known-good mobile behavior:

- upright -> down,
- right edge physically down -> right,
- left edge physically down -> left,
- near-flat -> weak in-plane gravity.

Use the proven `DeviceMotionEvent.accelerationIncludingGravity` low-pass mapping. Do not add a second orientation rotation unless a real-device test demonstrates a regression.

The surface solver receives a gravity vector projected along the glass and a magnitude representing in-plane strength.

---

## 13. Water geometry and rendering

### 13.1 Thickness-derived normals

Compute normals/gradients from `h(x,y)` for refraction and highlight response.

### 13.2 Thick drop reconstruction

For thick localized bodies, acceptable options include:

- implicit surface / metaball reconstruction,
- SDF from thickness components,
- smooth contour extraction from the height field.

Goto 2009 supports using implicit bulk-drop shapes while representing thin water differently.

### 13.3 Optical effects

Use:

- local refraction/distortion of background,
- partial Fresnel/specular highlights,
- darker/stronger meniscus near steep gradients,
- slight moving-drop elongation,
- transient coalescence deformation,
- continuous head-to-rivulet geometry.

Avoid:

- complete gray outlines,
- identical circular drops,
- opaque dark lines,
- render-only trails that have no simulated water.

---

## 14. Airborne rain rendering

Use Garg–Nayar-inspired behavior.

Airborne streaks should vary by:

- apparent length/exposure,
- brightness pattern,
- size/depth,
- lighting direction,
- drop oscillation phase,
- optional wind angle.

Do not render all airborne drops as identical straight white lines.

For built-in scenes without depth information, use a coarse layered depth approximation rather than pretending to know exact geometry.

---

## 15. Rain intensity mapping

One user-facing slider controls a coupled state.

For each intensity value determine:

- rainfall-rate proxy `R`,
- diameter distribution parameter,
- total incoming mass flux,
- event rate,
- velocity/impact-energy distribution,
- airborne density,
- probability of wet-film coverage,
- expected runoff-channel density,
- audio ambience intensity,
- glass-impact event density,
- optional storm/thunder probability.

Heavy rain should emerge naturally from more water, not from artificially spawning more long runoff lines.

---

## 16. Audio

### Layer A — exterior rain bed

Continuous broadband rain atmosphere.

### Layer B — impact audio

Close taps/patters tied statistically to simulated impacts. Larger impacts can bias toward slightly lower/stronger transient sounds.

### Layer C — runoff/storm texture

Appears progressively as surface water and rain intensity rise.

Optional:

- wind,
- thunder/lightning,
- interior room ambience.

Avoid obvious repeating short loops. Use multiple samples, granular scheduling, filtering, and crossfades where practical.

---

## 17. Scene modes and privacy

### Built-in scene

Ship at least one attractive default scene.

### Local image

- user file stays local,
- no upload,
- revoke replaced object URLs.

### Camera

If implemented:

- explicit permission,
- live view only,
- no still capture,
- no recording,
- no upload,
- stop camera on hide/exit/mode switch.

---

## 18. Interaction

Primary interaction is passive ambience.

Required:

- rain slider,
- scene selector,
- sound toggle/volume.

Optional later:

- tap pane to locally disturb water,
- wipe a dry path,
- wind direction,
- lightning frequency.

Do not delay core rain physics for novelty gestures.

---

## 19. Solver/performance policy

Do not reject the 2023 continuum model because it sounds computationally heavy. Prototype and profile on current iPhone/iPad first.

Preferred implementation direction:

- WebGL2/WebGPU ping-pong textures or compute-like fragment passes,
- 2D thickness/flux grid,
- active-region updates when useful,
- stable timestep/CFL-aware stepping or robust semi-implicit approximation,
- lower solver resolution than display with high-quality optical upscale,
- optional implicit thick-drop representation layered over continuum state.

Optimization is allowed only after preserving these invariants:

- mass conservation,
- pinning hysteresis,
- connected coalescence,
- downstream collection,
- residual film.

Target:

- 60 fps when practical,
- stable 30 fps acceptable in storm mode.

---

## 20. Suggested module structure

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
    topology.js
    gravity.js
    render.js
    audio.js
```

### Responsibilities

- `rain.js` — rainfall-rate mapping, Marshall–Palmer-style sampling, airborne events
- `impact.js` — contact/spread/retract/deposition initialization
- `surface.js` — thickness/flux/wetness/pinning solver
- `topology.js` — connectivity/flow IDs if needed beyond continuum grid adjacency
- `gravity.js` — known-good Fog Mirror gravity mapping
- `render.js` — thickness normals, implicit shapes, refraction/highlights, airborne streaks
- `audio.js` — layered ambience and event-coupled impacts
- `scene.js` — built-in/local/camera lifecycle

---

## 21. Development milestones

### M1 — rainfall statistics + impact prototype

- rain intensity maps to size distribution and mass flux,
- impacts have a spread/retract transient,
- pinned attached water appears.

### M2 — continuum glass solver

- thickness field,
- gravity,
- viscous damping,
- capillary smoothing/curvature,
- wetness/pinning field.

### M3 — contact-angle hysteresis

- separate depin/repin behavior,
- stable pinned beads on vertical glass,
- terminal sliding velocity depends on mass/wetness.

### M4 — continuum coalescence

- bead-bead neck formation,
- bead-rivulet joining,
- rivulet-rivulet joining,
- mass-conserving connected bodies.

### M5 — downstream runoff

- variable-width channels,
- collection from impacts/beads/film,
- residual wet trails,
- path reuse.

### M6 — optical polish

- thickness normals,
- implicit thick-drop geometry,
- refraction,
- highlights,
- Garg–Nayar-inspired airborne rain.

### M7 — ambience

- layered audio,
- local scene,
- optional camera,
- optional thunder/wind.

---

## 22. v0.1 acceptance tests

### Rain process

1. Drizzle and storm have visibly different diameter distributions, not only different counts.
2. Total pane wetting rate increases coherently with intensity.
3. Airborne rain is visually distinct from attached glass water.

### Impact

4. A visible impact rapidly spreads before relaxing.
5. Oblique/tilted impact can produce an asymmetric footprint.
6. An impact into existing water feeds that body instead of always creating a new bead.

### Surface physics

7. Small beads can remain pinned on an upright pane.
8. Depinning and repinning use hysteresis rather than one threshold.
9. A moving body conserves mass while collecting water and leaving residual film.
10. Larger/wetter flows generally move more readily and can reach higher speed.

### Coalescence

11. Two beads form a bridge and merge without teleporting into a circle.
12. A bead joining a rivulet becomes one connected water body.
13. Two touching rivulets hydraulically merge rather than remaining independent parallel lines.
14. Merge approximately preserves combined water mass.

### Rivulets

15. Runoff has variable width/thickness.
16. Downstream flow can grow as it intercepts water.
17. Trails contain residual simulated water.
18. Later runoff can reuse wet channels.

### Gravity

19. Upright mobile device runs down.
20. Right-edge-down runs right.
21. Left-edge-down runs left.
22. Near-flat orientation strongly reduces in-plane runoff.

### Rendering

23. Drops/rivulets refract the background using thickness geometry.
24. Thick drops have partial highlights/meniscus cues without cartoon outlines.
25. Airborne streaks are not identical straight white lines.

### Experience / privacy

26. Built-in scene works immediately.
27. Local photo remains local.
28. Camera mode, if present, is view-only and privacy-safe.
29. Audio contains separate ambient and impact layers.
30. App runs as a static GitHub Pages experience.

---

## 23. Non-goals for v0.1

Not required:

- full 3D DNS/VOF for every impact,
- atomistic wetting physics,
- certified meteorological rainfall reproduction,
- physically exact splash fragment distributions,
- weather API integration,
- multiplayer,
- media upload/storage.

Rainpane should be more physically coherent than a conventional rain shader while remaining an interactive ambience simulation.