# Rainpane

Rain striking and running down a pane of glass, with a forest path at night
behind it. Three systems, all consequences of one rainfall:

1. **The water on the glass** — impacts, pinned droplets, coalescence,
   depinning, runoff and rivulets, on the gravity your device actually reports.
2. **The sound** — synthesised from the same impacts the solver emits. Nothing
   is sampled or looped.
3. **The air outside** — heavy rain takes the distance away and leaves the path
   at your feet sharp, because the optical path through rainy air grows with
   distance.

The specifications are external design requirements and are not authored here:
[`SPEC.md`](SPEC.md) for the water, [`AUDIO_SPEC.md`](AUDIO_SPEC.md) for the
sound, [`VISIBILITY_SPEC.md`](VISIBILITY_SPEC.md) for the atmosphere, and
[`AGENTS.md`](AGENTS.md) for the rules and the research hierarchy this is held
to. This README is the implementation's own record: what was built, what was
measured, and what turned out to be wrong on the way.

## What is in this build

- **Rainfall as a rate, not a spawn counter.** A Marshall–Palmer exponential
  spectrum, weighted by fall speed so it is the *arrival* spectrum, sampled
  exactly as a gamma variate. The loop is driven by the volume owed, so event
  count and drop size cannot drift apart from the mass flux. The scale runs from
  drizzle at half a millimetre an hour to a tropical downpour at 180, and how
  much of that a *vertical* pane catches rises with the rate, because hard rain
  comes with hard wind and what reaches a window is driving rain.
- **A staged impact.** The drop spreads into a lamella several times its own
  diameter — how far follows the Weber number — then the rim retracts and it
  settles. The water is on the pane from the first frame; only its *shape*
  changes, by taking the previous footprint back and writing the new one.
- **A continuum pane.** Thickness, wetted memory, contact-line heterogeneity and
  flow ownership on one grid. Film below the holding thickness is pinned and
  does not move at all; only the excess creeps, and it creeps by bilinear
  scatter rather than by snapping to whichever neighbour is most nearly
  downhill, which is what makes a diagonal rivulet a staircase.
- **Surface tension in both of its roles.** Deep water levels like a puddle;
  thin film is unstable and gathers towards its thickest neighbour, which is
  what turns a wetted pane into separate beads. Adhesion holds a residue that
  neither term can move.
- **Beads, with hysteresis.** A bead breaks away when gravity beats its contact
  line, and the contact line keeps resisting while it moves — which is where
  "a heavier drop runs faster" actually comes from. Starting and continuing are
  different thresholds. Glass holds a bead well over two millimetres across, so
  a standing population of pinned drops builds up; only the ones that grow past
  that streak away.
- **Speeds that are actually water's.** The drive is real gravity, the drag is
  integrated in closed form rather than as `v -= v * drag * dt`, and the film
  moves at the Nusselt velocity `v = 3270 h²` mm/s. All three matter: a reduced
  drive cannot tell a bead from a rivulet, the explicit damping settles at a
  third of the true terminal speed, and a fraction-per-frame film nudge makes
  every thickness ooze at the same rate. Together they were the difference
  between water and something gelatinous.
- **Coalescence through a neck.** Two bodies that come close bridge first: they
  become one hydraulic body while still drawn as two, then combine, and the
  combined drop rings along the line they met on before it settles.
- **Rivulets.** Variable width and strength following the head's mass, residual
  film and wetted memory left behind, ownership carried by the water, and later
  runoff steered into channels that are already wet.
- **Gravity copied verbatim from Fog Mirror**, where it was verified on the
  target iPad. `AGENTS.md` freezes it and this build does not touch it.

## What is deliberately not in it

No camera mode, no local-image mode, no thunder, no wind, no airborne rain
streaks, and no interface beyond one intensity slider, a mute and a diagnostics
readout.

Two things are half-built on purpose. The audio is layers A–C only — the exterior
bed and the impacts — because runoff and edge drainage must be driven by measured
solver flux rather than guessed thresholds; see **Sound**. And the atmospheric
veil has full fidelity only for the built-in scene, because a depth mask is
authored per scene and an arbitrary photograph has no trustworthy depth; see
**Seeing through rain**.

**The impact timbre is not finished.** It has been reported twice from the device
— once as "a lot of little explosions", once as "like castanets" — and the
current splash-led model is a response to the second that has not yet been heard.
Every metric it can be held to passes; none of them is an ear.

(The rain streaks and light specks visible in the picture are in the scene
photograph itself, not drawn by this code.)

## Sizes are physical

Every size in this project is declared in millimetres and divided by the cell
size. The one number that is not physics is the **view scale**: the pane is
shown at 15 CSS pixels per millimetre of glass, so the screen is a close-up of a
patch about the size of a playing card. At life size a two-millimetre raindrop is
six pixels across and there is nothing to look at.

The grid follows a physical cell size — about 0.22 mm of glass per cell — rather
than a fixed cell count, so a phone and a tablet simulate the same millimetre at
the same resolution instead of a phone quietly paying for twice as much of it.

## Mass is conserved exactly

Water arrives by rain, leaves off the edge of the pane or by evaporation, and
does nothing else. The harness checks

```text
landed  ==  on the glass  +  ran off  +  dried
```

and it returns zero, not nearly zero. Each stage was checked on its own
(creep, capillarity, the whole surface tick, the flows) and each is exactly
conservative.

Measured on a tablet-sized pane, twenty seconds of a downpour:

```text
landed 4305 mm3 = on glass 271 + ran off 4007 + dried 28   (unaccounted 0.000%)
```

## What was measured

| | |
|---|---|
| drizzle drop size | median 0.44 mm, 90th percentile 0.82 mm |
| downpour drop size | median 1.05 mm, 90th percentile 2.5 mm, largest 5.0 mm |
| water arriving, drizzle → downpour | 0.2 → 215 mm³/s, about 70 drops a second at the top |
| the pane at 180 mm/h | 99% wetted, a quarter of it running as a sheet rather than beads |
| impact, 2.2 mm drop | spreads to 4.2 mm radius, retracts to 2.0 mm, over ~12 frames |
| a 1.0 mm bead | pinned, does not move |
| a 2.4 mm drop | runs at 164 mm/s — crosses the pane in half a second |
| a 3.8 mm drop | runs at 363 mm/s |
| a 0.4 mm film with no drop leading it | advances 29 mm in a second, and slows as it thins |
| hysteresis | a bead that started moving at 2.6 mm across keeps moving at 2.0 mm |
| a lone drop on even glass | falls 73 mm and drifts 0.0 mm sideways |
| two beads 5 mm apart | neck at 0.07 s, one body at 0.08 s, then ringing |
| six drops onto a rivulet | 100% of the water they leave becomes part of that rivulet |
| rivulet channels | 83 of them, 0.2 to 6.6 mm wide |
| after heavy rain | 27% of the pane wetted, 54% still carrying residual film |
| gravity | upright → down, right edge down → right, left edge down → left, flat → still |
| gravity, all four display orientations, both device families | runs down in all eight |
| cost, downpour | 4.5 ms/step and 1.1 ms/frame on a tablet-sized pane, 1.9 and 0.5 on a phone |

## Sound

The rain you hear is the rain on the glass. Every tap with its own identity is a
drop the simulation really landed, carrying that drop's energy and the wetness of
the spot it hit; `impact.js` emits the event and `audio.js` is the only listener.
It is all synthesised — no samples, no loops — so the timbre moves continuously
with drop size, energy and film depth instead of stepping between recordings.

**The pane you hear is not the patch you see.** The screen is a close-up of about
37 cm², and a patch that size is almost silent: even a downpour lands only about
a hundred drops a second on it, which reads as a rattle. So the acoustic pane is
a whole window, 1.2 m², three hundred-odd times the visible area. That larger
population is never instantiated — a second rain process running beside the one
on screen is exactly what `AGENTS.md` forbids. It is only a count, and it sets
how dense the unresolved texture is.

Big and cheap are independent choices, and both are deliberate. Laminated or
double glazing — a good hotel window — is a constrained damping layer: it is
built to kill the pane's own modes and to stop the rain field outside, so it
gives you a dull thud and nothing else. One sheet of 4 mm float glass in a
poorly sealed frame rings, and lets the outside through.

### What a listener hears is energy, not drops

This is the correction that mattered most, and it came from a real device: in
light rain the pane was a continuous sheet of hiss, when light rain on a window
is distinct ticks. A sheet of sound has to be *made of* drops, not laid
underneath them.

Both beds had been keyed to the rainfall rate through fitted curves. But
loudness does not follow how many drops fall, it follows how much energy they
bring, and on a Marshall–Palmer spectrum those are very different curves.
Drizzle puts 562 drops a second on the acoustic window and a downpour puts
24 000 — only forty times more — while the energy ratio is nearer four thousand,
because impact energy goes as roughly the fourth power of diameter and drizzle's
drops are 0.46 mm against a downpour's 1.28 mm.

So everything now follows one measured quantity: the acoustic power actually
landing on the window, summed from the impacts the solver already emits.
Incoherent sources add in power, so the amplitude is its square root — which is
also the entire justification for using filtered noise as the texture. It is not
standing in for the taps; it *is* what several hundred random taps a second sum
to. Below that density the drops are voiced individually and the texture is
correspondingly silent. It comes out like this:

| | drops/s on the window | taps voiced | texture |
|---|---|---|---|
| Drizzle, 0.5 mm/h | 562 | 9/s | **exactly zero** |
| Light, 3 mm/h | 1 446 | 35/s | barely there |
| Rain, 10 mm/h | 2 289 | 37/s | present |
| Heavy, 35 mm/h | 7 791 | 37/s | a soft wash |
| Downpour, 180 mm/h | 24 054 | 36/s | a sheet |

Separately, a `e < 0.02` audibility gate had been silencing *every* drop drizzle
produces, so light rain had no individual drops in it at all — only the hiss.
That gate is now three hundred times lower.

### It has to sound like rain, not like an instrument

Two device reports, in sequence, and the second one was caused by the fix for
the first. At a bandpass Q of 3.4 the taps came back as "a lot of little
explosions". Raising Q to 11 fixed the harshness — by turning the click into a
*note*, which is not the same thing, and it came back as "like castanets,
honestly nowhere near".

The mistake underneath both was modelling the wrong event. A Q of 11 at 2.5 kHz
is a fingernail on glass: hard, point-like, elastic. A raindrop is soft, spread
over a millimetre or two, and most of what you hear is not the plate at all —
it is the splash, the lamella thrown outward and the film slapping back. That is
broadband, low, and over in a few milliseconds. The pane's resonance is a colour
on a noise burst, not a note. So: 1150 Hz at a Q of 2.2, decays of 6–22 ms
rather than 20–75, and the splash promoted from a whisper at 0.22 under a
ringing plate to the part that carries the tap.

Two things beyond the resonance mattered as much:

**The taps were being chosen weighted by energy**, which makes almost every
voiced drop a big one, so they all arrived at much the same prominence — and a
stream of impacts at one level, however irregularly spaced, is a percussion
instrument. It also double-counts, since how loud a drop *sounds* is already
decided by its energy. Weighted by the square root instead, the voiced taps now
span 13× in level between the 10th and 90th percentile.

**The pitch spread was ±18%**, so a stream of taps read as one repeated sound.
It is ±35% now, which is nearer what landing at different places on a pane does.

And two measurement traps worth recording:

- The splash runs through a *lowpass* while the ring runs through a narrow
  bandpass, so the same gain is not the same loudness — measured, the lowpass
  passes 2.16× as much. Mixing the splash up to where it belonged also made
  every tap two and a half times louder until that was trimmed out.
- Spectral flatness measured over the full 0–22 kHz reports how **dark** a sound
  is, not how tonal. Making the taps duller looked like making them noisier. It
  is measured over 200 Hz–6 kHz now, the band the sound actually occupies.

### It also has to not sound like static

Reported from the device as "a lot of little explosions, rather unpleasant" —
and the first thing to check was clipping, which it was not: peaks reached 0.27
of full scale. What the measurement did show was a crest factor of 8 to 13,
which is the signature of isolated sharp transients over near-silence. Three
causes, two of them physically wrong rather than merely ugly:

**A resonance with a Q of 3.4 is not a resonance.** It is a click with a slight
colour. Mounted glass really does ring — its modes are lightly damped by the
frame, not smeared into broadband noise. Q is 11 now, and there is a second mode
at an inharmonic ratio so that a struck pane does not read as a beep.

**The contact was a highpass at 4.2 kHz carrying more level than the ring.** That
is both the harshest possible choice and backwards: a water drop is soft and its
contact lasts hundreds of microseconds, so it cannot put much energy that high at
all. It is a lowpassed whisper under the onset now.

**Forty taps a second, not a hundred and fifty.** 150 is well past the density at
which separate impacts fuse, so what it produced was a machine-gun of transients
rather than rain. Past 40 the energy goes to the texture, which is what a sheet
of rain is.

The attack also went from 0.8 ms to 2.5 ms; on a broadband source 0.8 ms is a
click in its own right, and nothing percussive is lost by saying a struck plate
takes a few milliseconds to reach full amplitude.

| | before | after |
|---|---|---|
| crest factor, heavy rain | 12.8 | 5.4 |
| crest factor, downpour | 5.9 | 4.6 |
| a dry tap's brightness | 6 899 Hz | 2 860 Hz |
| voices at a downpour | 26 of 26 | 7 of 26 |
| cost at a downpour | 0.22 ms/frame | 0.11 ms/frame |

### Four more that were structural, not tuning

**A tap count taken from the rain slider.** A drop that demonstrably hit the
glass made no sound whenever the slider said it shouldn't have. The sound had
stopped following the simulation and started following a number beside it.
Nothing in the engine consults the rate any more.

**A voice budget counted by callbacks.** `onended` only fires when the main
thread is free, so during a long frame the count stuck at its ceiling and the
engine went silent exactly when the rain was heaviest — 6 taps voiced in six
seconds of downpour. Voices are counted by their scheduled end times now.

**Beds that decayed towards silence.** `setTargetAtTime` approaches a value
without arriving, so stopped rain hissed forever at 0.0016. Zero targets are
pinned, as mute already was.

**A bandpass whose level moved with its frequency.** Wet glass measured *louder*
than dry glass while every deliberate term said the opposite: the ring filter
passes more the lower and wider it is set, so making a tap duller quietly made
it louder. The correction exponents are measured on the actual noise buffer
(level goes as `f^-0.26 · Q^-0.45`) — deriving them from an idealised bandpass
on white noise gives `-0.5, -0.5` and overshoots enough to leave the bug in
place.

### What the sound was measured at

Level and timbre are rendered offline, one tap at a time, in `rp-timbre.mjs` and
`rp-loud.mjs`. Measuring a single tap through the live context while the beds
and the page's own rain were running gave answers wrong by more than the effect
being measured — twice.

| a 2 mm drop landing on | level | brightness | noisiness | peak/median |
|---|---|---|---|---|
| dry glass | 0.00134 | 1 789 Hz | 0.21 | 13 |
| damp glass, no film | 10% quieter | 11% darker | 0.15 | 15 |
| a 0.25 mm film | 22% quieter | 17% darker | 0.14 | 20 |
| a 0.6 mm film | 55% quieter | 24% darker | 0.11 | 25 |

A drop into standing water is the one thing here that makes the splash *louder*
rather than quieter, which is why wet glass should read as duller and thicker
rather than simply fainter.

| | |
|---|---|
| before the first tap | no `AudioContext` is created at all |
| rain stopped | falls to exactly zero, within a second of a downpour ending |
| loudness against impact energy, ×0.01 → ×16 | 0.06, 0.32, 1.00, 2.78, 3.08 — tracking `e^0.55` |
| a downpour | 112 drops/s on the visible patch, 36/s voiced, ~39 000/s folded into the texture |
| voices at a downpour | 7 of a budget of 26 |
| peak level at a downpour | 0.20 of full scale — no clipping anywhere |
| cost | 0.11 ms/frame at a downpour, against 5.1 ms for the water |
| mute | silent, and it stays silent |
| hidden then returned | 200 impacts had queued, 0 were replayed |

### What is not in it yet

Layers D and E of `AUDIO_SPEC.md` — runoff/sheet texture and boundary drainage.
Both must be driven by measured solver flux rather than by the rain slider, so
`surface.metrics()` reports moving-water fraction and depth already; the
thresholds get set from those numbers, not guessed. There is also no sample
layer: `AGENTS.md` prefers a procedural/sample hybrid, and this build is pure
synthesis by request.

## Seeing through rain

Heavy rain does not make a window blurry. It makes *distance* hard to see, because
the optical path through rainy air gets longer the further away a thing is. So
the deep forest is swallowed while the path at your feet stays sharp. This is
Part 3, specified in [`VISIBILITY_SPEC.md`](VISIBILITY_SPEC.md), and it is
atmosphere *outside* the pane — nothing to do with the water on the glass.

### The depth is measured, not invented

A flat photograph has no geometry, and the spec asks for an authored depth mask
rather than a pretence of one. But this scene turned out to contain its own
ruler: nine lanterns, all roughly the same physical object, so their apparent
size on screen measures their distance — size goes as 1/z.

Fitting a ground plane `z = 1/(v - v_horizon)` to their measured core areas puts
the horizon at **v = 0.389**, and that one fitted number then predicts the
remaining lanterns' sizes to within about ten per cent. Everything the lanterns
cannot speak for — the canopy above the horizon, the vegetation flanking the
path, which pixels count as near ground — is authored by hand in
[`tools/make-visibility-mask.py`](tools/make-visibility-mask.py), as code rather
than as a binary somebody has to trust.

The result, and the middle two rows are the whole point:

| | depth | |
|---|---|---|
| near path, bottom of frame | 0.01 | |
| **near canopy, top-left corner** | **0.04** | overhanging leaves, the closest thing in frame |
| **sky gap, top-centre** | **0.98** | almost the same screen height, fifty metres further |
| left trunks, mid frame | 0.20 | |
| far lanterns | 0.53 | |
| deep forest centre | 1.00 | |

A model that took screen height for distance would fog those overhanging leaves
along with the deep forest. That is why §5 forbids it, and this scene is exactly
the case it forbids it for.

### Finding the lamps without haloing every bright pixel

§8 says distant lamps get halos and near reflections do not. The wet path is
covered in bright reflections, so they had to be told apart: lanterns have
blown-out warm cores, and a reflection sits directly beneath a brighter source
in the same narrow column. That leaves nine lanterns from seventy-two bright
blobs.

### What it does at each intensity

Contrast kept, against no veil at all — measured, with the glass dry so that only
the atmosphere is being tested:

| region | Drizzle | Rain | Heavy | Storm | Downpour |
|---|---|---|---|---|---|
| near path | 1.00 | 1.00 | 1.00 | 1.00 | **1.00** |
| near canopy | 1.00 | 1.00 | 1.00 | 1.00 | 0.98 |
| mid path | 1.00 | 1.00 | 0.98 | 0.93 | 0.81 |
| far lanterns | 1.00 | 0.98 | 0.91 | 0.75 | 0.46 |
| deep forest | 1.00 | 0.95 | 0.77 | 0.49 | **0.28** |
| sky gap | 1.00 | 0.95 | 0.78 | 0.48 | **0.13** |

Halo brightness added in a ring just outside each lamp:

| | Rain | Heavy | Storm | Downpour |
|---|---|---|---|---|
| far lantern | +0.006 | +0.031 | +0.081 | **+0.170** |
| near lantern | +0.000 | +0.000 | +0.001 | **+0.002** |

### Two things that were structural

**The halo was cancelling itself.** Scattered lamp light is added in exactly the
place the extinction is taking light away, and at first the two came out level:
the ring around a far lamp measured *darker* with the veil on than with it off.
A halo also has to be wide — a tight mask puts the added light precisely where
it is being removed. Widening the mask and raising the strength to 1.15 gives
the numbers above, where the far lamp gains eighty-five times what the near one
does.

**The veil belongs inside `scene()`, not over it.** Refraction is implemented by
offsetting the sample coordinate, so a veil applied afterwards would leave the
distance undistorted behind every drop. Sampled inside, a drop refracts a
background that is already softened by distant rain — which is the render order
the spec asks for, and it costs nothing extra.

### Turning it off

Tap the diagnostics readout. The veil has to be separable from the glass water
to be judged at all, so it is, and `veil on/off` shows in the panel with the
current extinction.

The 2D fallback path has no veil: it exists so the physics can still be judged
where WebGL will not run, and it has no scene refraction either.

## Which way is down

The Fog Mirror DeviceMotion mapping was copied verbatim and is still frozen, but
it was only ever verified in portrait, and it was missing one thing. DeviceMotion
reports in the device's *fixed* frame, which is the screen's frame only while the
display is in its natural orientation. Rainpane relayouts when you turn the
device, so past that point the two disagree by exactly `screen.orientation.angle`:
a quarter turn sends the water sideways, and a tablet held upside-down sends it
straight **up**. That is how it was found, on a device.

### First, check whether the display is rotating at all

Device readings ended a long argument. On a rotation-locked iPad,
`screen.orientation` stays `portrait-primary` at angle 90 and the viewport stays
portrait **however the tablet is held** — so nothing about the display rotation
is ever exercised, and the correction below is correctly a no-op:

```text
held upright              raw (-0.25, -9.86)  ->  gravity ( 0.01,  1.00)  down
turned, right edge down   raw (-9.82,  0.07)  ->  gravity ( 1.00, -0.00)  right
turned, left edge down    raw ( 9.74, -0.07)  ->  gravity (-1.00,  0.01)  left
```

All three are correct. With the display locked in portrait and the tablet turned
sideways, the screen's right or left edge **is** the physically lowest edge, and
water running toward it is gravity working — that is the entire premise. It only
*looks* wrong because the scene is painted on the screen and turns with it, so
water running downhill reads as running across, or up, the picture.

That distinction is worth surfacing rather than hiding: "the sensor mapping is
broken" and "the display is locked" look identical from the sofa. The **i** panel
says `ROTATION LOCKED` when the tablet is held a quarter-turn or more over while
the display still calls itself portrait.

With the lock **off**, the display really does rotate and the correction earns
its keep. Read off the device, turned a quarter to the right, and **confirmed
correct on device**:

```text
screen  angle 180  landscape-secondary  legacy -90
        1133x612  ->  read 180°  turn 270°
raw (9.61, -0.54)  ->  gravity (0.06, 0.99)  down
```

That reading is now a test case, and it is the only landscape ground truth in
the file — the harness cannot generate one for itself without assuming the
answer. All four device readings are checked: locked-portrait upright, locked
sideways both ways, and unlocked landscape.

It took four rounds, and three of them were spent on the wrong thing. Worth
naming what actually cost the time, because none of it was the physics: a
harness that validated the formula against its own assumption and so passed
while the device failed; a rotation lock that made a correct answer look wrong;
and a module cache that had the device running the previous build while the
diagnostics reported the new build's intentions. The one round that fixed it
was the one that started by reading numbers off the device.

### Which build am I looking at?

The **i** panel shows a build stamp, and every module is imported with a `?v=`
matching it. GitHub Pages serves modules with a cache lifetime and Safari holds
on to them hard, so a fix can be live on the server while the device quietly
runs the previous build — which cost two rounds here, debugging a bug that was
already fixed. A query string makes each version a different URL, so there is
nothing to invalidate.

**And the "together" was where it went wrong.** Bumping it by hand meant
`index.html` and `app.js` reached `20260830c` while `flows.js`, `impact.js` and
`render.js` were still importing their siblings at `20260830b` — which sat on
`main` until it was noticed from the Fog Mirror work. Measured in the browser:
`surface.js`, `flows.js` and `rain.js` were each **fetched twice**, once under
each version, 12 module requests for 9 files. Nothing was visibly broken —
`MM = 15` and `NONE = 0` are plain numbers, so the two copies agreed — but the
two halves of the build could go stale independently, which is worse than
everything going stale together: a fresh `app.js` beside a cached `surface.js`
behaves like neither version and reports the new one.

So it is not done by hand any more. `tools/stamp.mjs` at the repository root
sets one version across every module reference in an app, and with no argument
checks all three apps and fails if any version disagrees:

```sh
node --experimental-default-type=module tools/stamp.mjs rainpane 20260901a
node --experimental-default-type=module tools/stamp.mjs
```

`app.js` no longer declares its build as a bare constant either. It compares the
stamp it was built with against the `?v=` the browser actually asked for, and
says so when they differ, rather than reporting a version that is not running.
Bump it on every deploy — the tool checks that the version is *consistent*, not
that it *moved*.

### Then, the rotation itself

The first attempt at this fixed the tablet-upside-down case and broke portrait,
and the reason is worth writing down. **The two frames are measured from
different reference orientations.** CoreMotion's axes are fixed to the hardware
with +y toward the top of the device *in portrait*, on every iOS device.
`screen.orientation.angle` is measured from the device's **natural** orientation
— which is portrait on a phone but **landscape on an iPad**. So an iPad in
portrait reports 90, not 0, and rotating by the angle at face value turns the
water sideways in the one orientation that already worked.

So `rotation()` works out which angle value *means* portrait on this device, from
the shape of the viewport, and measures from there. No device is special-cased,
and in portrait the result is zero on every device, so the frozen mapping is
untouched exactly where it was verified. `rp-orient.mjs` holds the screen upright
in each of the four display orientations, on each kind of device:

```text
                          portrait  landscape  portrait  landscape
phone   (natural portrait)   down    (device)     down   (device)
tablet  (natural landscape)  down    (device)     down   (device)

from the device:  locked upright       turn   0  -> down
                  locked, right down   turn   0  -> right   (lowest edge)
                  locked, left down    turn   0  -> left    (lowest edge)
                  unlocked, turned      turn 270  -> down
```

The landscape columns are **printed, not asserted**. Simulating one means
deciding what the accelerometer reads there, which follows from the very
relation under test — and that circularity is exactly why this harness passed
green while the device did not. Only portrait, where the frozen mapping was
actually verified, is checked; the real device readings above are checked too.

Fog Mirror's `src/orientation.js` has the same defect and the same relayout, and
has not been changed.

## Running it

It is a static page. Serve the repository and open `/rainpane/`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/rainpane/
```

On iOS the first tap is what grants motion access, so the start screen is not
decoration. The **i** button shows the live gravity vector and display rotation,
the rain rate, head and impact counts, the water budget, the audio and veil
state, and the build stamp — that readout is how any of this gets judged on a
device rather than in a screenshot. **Tapping the readout itself toggles the rain
veil**, so the atmosphere can be told apart from the water on the glass by eye.

Check the build stamp before reporting anything. Safari caches ES modules hard,
and a fix can be live on the server while the device still runs the previous
build.

## Where the code lives

| file | what it owns |
|---|---|
| `src/rain.js` | rainfall rate, drop-size spectrum, impact velocity |
| `src/impact.js` | the spread/retract/settle lifecycle of one drop |
| `src/surface.js` | thickness, wetted memory, pinning, creep, capillarity |
| `src/flows.js` | beads and rivulet heads: pinning, motion, trails, merging |
| `src/render.js` | optics: the rain veil, refraction, Fresnel rim, highlight, meniscus |
| `src/scene.js` | what is behind the pane, and its visibility masks |
| `src/gravity.js` | Fog Mirror's sensor read, plus the display rotation — now in both |
| `src/audio.js` | the beds, the impact voices, the acoustic pane |
| `src/app.js` | clock, layout, the controls |
| `tools/make-visibility-mask.py` | authors the depth / near-ground / lantern masks |

## Next

In rough order of how much they would change what you see and hear:

1. **The impact timbre.** The only open item that is actually wrong rather than
   merely absent. Needs an ear, not another metric — and if one more blind pass
   misses, an A/B switch to compare candidates on the device in one sitting
   beats guessing across rounds.
2. **Audio layers D and E** — runoff texture and boundary drainage.
   `surface.metrics()` already reports moving-water fraction and depth so the
   thresholds can be measured rather than guessed.
3. **Airborne rain** — resolvable near streaks, which the visibility layer is
   explicitly separate from.
4. Local image and camera scenes, wind and thunder.

None of them should require changing the solver.
