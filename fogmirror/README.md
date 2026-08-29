# Fog Mirror

A steamed bathroom mirror on your screen. The front camera is the reflection, the
glass carries condensation, and a finger through it behaves like a finger through
real fog: it clears the mist and drags the water along with it, leaving clear
glass behind and a fat blob where you lifted off — which is where the drops
gather, bead, and run.

Nothing re-fogs by itself. What you wipe off stays wiped off until you press
Steam, and Fresh puts the glass back to an even sheet.

See [`SPEC.md`](SPEC.md) for the product specification, [`PHYSICS.md`](PHYSICS.md)
for the simulation model, and [`AGENTS.md`](AGENTS.md) for the rules this
implementation is held to.

## Nothing is captured

- The camera stream is attached to a `<video>` and uploaded to the GPU as a
  texture. It is never drawn to a 2D canvas, never recorded, never turned into a
  blob or a data URL, and never sent anywhere.
- `getUserMedia` is called with `audio: false`. No microphone, ever.
- Tracks are stopped — not paused — when the camera is switched off, when the
  page is hidden, and when you leave.
- No network request is made after the page loads. The test suite fails if one is.

## Running it

```sh
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/fogmirror/
```

The camera needs a secure context: `localhost` counts, and on a phone you need
HTTPS, which GitHub Pages provides.

## How it works

The glass is four fields on a coarse grid — about 144 cells across the shorter
side — plus a small number of moving water heads.

| Field | What it is |
| --- | --- |
| `fog` | Microscopic condensation: the blur and the milkiness |
| `water` | Liquid height. This is the real, only source of water mass |
| `wet` | Longer-lived memory of wet glass; it changes pinning, steering, and how a trail reads |
| `flowId` | Which connected body of water owns a cell |

| File | Role |
| --- | --- |
| `src/condensation.js` | The fields: steam, evaporation, coarsening, downhill sag, and wiping |
| `src/droplets.js` | Flow heads: collection, pinning, motion, trails, merging |
| `src/render.js` | Optics: refraction, highlight, haze. Reads the fields, never writes them |
| `src/orientation.js` | Gravity. Frozen — see below |
| `src/camera.js` | Camera lifecycle |
| `src/input.js` | Pointer paths, including lift-off |
| `src/app.js` | Clock, layout, controls |

### Water is never invented

Every drop you see came from somewhere. Wiping converts part of the fog it
removes into liquid and gathers the water already there; a head drinks from the
height field; a moving head gives part of itself back as a trail; merging adds
two masses together. A drop cannot grow unless mass moved into it.

The books balance over three things, because the condensation is the reservoir:
the water on the glass, the mass in the moving heads, and the fog times what a
fully fogged pane is worth in liquid. Across a wipe and across minutes of running
water that total changes by **zero**, not nearly zero, and the tests check it. The
only ways out are evaporation and the small share that leaves on your finger; the
only way in is Steam.

That is why undisturbed fog never beads: fog alone is not liquid, and there is no
path from it to a visible drop that does not go through a finger or through a
drop already running.

### The finger carries the water

A wet fingertip drags a meniscus along with it, so a stroke has a load. Each step
adds what it took to that load instead of laying it down; only what the finger
cannot hold comes off along the way, plus a trickle where the glass grips harder
than average. Lifting puts the rest down at the last point.

That is the difference between a swipe that leaves a comb of two dozen identical
drips down its whole length and one that leaves a clean streak with the water
gathered where your finger came off. A short swipe drops nothing along its length
at all; a long one starts shedding once the finger is full.

### A drop is the head of a body, not a sprite

The visible drop is the front of a connected body of water. Its radius comes from
its mass, so it grows visibly as it sweeps up film; its terminal speed rises with
mass, so a fat drop outruns a bead; its trail is real water that stays wet, lowers
the pinning resistance, and steers whatever comes down next.

Pinning uses separate start and stop thresholds — a drop that is already moving
does not re-pin the instant it slows — and the resistance drops on wet glass, so
a small bead can sit still while its neighbour runs.

Two rivulets a few millimetres apart pull towards each other and merge, because
in reality their wet halos bridge. Without that, nearby flows run to the bottom
side by side, which is the fastest way a simulation like this looks fake.

### The optics read the physics

There are no drop sprites. The renderer packs the fields into one small texture,
adds the heads to the water channel, and a fragment shader treats the gradient of
that channel as a surface normal: it refracts the camera behind it, catches a
highlight where the surface turns, and darkens the contact line at the edge. A
head and its trail are the same surface, so they cannot look disconnected.

Where there is water there is no mist, because liquid water absorbs the
condensation it displaces — which is why a wiped stroke is a clear window and a
trail is a clear streak.

### Gravity is frozen

`src/orientation.js` is left exactly as it was. Its mapping was verified on real
hardware, and `AGENTS.md` forbids changing it without a real-device test showing a
regression. The rewrite treats gravity as an input.

## Controls

- **Drag** anywhere to wipe.
- **Steam** re-fogs the glass without erasing the water or the wetness memory. Nothing else
  puts fog back: what you wipe off stays wiped off until you ask for more.
- **Fresh** starts over: every drop, streak and wet mark is gone and the glass
  carries one even sheet of new condensation. Steam adds to what is there;
  Fresh replaces it.
- **Camera** switches the reflection off and on.
- **i** shows the live gravity vector, head count and water totals — the readout
  that makes it possible to check the physics on a real device.
