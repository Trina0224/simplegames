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

## Read this before editing physics or audio

Do not treat Rainpane as a particle-effects demo or as a looping-rain-audio player. The water layer is a coupled interfacial-flow simulation, and the audio layer is driven by the same rain/water state.

Before modifying rain impact, surface water, pinning, merging, rivulets, rendering, or sound, read:

- `SPEC.md`
- `AUDIO_SPEC.md`

### Canonical research hierarchy

#### Tier A — continuous surface water / merging

1. **Ruyer-Quil, Bresch, Gisclon, Richard, Kessar & Cellier (2023), “Sliding and merging of strongly sheared droplets,” Journal of Fluid Mechanics 972, A40. DOI: 10.1017/jfm.2023.726.**
   - Augmented shallow-water formulation with surface tension/full curvature, viscous effects, a capillary variable, and disjoining-pressure/contact-angle hysteresis.
   - Models displacement and merging as a continuum rather than circles that only merge on overlap.
   - Forcing is gas shear, not gravity-driven rain-on-glass. Reuse interfacial/capillary/hysteresis/merging ideas; replace forcing with Rainpane gravity and impact terms.

2. **Chen, Chen & Wong (2013), “A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.**
   - Directly targets glass panes.
   - Height map + particles/fronts where useful.
   - ID map for drop/flow merging.
   - Residual water after flow passes.
   - Primary realtime architecture reference.

#### Tier B — impact, shape, pinning, sliding

3. **Goto, Tanaka & Sagawa (2009), “Real-Time Rendering of Flow of Water Drops on a Windshield,” IEEJ Transactions on Electronics, Information and Systems 129(12), 2152–2158. DOI: 10.1541/ieejeiss.129.2152.**
   - Grid for irregular motion, 2D metaballs for thick drop shape/fusion, particles for thin water.
   - Use different representations for different water scales.

4. **Ahmed, Sellier, Jermy & Taylor (2014), “Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces,” European Journal of Mechanics B/Fluids 48, 218–230. DOI: 10.1016/j.euromechflu.2014.06.003.**
   - Advancing/receding contact angles and hysteresis affect depinning and terminal velocity.
   - Model start/stop hysteresis, not one radius threshold.

5. **Šikalo, Tropea & Ganić (2005), “Impact of droplets onto inclined surfaces,” Journal of Colloid and Interface Science 286, 661–669.**
   - Impact behavior depends on normal velocity, Weber/Reynolds numbers, inclination, roughness and wettability.

6. **“Droplet Impact and Spreading on Inclined Surfaces,” Langmuir 37(46), 2021, 13737–13745. DOI: 10.1021/acs.langmuir.1c02457.**
   - Early inertia-dominated spreading followed by pinning/retraction when surface forces dominate.

#### Tier C — rainfall statistics and airborne visual rain

7. **Marshall & Palmer (1948), “The distribution of raindrops with size,” Journal of Meteorology 5, 165–166.**
   - Exponential drop-size distribution as a function of rainfall rate.
   - Rain intensity changes both count and size spectrum.

8. **Garg & Nayar (2006), “Photorealistic Rendering of Rain Streaks,” ACM Transactions on Graphics 25(3), 996–1002 / SIGGRAPH 2006. DOI: 10.1145/1141911.1141985.**
   - Airborne/distant rain appearance only: oscillation, reflection/refraction, motion-blurred nonuniform streaks.

#### Tier D — acoustics

9. **Sound generation by water drop impact on surfaces, Experimental Thermal and Fluid Science (2020).**
   - Single-drop impact produces surface- and wetness-dependent acoustic spectra.
   - Dry solid, thin liquid film, and deeper liquid layers do not sound identical.
   - Rainpane impact timbre must depend on local wetness/water thickness, not only drop size.

10. **Roux & Cooper-White (2004), “Dynamics of water spreading on a glass surface.”**
    - Connects drop impact/spreading dynamics on glass with acoustic observations.
    - Use the same impact event parameters for visual and audio response.

11. **ISO rainfall-noise measurement literature (ISO 140-18 / ISO 10140 family).**
    - Rain-generated building noise depends on impact statistics, drop distribution, velocity, and the receiving structure.
    - Do not model rain intensity as one loop with a volume knob.

12. **Phillips, Agarwal & Jordan (2018), “The sound produced by a dripping tap is driven by resonant oscillations of an entrained air bubble,” Scientific Reports.**
    - The familiar water `plink` from a drop entering a liquid pool is bubble-resonance dominated.
    - Do not use generic faucet/dripping-water samples as glass-impact sounds.

### Reference priority rule

When references operate at different scales:

- prefer continuum results for qualitative water dynamics,
- preserve Chen-style realtime state/connectivity where a full PDE solve is unnecessary,
- use impact papers to initialize post-impact state,
- use Marshall–Palmer only for incoming-rain statistics,
- use Garg–Nayar only for airborne appearance,
- use acoustic impact literature to map the same simulated impact state into sound.

Do not copy a forcing term or acoustic mechanism from a physically different scenario.

---

## Product principles

1. **Physics is the feature.** Rain is not a looping sprite sheet.
2. **The glass is a continuous simulation surface.** Water belongs to a field/body, not unrelated marbles.
3. **Mass is conserved approximately.** Impact adds mass; merge combines mass; runoff redistributes mass; residual film remains in the system.
4. **Coalescence is topological.** Head-head, head-body and body-body contact can merge flows.
5. **Impact has a transient.** A drop spreads/deforms before settling.
6. **Pinning has hysteresis.** Starting and continuing motion are different states.
7. **Runoff evolves downstream.** A rivulet collects water, widens and generally moves more readily as mass increases.
8. **Multiple water scales may use multiple representations.** Thin film, pinned bead, bulk drop and rivulet need not share one primitive.
9. **Rain intensity changes the entire system.** Count, size spectrum, impact energy, surface coverage, runoff density and sound respond together.
10. **Rendering derives from water geometry.** Refraction/highlights follow simulated water thickness/shape.
11. **Audio is simulation output.** Sound must respond to rain impacts, local wetness, surface flux and water leaving the pane.
12. **Privacy is strict.** Local photos/camera remain local; no capture/upload/recording.

---

## Required physics state

Conceptually maintain:

- `h(x,y)` / `water[x,y]` — free-liquid thickness / unresolved film
- `u(x,y), v(x,y)` or flux/momentum equivalent
- `wet(x,y)` — wetted-surface/contact-line memory
- `flowId(x,y)` if explicit connectivity is needed
- `pinning(x,y)` — stable contact-line resistance heterogeneity

A hybrid solver may retain thick-drop/front objects, but they are proxies for connected liquid bodies and must carry mass/connectivity.

Use a continuum height/film representation everywhere, with adaptive/macroscopic structures only where useful.

---

## Incoming rain model

Two distinct domains:

### A. Airborne rain outside the pane

Optical ambience only. Garg–Nayar-inspired appearance may be used.

### B. Impacts on the pane

Each impact should expose at least:

- position
- diameter/mass
- normal velocity
- tangential velocity if oblique/windy
- impact time
- local water thickness before impact
- local wetness before impact

The impact event is a shared source for **both** visual physics and impact audio.

Do not create independent random audio impacts unrelated to the visual/simulated rain process.

---

## Impact response

1. contact / inertial spreading
2. surface-force takeover
3. relaxed attached state
4. possible immediate join into existing water

Full splash/breakup can be deferred, but significant impacts cannot appear instantaneously relaxed.

---

## Contact angle / pinning contract

Do not implement only `if radius > threshold: move`.

Use hysteretic state:

```text
drive = gravity_along_glass * mobile_mass + transient_impact_momentum
resistance = contact_line_resistance(local_surface, footprint, wetness)

pinned -> moving only when drive > depin_threshold
moving -> pinned only when drive < repin_threshold
```

with `depin_threshold > repin_threshold`.

---

## Coalescence / merging contract

Required merge modes:

- head-head
- head-body
- body-body
- impact-body

On contact:

- form a neck/bridge,
- transfer mass continuously,
- damp capillary oscillation,
- conserve mass approximately,
- conserve momentum approximately where meaningful,
- resolve into one connected body/front where appropriate.

Two rivulets that contact must not continue forever as unrelated lines.

Normal slow coalescence should **not** automatically emit a cartoon `pop` sound. Only sufficiently energetic/large merge events may create a subtle wet transient.

---

## Rivulet contract

A rivulet is a connected thickness field/body, not a drawn stroke.

It should have variable width, collect impact water/beads, leave residual wetness, merge with neighbors and respond mainly to gravity.

Downstream growth comes from mass flux, not a visual size multiplier.

### Rivulet acoustics

A smooth thin rivulet is usually acoustically quiet. Do not continuously play a fake “running water” sound for every visible stream.

Runoff audio becomes significant mainly when:

- rain is heavy enough for sheet/rivulet turbulence,
- high surface-water flux exists,
- water reaches/impacts the pane boundary,
- large/fast moving water intersects other water,
- many impacts strike existing wet film.

---

## Gravity

Reuse the field-tested Fog Mirror DeviceMotion mapping. Do not redesign it unless a real-device regression is demonstrated.

Golden behavior:

- upright -> down
- right edge physically down -> right
- left edge physically down -> left
- nearly flat -> small in-plane gravity

Use the known-good `DeviceMotionEvent.accelerationIncludingGravity` mapping without a second screen-orientation rotation unless device evidence requires it.

---

## Rendering contract

Pipeline:

1. background image / camera / built-in scene
2. airborne rain layer
3. water-thickness normals
4. background refraction/distortion
5. meniscus/contact-line shading
6. partial Fresnel/specular highlights
7. impact/coalescence deformation
8. UI

Do not render full outlines, black disconnected trails, identical circles or constant-width runoff lines.

---

## Rain intensity

The user sees one perceptual control, but internally intensity changes:

- total mass flux
- impact event rate
- incoming diameter distribution
- impact velocity/energy distribution
- pane wet fraction
- connected runoff probability
- airborne streak density
- ambient-rain acoustic density/spectrum
- dry/wet glass impact mixture
- runoff acoustic activity

Do not implement intensity as only `spawnRate`, only visual opacity, or only audio gain.

---

## Audio contract

Read `AUDIO_SPEC.md` before editing `audio.js`.

### Required architecture

At minimum separate:

1. **Exterior rain ambience** — continuous environmental bed.
2. **Dry-glass impact transients** — most audible while pane is relatively dry.
3. **Wet-glass/film impact transients** — increasingly dominant as local `h`/`wet` rise.
4. **Heavy runoff/sheet-water texture** — driven by actual surface flux, mostly heavy/storm conditions.
5. **Boundary/edge-drain events** — driven by water mass exiting the pane.

Optional later:

- wind
- lightning/thunder
- quiet interior room tone

### Hard audio rules

- Audio must be coupled to simulation events/state.
- Do not schedule a separate fake rain-impact process when the simulation already emits impacts.
- Do not play one audio voice per physical impact at high rain rates; cluster/bin dense impacts into short windows.
- Do not use generic faucet `plink` samples for glass impacts.
- Do not make every drop merge audible.
- Do not make every visible rivulet emit a looping stream sample.
- Dry and wet glass must not sound identical.
- Runoff volume/activity must depend on surface-water flux and exiting mass, not directly on the rain slider alone.
- Spatialization/panning should derive from impact x-position where practical.
- Audio must obey browser user-gesture/autoplay rules and have an immediate mute control.
- Pause/suspend expensive scheduling when hidden.

### Preferred synthesis strategy

Use a **procedural + sample hybrid**:

- a small number of long ambience beds or granular ambient sources,
- procedural short transients for dense impacts,
- a few real glass/wet impact recordings for timbral variation,
- randomized filtering/gain/decay/pan within physically plausible ranges,
- clustered event synthesis for storm density.

---

## Scene modes and privacy

Modes:

1. built-in scene
2. local image
3. optional live camera

Local images remain local. Camera is view-only and must stop on hide/exit.

No microphone is required for Rainpane.

---

## Performance philosophy

Do not prematurely simplify physics or audio solely because a model sounds expensive. Measure on current iPhone/iPad first.

Allowed optimizations after profiling include lower-resolution grids, active-region updates, WebGL/WebGPU passes, clustered impact audio, voice pooling and offline/precomputed noise buffers.

Never replace correct merge/topology or state-coupled audio with unrelated particles/loops merely to gain FPS.

---

## Suggested module structure

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
    flows.js
    gravity.js
    render.js
    audio.js
```

- `rain.js` — rainfall process / Marshall–Palmer-style sampling / airborne events
- `impact.js` — impact spreading/deformation/deposition initialization and impact event payload
- `surface.js` — thickness, momentum/flux, wetness, pinning, topology maps
- `flows.js` — optional macroscopic connected bodies/fronts, merge bookkeeping
- `gravity.js` — copied/adapted known-good Fog Mirror mapping only
- `render.js` — normals/refraction/implicit-surface shading
- `audio.js` — state-coupled ambience/impact/runoff/edge audio as specified in `AUDIO_SPEC.md`

---

## Acceptance invariants

A build is not acceptable if any are false:

1. Drizzle and storm differ in drop-size spectrum as well as count.
2. An impact visibly spreads/deforms before relaxing.
3. Small beads can pin.
4. Depinning/repinning exhibits hysteresis.
5. Water mass is approximately conserved across collection and merge.
6. A descending body grows when it intercepts water.
7. Contacting beads merge through a bridge/continuous transition.
8. Contacting rivulets become one connected flow.
9. Connected water has variable width/thickness.
10. Trails contain residual simulated water.
11. Later runoff can reuse wet trails.
12. Device gravity follows the proven mapping.
13. Airborne rain and glass runoff are visibly distinct systems.
14. Water optics come from geometry/thickness, not cartoon outlines.
15. Dry and wet impact sounds are perceptibly different.
16. Dense storm impacts are clustered/pooled rather than spawning unbounded audio voices.
17. Runoff audio responds to simulated water flux.
18. Water leaving the pane can drive occasional boundary/drain sound.
19. Muting audio stops all Rainpane sound immediately.
20. User media never leaves the device.

---

## Non-goals for first playable build

Can wait unless they fall out naturally:

- atomistic contact-line physics
- fully resolved 3D Navier–Stokes/VOF for every impact
- physically exact splash fragmentation
- exact structural modal analysis of a real window pane
- binaural room acoustics
- weather API integration
- meteorological certification
- multiplayer

The goal is a physically coherent, perceptually convincing rain-on-glass simulation whose sound and image arise from the same underlying rain/water process.