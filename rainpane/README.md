# Rainpane — first physics prototype

Rain striking and running down a pane of glass, with a forest path at night
behind it. This build is the water only: impacts, pinned droplets, coalescence,
depinning, runoff and rivulets, on the gravity your device actually reports.

See [`SPEC.md`](SPEC.md) for the product specification, [`AGENTS.md`](AGENTS.md)
for the rules and the research hierarchy this is held to.

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

No camera mode, no local-image mode, no audio, no thunder, no wind, no airborne
rain streaks, and no interface beyond one intensity slider and a diagnostics
readout. The point of this build is that the water on the glass can be judged on
a real device; everything else can be added on top of a solver that is already
right.

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
| cost, downpour | 4.5 ms/step and 1.1 ms/frame on a tablet-sized pane, 1.9 and 0.5 on a phone |

## Running it

It is a static page. Serve the repository and open `/rainpane/`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/rainpane/
```

On iOS the first tap is what grants motion access, so the start screen is not
decoration. The **i** button shows the live gravity vector, the rain rate, head
and impact counts and the water budget — that readout is how the physics gets
judged on a device rather than in a screenshot.

## Where the code lives

| file | what it owns |
|---|---|
| `src/rain.js` | rainfall rate, drop-size spectrum, impact velocity |
| `src/impact.js` | the spread/retract/settle lifecycle of one drop |
| `src/surface.js` | thickness, wetted memory, pinning, creep, capillarity |
| `src/flows.js` | beads and rivulet heads: pinning, motion, trails, merging |
| `src/render.js` | optics: refraction, Fresnel rim, highlight, meniscus |
| `src/scene.js` | what is behind the pane |
| `src/gravity.js` | copied verbatim from Fog Mirror. Frozen |
| `src/app.js` | clock, layout, the one control |

## Next

The milestones in `SPEC.md` past this point: airborne rain, layered audio, local
image and camera scenes, wind and thunder. None of them should require changing
the solver.
