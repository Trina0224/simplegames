# Fog Mirror

A steamed bathroom mirror on your screen. The front camera is the reflection, the
glass carries condensation, and a finger through it behaves like a finger through
real fog: it clears the mist, and it pushes the water it displaced to the
downhill edge of your fingertip, where it gathers, beads, and eventually runs.

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
| `wet` | Longer-lived memory of wet glass; it changes pinning and condensation |
| `flowId` | Which connected body of water owns a cell |

| File | Role |
| --- | --- |
| `src/condensation.js` | The fields: steam, evaporation, levelling, downhill sag, and wiping |
| `src/droplets.js` | Flow heads: collection, pinning, motion, trails, merging |
| `src/render.js` | Optics: refraction, highlight, haze. Reads the fields, never writes them |
| `src/orientation.js` | Gravity. Frozen — see below |
| `src/camera.js` | Camera lifecycle |
| `src/input.js` | Pointer paths |
| `src/app.js` | Clock, layout, controls |

### Water is never invented

Every drop you see came from somewhere. Wiping converts part of the fog it
removes into liquid and gathers the water already there; a head drinks from the
height field; a moving head gives part of itself back as a trail; merging adds
two masses together. A drop cannot grow unless mass moved into it, and the tests
check that a wipe deposits exactly what it picked up.

That is why undisturbed fog never beads: fog alone is not liquid, and there is no
path from it to a visible drop that does not go through a finger.

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
