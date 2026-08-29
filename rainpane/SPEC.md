# Rainpane — Product & Physics Specification

## 1. Product summary

Rainpane is a browser-based rain-on-glass ambience simulator.

A selected scene sits behind a virtual pane of glass. Rain exists in two domains:

1. airborne rain outside the pane,
2. water physically attached to and flowing across the pane.

The user can move continuously from drizzle to storm. Rain intensity changes incoming drop statistics, impact behavior, surface coverage, runoff topology, airborne streak density, and layered sound.

The experience is successful when a user can simply leave it running and enjoy watching and hearing the pane evolve.

The visual and acoustic systems must be driven by the same simulated rain process rather than running as unrelated layers.

---

## 2. Research basis

Rainpane combines several complementary models.

### 2.1 Continuum sliding and merging — primary physical reference

**C. Ruyer-Quil, D. Bresch, M. Gisclon, G. L. Richard, M. Kessar, N. Cellier (2023), “Sliding and merging of strongly sheared droplets,” Journal of Fluid Mechanics 972, A40. DOI: 10.1017/jfm.2023.726.**

Adopt:

- shallow-water/thin-layer evolution,
- conserved liquid thickness/momentum-like quantities,
- capillary effects and full-curvature ideas,
- disjoining-pressure/contact-angle hysteresis,
- continuum coalescence.

Adaptation: replace gas-shear forcing with Rainpane gravity, impact momentum, wetting and surface forces.

### 2.2 Realtime glass-water architecture

**K.-C. Chen, P.-S. Chen, S.-K. Wong (2013), “A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.**

Adopt:

- height map,
- moving fronts/particles only where useful,
- ID/connectivity map,
- residual water,
- realtime architecture specifically for glass.

### 2.3 Multiscale shape representation

**Y. Goto, T. Tanaka, Y. Sagawa (2009), “Real-Time Rendering of Flow of Water Drops on a Windshield,” IEEJ Transactions on Electronics, Information and Systems 129(12), 2152–2158. DOI: 10.1541/ieejeiss.129.2152.**

Adopt:

- grid-based irregular water,
- implicit/metaball thick-drop shape,
- separate treatment for thin streaks,
- multiscale hybrid representation.

### 2.4 Contact-angle hysteresis / sliding

**G. Ahmed, M. Sellier, M. Jermy, M. Taylor (2014), “Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces,” European Journal of Mechanics B/Fluids 48, 218–230. DOI: 10.1016/j.euromechflu.2014.06.003.**

Adopt:

- advancing/receding contact angles,
- start/stop hysteresis,
- influence on terminal sliding velocity.

### 2.5 Impact on inclined glass/surfaces

**Š. Šikalo, C. Tropea, E. N. Ganić (2005), “Impact of droplets onto inclined surfaces,” Journal of Colloid and Interface Science 286, 661–669.**

**“Droplet Impact and Spreading on Inclined Surfaces,” Langmuir 37(46), 2021, 13737–13745. DOI: 10.1021/acs.langmuir.1c02457.**

Use for impact regime, spreading stages, inclination asymmetry, pinning/retraction.

### 2.6 Rainfall size statistics

**J. S. Marshall, W. McK. Palmer (1948), “The distribution of raindrops with size,” Journal of Meteorology 5, 165–166.**

Use a Marshall–Palmer-style prior so intensity changes both count and diameter spectrum.

### 2.7 Airborne rain appearance

**K. Garg, S. K. Nayar (2006), “Photorealistic Rendering of Rain Streaks,” ACM Transactions on Graphics 25(3), 996–1002 / SIGGRAPH 2006. DOI: 10.1145/1141911.1141985.**

Use only for airborne/distant rain appearance.

### 2.8 Acoustic research

Audio details live in `AUDIO_SPEC.md`. The main product implications are:

- rain-on-glass sound depends on impact size/velocity and local surface wetness,
- dry-glass impacts and impacts into a wet film must sound different,
- familiar dripping-tap `plink` samples are physically inappropriate for glass impacts,
- smooth thin rivulets are often quiet; audible runoff grows mainly with high flux, turbulence, boundary drainage and impacts into existing wet water,
- audio should be synthesized from the same impact/state process used by the visual solver.

---

## 3. Core product modes

### 3.1 Scene source

Support:

1. built-in scene,
2. user-selected local image,
3. optional live camera.

The entire display represents the glass pane. Built-in backgrounds should depict only the scene beyond the pane rather than a photographed room/window frame unless explicitly desired.

### 3.2 Rain control

Expose a continuous control:

```text
Dry — Drizzle — Light — Rain — Heavy — Storm
```

Internally map this to a rainfall-rate-like parameter controlling mass flux, size spectrum, impact rate and acoustic density.

### 3.3 Sound

Sound is first-class but optional/mutable by the user. Required sound classes:

- environmental exterior rain,
- glass impacts,
- wet-film impacts,
- heavy runoff/sheet water,
- boundary drainage/edge drops.

Optional later:

- wind,
- lightning/thunder,
- quiet interior ambience.

---

## 4. Simulation domains

### Domain A — airborne rain

Visual atmosphere and impact source.

### Domain B — attached glass film

Conceptual fields:

```text
h(x,y)       water thickness
qx(x,y)      x-directed flux/momentum proxy
qy(x,y)      y-directed flux/momentum proxy
wet(x,y)     wetted-surface memory
pin(x,y)     contact-line heterogeneity
flowId(x,y)  optional connectivity identifier
```

### Domain C — thick drops and rivulets

May be reconstructed from `h` or represented by coupled connected implicit/macroscopic structures.

### Domain D — acoustic state

Audio is not an independent rain generator. It consumes event/state data from Domains A–C.

At minimum expose to audio:

```text
impact events:
  x, y
  mass / diameter
  normal velocity
  tangential velocity
  local h before impact
  local wetness before impact
  hit existing body? / body type

surface state:
  wet fraction
  mean / percentile h
  total surface-water flux
  active runoff area
  water mass exiting pane per unit time
  rain intensity / mass flux
```

---

## 5. Rainfall process

Use a Marshall–Palmer-style spectrum as baseline. Integrated impact mass should track requested rain intensity.

The same impact events are consumed by:

- visual impact/spreading solver,
- water mass source term,
- acoustic impact event pipeline.

Do not generate a second random sequence solely for glass tapping sounds.

---

## 6. Impact lifecycle

### Stage 1 — contact / rapid spreading

- deposit mass,
- rapid footprint growth,
- preserve impact momentum,
- expose an `impactStart` acoustic event.

### Stage 2 — deformation / retraction

- inertia decays,
- capillary forces reshape body,
- local contact line begins to pin.

### Stage 3 — attached state

Settles into unresolved film, pinned bead, enlarged collector or connected rivulet.

### Existing-water impact

An impact into existing water feeds the connected body and uses a **wet-impact** acoustic timbre rather than a dry-glass transient.

---

## 7. Thin-film / shallow-water evolution

Preferred long-term direction: GPU-friendly 2D thin-layer solver influenced by Ruyer-Quil 2023.

Required concepts:

- mass conservation,
- advection/flux,
- gravity along pane,
- viscous damping,
- capillary curvature/pressure,
- wetting/disjoining behavior,
- contact-angle hysteresis,
- impact source terms,
- residual film.

---

## 8. Pinning and contact-angle hysteresis

Use separate depin/repin conditions:

```text
if pinned:
    move only if drive > depinThreshold
else:
    continue until drive < repinThreshold

depinThreshold > repinThreshold
```

Resistance depends on local wetness, heterogeneity and contact footprint.

---

## 9. Coalescence

Coalescence is continuum/topological:

- bead-bead,
- bead-rivulet,
- rivulet-rivulet,
- impact-existing-body.

Form a bridge/neck, transfer mass, relax with capillary oscillation/damping.

Slow ordinary merges are usually acoustically subtle. Do not emit a mandatory audible `pop` for every merge.

---

## 10. Rivulet dynamics

Rivulets have variable width/thickness and emerge from connected flowing water.

They collect impacts/beads/film, leave residual wet trails, and may branch/rejoin.

### Acoustic implication

A thin smooth rivulet should not continuously emit obvious “running water” audio. Runoff sound increases with:

- high total surface flux,
- thicker connected sheet/rivulet water,
- energetic interactions,
- water striking/escaping pane boundaries,
- heavy rain hitting existing wet water.

---

## 11. Mass accounting

```text
M(t+dt) = M(t)
        + incoming_rain_mass
        - water_exiting_pane
        - optional_evaporation
```

Track `water_exiting_pane` because it is also an input to boundary/drain audio.

---

## 12. Gravity

Reuse the field-tested Fog Mirror implementation as a frozen reference.

Known-good behavior:

- upright -> down,
- right-edge-down -> right,
- left-edge-down -> left,
- near-flat -> weak in-plane gravity.

Do not redesign or add a second orientation rotation without real-device regression evidence.

---

## 13. Water geometry and rendering

Use thickness-derived normals/refraction and implicit thick-drop geometry where useful.

Avoid cartoon outlines, opaque dark trails, identical circles and constant-width lines.

---

## 14. Airborne rain rendering

Use Garg–Nayar-inspired variation in length, brightness, oscillation and motion blur. Airborne rain and attached glass water must remain visibly separate systems.

---

## 15. Rain intensity mapping

For each intensity determine:

- rainfall-rate proxy,
- diameter distribution,
- total mass flux,
- impact rate,
- impact-energy distribution,
- airborne density,
- pane wet fraction,
- runoff activity,
- environmental-rain acoustic density/spectrum.

Do **not** directly map intensity slider to every audio layer's volume.

Dry/wet impact mixture should emerge from actual local glass state. Runoff audio should emerge from actual water flux.

---

## 16. Audio integration

Detailed requirements are in `AUDIO_SPEC.md` and are normative.

High-level architecture:

### Layer A — exterior/forest rain ambience

Continuous environmental rain beyond the pane. It may react to rain intensity but should not be mistaken for the glass itself.

### Layer B — dry-glass impacts

Short transients tied to impacts where local `h/wet` is low.

### Layer C — wet-glass / thin-film impacts

Different transient family/filtering for impacts into an already-wet surface.

### Layer D — runoff / sheet-water texture

Driven by simulated surface-water flux, connected runoff area and thickness. Mostly relevant at Heavy/Storm.

### Layer E — boundary drainage / exiting-water events

Triggered by significant water mass leaving the pane or striking a conceptual lower/side edge.

### Event density handling

At storm rates, do not instantiate an audio source for every raindrop. Bin/cluster events in small temporal windows and synthesize aggregate transients while preserving larger salient impacts.

### Spatial behavior

When stereo is available, impact x-position should influence pan subtly. Avoid exaggerated arcade-style panning.

### Lifecycle

- audio context starts/resumes only after user gesture,
- clear mute/volume control,
- hidden documents suspend/reduce scheduling,
- no microphone needed.

---

## 17. Scene modes and privacy

### Built-in scene

Ship at least one attractive scene beyond the virtual pane.

### Local image

Local only; no upload.

### Camera

If implemented: explicit permission, view-only, no capture/recording/upload, stop on hide/exit/mode switch.

---

## 18. Interaction

Required:

- rain slider,
- scene selector,
- sound toggle/volume.

Optional later:

- local pane disturbance,
- wipe path,
- wind,
- thunder controls.

---

## 19. Solver/performance policy

Prototype/profile on current iPhone/iPad before simplifying.

Maintain physics invariants:

- mass conservation,
- pinning hysteresis,
- connected coalescence,
- downstream collection,
- residual film.

Maintain audio invariants:

- impact events tied to simulation,
- local wetness affects impact timbre,
- dense impacts use clustering/voice pooling,
- runoff sound tied to flux,
- exiting water drives edge/drain events.

Target 60 fps when practical; stable 30 fps acceptable in storm mode.

---

## 20. Suggested module structure

```text
rainpane/
  index.html
  styles.css
  AGENTS.md
  SPEC.md
  AUDIO_SPEC.md
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

`audio.js` should consume normalized simulation events/state through a narrow interface rather than reaching into renderer internals.

---

## 21. Development milestones

### M1 — rainfall statistics + impact

### M2 — continuum glass solver

### M3 — pinning/hysteresis

### M4 — continuum coalescence

### M5 — downstream runoff

### M6 — optical polish

### M7 — acoustic foundation

- user-gesture audio startup,
- ambient exterior bed,
- impact event bus,
- dry/wet impact distinction,
- event clustering / voice pooling.

### M8 — physics-driven runoff audio

- surface-flux metric,
- heavy runoff texture driven by flux,
- boundary-exit/drain events,
- tuning against drizzle/light/rain/heavy/storm scenes.

### M9 — optional ambience extras

- wind,
- thunder/lightning,
- subtle room tone.

---

## 22. v0.1 acceptance tests

### Physics

1. Drizzle/storm differ in diameter distribution and mass flux.
2. Significant impacts spread before relaxing.
3. Small beads pin.
4. Depin/repin uses hysteresis.
5. Moving water conserves mass approximately.
6. Descending water grows when collecting mass.
7. Beads/rivulets merge continuously.
8. Rivulets have variable width and residual trails.
9. Gravity follows device orientation.

### Rendering

10. Attached water refracts/distorts background from simulated geometry.
11. Thick drops use partial highlight/meniscus cues without cartoon outlines.
12. Airborne rain differs visually from attached water.

### Audio

13. Audio can be muted immediately.
14. Rain ambience exists independently of glass impacts.
15. Dry impacts and impacts into a wet film are perceptibly different.
16. Larger/more energetic impacts are generally stronger without simply mapping radius to volume.
17. Storm mode does not create an unbounded number of audio voices.
18. Impact timing remains statistically/causally tied to simulated impacts.
19. Thin quiet runoff does not sound like a constant stream.
20. Heavy runoff sound rises when simulated surface flux rises.
21. Significant water leaving the pane can generate occasional boundary/drain sound.
22. Generic dripping-tap `plink` is not used as the core glass impact sound.

### Experience / privacy

23. Built-in scene works immediately.
24. Local photo remains local.
25. Camera mode, if present, is privacy-safe.
26. App works as static GitHub Pages.

---

## 23. Non-goals for v0.1

Not required:

- full 3D DNS/VOF for every impact,
- atomistic wetting,
- exact structural modal model of a real window,
- binaural room impulse-response simulation,
- certified meteorological reproduction,
- exact splash fragment distribution,
- weather API,
- multiplayer,
- media upload/storage.

Rainpane should be substantially more coherent than a conventional rain shader/audio loop: image and sound are both consequences of one underlying rain-on-glass simulation.