# Rainpane — Initial Product Specification

## 1. Product summary

Rainpane is a browser-based rain-on-glass ambience simulator.

The user looks through a virtual pane of glass at a chosen scene. Rain strikes the pane, accumulates into beads, merges into larger drops and rivulets, and runs under gravity. The visual simulation is paired with layered rain audio so the experience can range from a quiet drizzle to a heavy storm.

The core idea is simple:

```text
scene behind glass
+ physically inspired rain-on-glass water
+ reactive rain sound
= relaxing atmospheric simulation
```

The experience should be enjoyable even when the user does nothing except watch and listen.

---

## 2. Core use cases

### A. Ambient relaxation

The user chooses a scene, sets the rain level, enables sound, and leaves the simulation running.

### B. Personal scene

The user selects a local photo so the rain appears to fall on a personally meaningful view.

### C. Live view

Optional camera mode places a live device-camera scene behind the virtual wet pane.

### D. Physical toy

On supported mobile devices, tilting or rotating the device changes the runoff direction according to gravity.

---

## 3. Primary UX

1. Open Rainpane.
2. A default built-in scene appears immediately.
3. The glass already has light rain / a few beads so the product feels alive.
4. User adjusts rainfall intensity.
5. New impacts appear at a corresponding rate and size distribution.
6. Some impacts remain pinned.
7. Nearby drops merge or are fed by later impacts.
8. Once sufficiently large, a drop starts to run.
9. The moving drop collects water and can become larger and faster.
10. Nearby rivulets can merge into one main flow.
11. Wet trails remain and influence later runoff.
12. User may switch scene or sound without resetting the entire atmosphere unless desired.

---

## 4. Scene modes

### Built-in scene

At least one attractive default image or generated scene should ship with the app.

Good candidates:

- warm city lights at night
- blurred street / cafe lights
- quiet residential window view
- neutral dark landscape

The scene should support the glass effect rather than compete with it.

### Local image

Use a local file picker.

Requirements:

- image stays local in the browser
- no upload
- no server processing
- object URL / in-memory representation may be used
- clear/revoke the old object URL when replacing it

### Camera mode

Optional for the first playable build.

If implemented:

- explicit user permission
- selectable front/rear camera if practical
- no capture
- no recording
- no upload
- stop tracks on exit/hidden state

---

## 5. Rain intensity model

The user should perceive a continuous weather progression rather than a single particle-count slider.

Suggested semantic levels:

```text
0  Dry / pause
1  Drizzle
2  Light rain
3  Rain
4  Heavy rain
5  Storm
```

A continuous slider may interpolate between them.

Each intensity level affects multiple parameters together:

### Impact rate

Higher intensity -> more impacts per second.

### Incoming drop-size distribution

Drizzle favors tiny droplets.

Storm allows a broader distribution with more medium/large impacts.

### Surface-water accumulation

Heavier rain deposits more mass per second.

### Coalescence frequency

More water causes more frequent merges naturally.

### Runoff density

Heavy rain should create several active runoff channels without degenerating into uniform vertical stripes.

### Audio

Ambient density, glass taps, runoff texture, wind/thunder probability may all increase.

---

## 6. Water state representation

Rainpane should not represent all water as independent visible particles.

Use a hybrid state model.

### Surface water height map

```text
water[x,y]
```

Represents unresolved thin film, small ridges, tiny beads below rendering threshold, and residual trail water.

### Wetness / trail memory

```text
wet[x,y]
```

Represents persistent wet glass / reduced pinning. It may decay more slowly than free water.

### Flow connectivity map

```text
flowId[x,y]
```

Identifies connected active/recent rivulets and supports body-level merging.

### Active flow heads

A bounded set of macroscopic objects:

```text
id
x, y
mass
vx, vy
pinned
age
footprintRadius
trailWidth
```

The visible drop at the bottom of a streak is the front/head of a connected body.

---

## 7. Incoming rain impacts

Rain events originate outside the pane and strike the glass.

Each event has conceptually:

```text
x, y
mass
impact velocity / strength
```

For v0.1 the event distribution may be heuristic rather than meteorologically exact.

On impact:

1. add mass to local surface water
2. possibly enlarge a nearby pinned bead / active collector
3. possibly form a new pinned visible bead if local mass exceeds threshold
4. disturb local water slightly according to impact energy
5. update optical water state

Do not instantly convert each impact into a long moving streak.

---

## 8. Pinned droplets

Small droplets should commonly stick to the glass.

A bead may remain pinned until one or more of these happens:

- additional impacts feed it
- nearby thin film drains into it
- another drop merges with it
- device orientation increases the in-plane gravity component
- it encounters a wetter / lower-pinning region

This waiting behavior is important to a convincing rain window.

---

## 9. Mass and visual size

Visible size must derive from water mass.

Conceptually:

```text
radius = visualScale * mass^k
```

with a sub-linear exponent suitable for the 2D projection.

Exact physical units are not required, but these rules are:

- no unexplained radius growth
- merge adds mass
- collecting surface water adds mass
- leaving residual trail water removes a small amount of mobile mass

---

## 10. Coalescence and merge

This is a core acceptance requirement.

### Head-head merge

When two visible heads touch or nearly touch, merge.

### Head-body merge

When a moving head intersects another active rivulet/trail, join the systems.

### Body-body merge

When connected wet regions touch, they may become one flow even if the two visible heads were not directly colliding.

After merge:

- conserve approximately total mass
- preserve sensible weighted momentum
- select a dominant downstream head/front
- unify flow connectivity / ID
- render a smooth wider transition rather than crossing lines

Expected visual result:

```text
| |      |\
| |  ->  | \
| |      |  O
```

Two nearby streams should tend toward one main stream when they physically connect.

---

## 11. Runoff growth

A descending drop should usually not remain the same size forever.

A moving head collects:

- thin surface water in its swept region
- pinned beads it intersects
- active drops/rivulets it merges with
- new impacts near its body

Therefore a runoff head may visibly become larger as it moves downward through a wet pane.

The effect should be noticeable but not cartoonishly explosive.

---

## 12. Speed / mass coupling

Small mobile drops should creep slowly.

Larger drops should generally move more readily and achieve a higher terminal speed because increased gravity drive overcomes contact-line resistance more effectively.

Conceptually:

```text
drive ~ mass * gravityAlongPane
resistance ~ pinning + contact-line drag
```

Use damping to reach a terminal velocity.

Desired observable sequence:

```text
small bead: pinned
small drop: slow creep
medium drop: clear descent
large merged drop: faster runoff
```

---

## 13. Trail behavior

A moving head leaves a connected rivulet behind it.

Trail properties:

- narrower than the largest head
- contains residual water
- remains wet after the head passes
- lowers future pinning / drag
- attracts later runoff
- can be joined by neighboring drops
- slowly thins and becomes less optically strong

A trail must exist in the simulation state, not only the renderer.

---

## 14. Surface heterogeneity

Glass should have subtle persistent microscopic variation.

A stable random/blue-noise map may affect:

- pinning strength
- slight path meandering
- preferred nucleation sites

The effect must remain subtle. Gravity and accumulated water dominate.

Do not add frame-to-frame random wobble that makes the glass look alive.

---

## 15. Gravity / device orientation

Reuse the proven Fog Mirror DeviceMotion behavior as the initial implementation reference.

Requirements on supported mobile devices:

- upright -> physical down
- diagonal tilt -> diagonal runoff
- right edge down -> runoff right
- left edge down -> runoff left
- nearly flat -> very weak in-plane runoff

Use low-pass filtering so hand tremor does not shake the water.

Do not duplicate screen orientation transforms if DeviceMotion is already in the current iPad screen coordinate convention.

Desktop fallback:

```text
gravity = screen-down
```

---

## 16. Rendering architecture

Rendering should be driven by the water state.

### Background pass

Draw selected scene / photo / camera.

### Glass-water distortion pass

Use gradients/normals from the water height field plus active flow geometry to distort/refract the scene.

### Droplet and rivulet shading

Add subtle:

- partial Fresnel highlights
- contact meniscus contrast
- local magnification/refraction
- elongation in the direction of motion

### Avoid

- complete gray outlines
- opaque black trails
- identical circular drops
- uniform line widths
- disconnected particle sprites that ignore the height field

---

## 17. Audio specification

Rainpane audio should feel spatially layered even if v0.1 uses simple stereo assets.

### Layer A — ambient rain

Continuous broad rain texture outside the glass.

Intensity changes:

- loudness
- density
- high-frequency detail
- optional wind presence

### Layer B — glass impacts

Short close taps/patters representing nearby drops hitting the pane.

Use randomized scheduling, variation, or multiple samples so repetition is not obvious.

Impact density should roughly track the simulated rain rate.

### Layer C — heavy runoff / storm bed

Introduced progressively at heavier intensity to avoid making drizzle sound like a waterfall.

### Optional Layer D — thunder

For storm mode later.

Possible behavior:

- rare lightning flash
- delayed thunder according to randomized virtual distance
- prevent frequent repetitive thunder

### Audio lifecycle

- audio starts only after user interaction
- user can mute immediately
- hide/pause should reduce or suspend audio work
- no microphone needed for normal Rainpane

---

## 18. UI

Keep controls visually quiet.

Suggested controls:

```text
Rain:  [────●────]
Scene: [Built-in] [Photo] [Camera]
Sound: [On/Off]
```

On small screens controls may collapse into a bottom/top drawer.

After several seconds without interaction, nonessential controls may fade and return on tap.

Do not make the experience resemble a camera app or settings dashboard.

---

## 19. Touch interaction

v0.1 does not require direct manipulation of every drop.

Optional interactions later:

- tap glass to shake/dislodge local drops
- drag finger to wipe a dry path
- flick to disturb runoff

These should not delay the core ambient experience.

---

## 20. Performance targets

Primary hardware target: modern iPhone/iPad Safari.

Target:

- stable realtime animation
- 60 fps when practical
- stable 30 fps acceptable under heavy rain

Implementation guidance:

- simulate water maps at lower resolution than display
- bound flow-head count
- merge aggressively rather than letting active objects explode in count
- use spatial/flow-ID data for connectivity
- decouple render resolution from physics resolution
- clamp `dt`
- pause hidden tabs

---

## 21. Privacy

Rainpane requires no backend.

### User photo

Never upload or persist remotely.

### Camera

If supported:

- permission from explicit action
- view-only
- no screenshot
- no recording
- no blob/video export
- no frame upload
- stop tracks when hidden/disabled/leaving

### Audio

No microphone required.

---

## 22. Suggested development milestones

### Milestone 1 — visual rain prototype

- background scene
- rain intensity control
- incoming impact events
- simple pinned beads
- no advanced optics required

### Milestone 2 — real surface water

- water height map
- pinned droplet growth
- local mass conservation
- residual wetness

### Milestone 3 — runoff flows

- active flow heads
- gravity
- pinning/depinning
- mass-speed coupling
- trail deposition

### Milestone 4 — merge topology

- head-head merge
- head-body merge
- body-body merge
- dominant downstream flow selection

### Milestone 5 — optics

- height-field normals
- refraction
- continuous rivulet shading
- improved highlights

### Milestone 6 — ambience

- layered audio
- local scene photo
- optional camera
- optional lightning/thunder

---

## 23. v0.1 acceptance tests

### Physics

1. Light rain produces mostly small pinned beads.
2. Increasing rain creates more impacts and greater surface-water accumulation.
3. A bead grows when new water reaches it.
4. Two contacting beads merge and approximately conserve mass.
5. A sufficiently large bead depins and starts moving.
6. A moving drop collects water and becomes larger while descending through a wet region.
7. A larger flow can move faster than a smaller flow.
8. Two close connected rivulets can merge into one main runoff path.
9. Moving water leaves residual wet trails.
10. Later drops preferentially reuse or join wet trails.
11. Mobile gravity direction follows physical device orientation.
12. Nearly flat orientation substantially reduces flow.

### Rendering

13. Drops refract/distort the scene rather than looking like outlined stickers.
14. Moving rivulets visually connect to their heads.
15. Heavy rain does not become a screen full of identical parallel lines.

### Experience

16. User can vary rain from drizzle to heavy/storm.
17. At least one built-in scene works immediately.
18. User can choose a local photo without uploading it.
19. Audio has separate ambience and glass-impact behavior.
20. Sound can be muted.
21. App remains usable as a static GitHub Pages site.

---

## 24. Research / implementation references

The physics design should draw from the same water-on-glass concepts already identified during Fog Mirror research:

- Kai-Chun Chen, Pei-Shan Chen, Sai-Keung Wong. **A heuristic approach to the simulation of water drops and flows on glass panes.** *Computers & Graphics* 37(8), 2013, 963–973. DOI: `10.1016/j.cag.2013.08.004`.
  - Relevant concepts: surface height map, flow fronts, residual water, flow/drop merging, flow connectivity.

- **Modeling the effects of contact angle hysteresis on the sliding of droplets down inclined surfaces.** *European Journal of Mechanics B/Fluids* 48, 2014, 218–230. DOI: `10.1016/j.euromechflu.2014.06.003`.
  - Relevant concepts: pinning, advancing/receding contact angles, hysteresis resistance, sliding velocity.

- `frmlinn/raindrops-v2`
  - Useful implementation reference for separating 2D rain/condensation simulation from optical refraction rendering.

These references inform architecture and qualitative behavior. Rainpane does not need to reproduce full CFD or any paper algorithm exactly.