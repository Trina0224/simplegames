# AGENTS.md — Rainpane

## Purpose

Rainpane is a touch-friendly browser simulation of rain striking and running down a pane of glass.

The experience is atmospheric rather than game-like. A scene sits behind a virtual pane; rain impacts the pane, spreads, pins, coalesces, forms rivulets, and drains under gravity. Layered rain audio and distance-dependent rainy-atmosphere rendering complete the ambience.

Primary targets:

- iPhone
- iPad / iPad mini
- modern Android phones/tablets when practical
- desktop browsers as fallback

Static GitHub Pages. No backend.

---

## Required reading before editing

Rainpane is split into three coupled but distinct parts:

1. **Part 1 — glass-water physics and rendering**: `SPEC.md`
2. **Part 2 — physically coupled sound**: `AUDIO_SPEC.md`
3. **Part 3 — atmospheric visibility / heavy-rain veil**: `VISIBILITY_SPEC.md`

Treat these as external design requirements. Do not assume they were authored by the current implementation agent.

Before modifying rain impact, surface water, pinning, merging, rivulets, rendering, sound, airborne rain, atmospheric fog/veil, background contrast, or distant-light bloom, read the relevant spec above. If a task crosses boundaries, read all three.

Do not treat Rainpane as a particle-effects demo, a looping-rain-audio player, or a fullscreen fog filter. The water layer is a coupled interfacial-flow simulation; audio is driven by the same rain/water state; heavy-rain visibility is depth-aware atmospheric attenuation outside the pane.

---

## Canonical research hierarchy

### Tier A — continuous surface water / merging

1. **Ruyer-Quil, Bresch, Gisclon, Richard, Kessar & Cellier (2023), “Sliding and merging of strongly sheared droplets,” Journal of Fluid Mechanics 972, A40. DOI: 10.1017/jfm.2023.726.**
   - Augmented shallow-water formulation with surface tension/full curvature, viscous effects, capillary terms and contact-angle hysteresis.
   - Use for qualitative continuum displacement/merging ideas; replace the paper's gas-shear forcing with Rainpane gravity/impact forcing.

2. **Chen, Chen & Wong (2013), “A heuristic approach to the simulation of water drops and flows on glass panes,” Computers & Graphics 37(8), 963–973. DOI: 10.1016/j.cag.2013.08.004.**
   - Directly targets glass panes.
   - Height map + particles/fronts where useful.
   - ID-map style connectivity/merging and residual water.
   - Primary realtime engineering reference.

### Tier B — impact, shape, pinning, sliding

3. **Goto, Tanaka & Sagawa (2009), “Real-Time Rendering of Flow of Water Drops on a Windshield.”**
   - Grid + implicit/metaball bulk shapes + separate thin-water representation.

4. **Ahmed, Sellier, Jermy & Taylor (2014), “Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.”**
   - Advancing/receding hysteresis affects depinning and terminal velocity.

5. **Šikalo, Tropea & Ganić (2005), “Impact of droplets onto inclined surfaces.”**
   - Impact depends on velocity, inclination, wettability and surface properties.

6. **“Droplet Impact and Spreading on Inclined Surfaces,” Langmuir 37(46), 2021. DOI: 10.1021/acs.langmuir.1c02457.**
   - Early inertia-dominated spreading followed by capillary/pinning behavior.

### Tier C — rainfall statistics and airborne rain optics

7. **Marshall & Palmer (1948), “The distribution of raindrops with size.”**
   - Use as a statistical prior so rain intensity changes both count and drop-size spectrum.

8. **Garg & Nayar (2006), “Photorealistic Rendering of Rain Streaks.”**
   - Airborne/distant rain only: oscillation, reflection/refraction and nonuniform motion-blurred streaks.

### Tier D — acoustics

9. **“Sound generation by water drop impact on surfaces,” Experimental Thermal and Fluid Science (2020).**
   - Impact spectra depend on impact and surface/wetness state.

10. **Roux & Cooper-White (2004), “Dynamics of water spreading on a glass surface.”**
    - Useful link between drop impact/spreading on glass and acoustic observations.

11. **ISO rainfall-noise measurement literature (ISO 140-18 / ISO 10140 family).**
    - Rain noise depends on impact statistics, drop distribution, velocity and receiving structure.

12. **Phillips, Agarwal & Jordan (2018), dripping-tap bubble-resonance work.**
    - Generic water `plink` samples are the wrong acoustic mechanism for rain striking glass.

### Tier E — atmospheric visibility / rain accumulation

13. **Yang, Tan, Wang, Fang & Liu, “Single Image Deraining: From Model-Based to Data-Driven and Beyond.”**
    - Distinguishes resolvable rain streaks from rain accumulation/veil; heavy rain lowers distant contrast and visibility.

14. **Gultepe & Milbrandt (2010), “Probabilistic Parameterizations of Visibility Using Observations of Rain Precipitation Rate, Relative Humidity, and Visibility.” DOI: 10.1175/2009JAMC1927.1.**
    - Use qualitatively to couple precipitation/humidity to visibility rather than applying an arbitrary constant fog opacity.

15. **Slomp et al. (2011), “Photorealistic real-time rendering of spherical raindrops with hierarchical reflective and refractive maps.”**
    - Realtime airborne-raindrop optics reference.

### Reference priority rule

When references operate at different scales:

- prefer continuum results for qualitative water dynamics,
- preserve Chen-style realtime state/connectivity where a full PDE solve is unnecessary,
- use impact papers to initialize post-impact state,
- use Marshall–Palmer only for incoming-rain statistics,
- use Garg–Nayar/Slomp for airborne appearance,
- use acoustic literature to map the same simulated impact state into sound,
- use rain-visibility literature for **distance-dependent atmospheric attenuation**, not for glass-water behavior.

Do not copy a forcing term or acoustic/optical mechanism from a physically different scenario.

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
9. **Rain intensity changes the entire system.** Count, size spectrum, impact energy, surface coverage, runoff density, atmospheric visibility and sound respond together.
10. **Rendering derives from physical state.** Refraction/highlights follow simulated water; atmospheric veil follows rain intensity and scene distance.
11. **Audio is simulation output.** Sound responds to rain impacts, wetness, surface flux and water leaving the pane.
12. **Heavy-rain visibility is depth-aware.** The far forest degrades much more than the near ground.
13. **Privacy is strict.** Local photos/camera remain local; no capture/upload/recording.

---

## Required surface-water state

Conceptually maintain:

- `h(x,y)` / `water[x,y]` — free-liquid thickness / unresolved film
- `u(x,y), v(x,y)` or flux/momentum equivalent
- `wet(x,y)` — wetted-surface/contact-line memory
- `flowId(x,y)` if explicit connectivity is needed
- `pinning(x,y)` — stable contact-line resistance heterogeneity

A hybrid solver may retain thick-drop/front objects, but they are proxies for connected liquid bodies and must carry mass/connectivity.

---

## Incoming rain model

Keep two distinct domains:

### A. Airborne rain outside the pane

Optical atmosphere. Individual nearby streaks and distant accumulated rain are different scales.

### B. Impacts on the pane

Each impact should expose at least:

- position
- diameter/mass
- normal velocity
- tangential velocity if oblique/windy
- impact time
- local water thickness before impact
- local wetness before impact

The impact event is shared by visual physics and impact audio. Do not create independent fake audio impacts unrelated to the simulated rain process.

---

## Impact / pinning / merge contracts

Significant impacts must pass through contact/spreading, capillary/retraction behavior, and then an attached/merged state; they cannot appear as already-relaxed circles.

Use hysteretic pinning rather than only `if radius > threshold: move`:

```text
drive = gravity_along_glass * mobile_mass + transient_impact_momentum
resistance = contact_line_resistance(local_surface, footprint, wetness)

pinned -> moving only when drive > depin_threshold
moving -> pinned only when drive < repin_threshold
```

with `depin_threshold > repin_threshold`.

Required merge modes:

- head-head
- head-body
- body-body
- impact-body

On contact, form a neck/bridge, transfer mass continuously, damp capillary oscillation and resolve connected topology. Two contacting rivulets must not remain unrelated parallel lines.

Normal slow coalescence should not automatically emit a cartoon `pop`.

---

## Rivulet contract

A rivulet is connected simulated water, not a drawn stroke. It should have variable width, collect impacts/beads, leave residual wetness, merge with neighbors and respond mainly to gravity.

A smooth thin rivulet is usually acoustically quiet. Runoff audio becomes significant mainly with high surface-water flux, turbulent/sheet-like flow, energetic intersections or water reaching the pane boundary.

---

## Gravity — preserve real-device behavior

Reuse the field-tested DeviceMotion mapping. Do not redesign gravity unless a real-device regression is demonstrated.

Golden behavior:

- upright -> down
- right edge physically down -> right
- left edge physically down -> left
- nearly flat -> small in-plane gravity

Use the known-good `DeviceMotionEvent.accelerationIncludingGravity` sensor read.

Current Rainpane additionally corrects display orientation because the simulation relayouts on `orientationchange`. The important device finding is that CoreMotion axes are portrait-based while `screen.orientation.angle` is measured from the device's natural orientation, which can be landscape on iPad. Do not replace the existing `rotation()` logic with a bare `screen.orientation.angle` rotation.

Confirmed device behavior included:

```text
locked upright        -> down
locked, right down    -> right
locked, left down     -> left
unlocked, turned      -> down relative to the newly rotated display
```

A rotation-locked display should keep gravity tied to the physically lowest screen edge.

Do not modify gravity as part of audio or visibility work.

---

## Rendering contract

Read `VISIBILITY_SPEC.md` before modifying atmospheric/background rendering.

### Visibility findings — do not undo these

- **The built-in scene's depth is measured, not styled.** Its nine lanterns are one physical object at nine distances, so apparent size measures distance. A fitted ground plane `z = 1/(v - 0.389)` reproduces their sizes to ~10%. `tools/make-visibility-mask.py` regenerates the masks; edit that, not the PNG.
- **Never take screen height for depth.** This scene's overhanging canopy sits at the top of the frame at depth 0.04 while the sky gap beside it is 0.98. A height model fogs the nearest thing in frame.
- **Lamps are found by blown-out warm cores, with wet-path reflections discarded** (a reflection sits directly under a brighter source in the same column). Haloing every bright pixel is forbidden and the foreground is full of bright reflections.
- **A halo must be wide and strong enough to survive its own cause.** Scattered light is added exactly where extinction removes it; at strength 0.55 with a tight mask the ring around a far lamp measured *darker* than with no veil at all.
- **The veil is computed inside `scene()`**, at the refracted sample coordinate, so drops refract an already-veiled background. Applying it after refraction leaves the distance undistorted behind every drop.

Preferred render order:

1. background image / camera / built-in scene
2. **depth-aware atmospheric rain visibility / airlight / distant-light halo**
3. airborne rain layer
4. water-thickness normals
5. glass-water refraction/distortion of the already rain-degraded background
6. meniscus/contact-line shading
7. partial Fresnel/specular highlights
8. impact/coalescence deformation
9. UI

### Hard Part 3 rules

- Heavy rain must reduce **far-background** visibility.
- The near lower ground/path close to the viewer must remain substantially clearer than the deep forest.
- Do not use one uniform fullscreen blur.
- Do not use one flat gray/white overlay.
- Do not infer arbitrary-photo depth purely from screen y.
- Distant selected lamps may gain subtle rain/mist halos; near highlights must not receive the same treatment.
- Atmospheric veil and glass water are separate systems and must be independently diagnosable.
- The built-in forest scene should use an authored `depthMask`, `nearGroundProtectionMask`, and sparse light mask/positions.

Do not render glass water as full outlines, black disconnected trails, identical circles or constant-width runoff lines.

---

## Rain intensity

The user sees one perceptual rain control, but internally intensity changes:

- total mass flux
- impact event rate
- incoming diameter distribution
- impact velocity/energy distribution
- pane wet fraction
- connected runoff probability
- airborne streak density
- **far-scene atmospheric extinction / visibility**
- **distant-light halo strength**
- ambient-rain acoustic density/spectrum
- dry/wet glass impact mixture
- runoff acoustic activity

Do not implement intensity as only `spawnRate`, only visual opacity, only fog opacity, or only audio gain.

---

## Audio contract

Read `AUDIO_SPEC.md` before editing `audio.js`.

Required conceptual layers:

1. exterior rain ambience
2. dry-glass impact transients
3. wet-glass/film impact transients
4. heavy runoff/sheet-water texture
5. boundary/edge-drain events

### Device-tested audio constraints

These findings came from real-device listening and should not be casually undone:

- Voice at most roughly **40 discrete taps/s**; denser energy belongs in texture rather than machine-gun transients.
- The impact should sound like a **splash with a pane under it**, not a struck plate/castanet.
- Avoid sharpening a narrow resonant note to make impacts "clearer"; that was perceptually wrong.
- Contact energy should be low-passed rather than dominated by a strong high-frequency click.
- Choose voiced drops with approximately square-root-of-energy weighting rather than energy weighting so all voiced events do not become large percussion hits.
- Dry and wet glass must not sound identical.
- Runoff sound depends on simulated flux/exiting mass, not directly on rain-slider gain.

Hard audio rules:

- couple audio to simulation events/state,
- do not schedule a separate fake impact process,
- do not play one voice per physical impact in dense rain,
- do not use generic faucet `plink` samples,
- do not make every merge audible,
- do not make every rivulet emit a looping stream sample,
- spatialize/pan from impact x-position where practical,
- obey browser autoplay/user-gesture rules,
- provide immediate mute,
- suspend expensive scheduling when hidden.

Preferred approach: procedural + sample hybrid with ambience beds, procedural dense transients, a few real glass/wet variations, physically plausible randomization and clustered storm synthesis.

---

## Scene modes and privacy

Modes:

1. built-in scene
2. local image
3. optional live camera

Local images remain local. Camera is view-only and must stop on hide/exit. No microphone is required.

For arbitrary local images/camera, do not pretend to know exact depth. Part 3 full depth-aware behavior is required first for the built-in forest scene; arbitrary media should use conservative approximations until a privacy-safe depth solution exists.

---

## Shipping

Bump `BUILD` in `src/app.js`, the `?v=` on every import in `src/*.js`, and the script version in `index.html` to the same value on every ship. GitHub Pages + Safari module caching has previously served stale code and caused false debugging conclusions.

The build stamp should remain visible in the info/diagnostic panel.

---

## Performance philosophy

Do not prematurely simplify physics, audio or atmospheric rendering solely because a model sounds expensive. Measure on current iPhone/iPad first.

Allowed optimizations after profiling include lower-resolution grids, active-region updates, WebGL/WebGPU passes, pre-authored depth/protection/light masks, low-resolution atmospheric noise, clustered impact audio, voice pooling and precomputed noise buffers.

Never replace correct merge/topology, state-coupled audio, or depth-aware visibility with unrelated particles/loops/fullscreen blur merely to gain FPS without measurement.

---

## Suggested module structure

```text
rainpane/
  index.html
  styles.css
  AGENTS.md
  SPEC.md
  AUDIO_SPEC.md
  VISIBILITY_SPEC.md
  src/
    app.js
    scene.js
    rain.js
    impact.js
    surface.js
    flows.js
    gravity.js
    render.js
    visibility.js
    audio.js
```

- `rain.js` — rainfall process / Marshall–Palmer-style sampling / airborne events
- `impact.js` — impact spreading/deformation/deposition and impact-event payload
- `surface.js` — thickness, momentum/flux, wetness, pinning, topology maps
- `flows.js` — optional connected bodies/fronts and merge bookkeeping
- `gravity.js` — proven mobile gravity mapping
- `render.js` — water normals/refraction/implicit-surface shading and composition
- `visibility.js` — Part 3 depth-aware transmittance, airlight, rain accumulation and selected distant-light halos
- `audio.js` — state-coupled ambience/impact/runoff/edge audio per `AUDIO_SPEC.md`

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
20. Heavy/storm rain clearly reduces **far-background** visibility.
21. Far trees degrade before the near foreground.
22. The near lower path/ground remains substantially clearer than the deep forest in heavy rain.
23. Atmospheric visibility is not implemented as one uniform fullscreen blur/fog overlay.
24. Selected distant lamps gain subtle rain/mist halos while near highlights remain comparatively crisp.
25. Glass droplets refract the atmospherically degraded background rather than bypassing Part 3.
26. User media never leaves the device.

---

## Work sequencing

Current work may remain focused on audio. **Do not interrupt a stable audio implementation solely because `VISIBILITY_SPEC.md` was added.**

Part 3 should begin after the current audio work reaches a stable checkpoint. When implementing it, do not redesign gravity, water physics or audio in the same change unless required by a demonstrated integration bug.

---

## Non-goals for first playable build

Can wait unless they fall out naturally:

- atomistic contact-line physics
- fully resolved 3D Navier–Stokes/VOF for every impact
- physically exact splash fragmentation
- exact structural modal analysis of a real window pane
- binaural room acoustics
- full volumetric meteorological simulation
- automatic metric-depth reconstruction for arbitrary user photos
- weather API integration
- meteorological certification
- multiplayer

The goal is a physically coherent, perceptually convincing rain-on-glass simulation whose water, atmosphere and sound arise from the same underlying rain process.