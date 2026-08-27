# Blinds

A closed venetian blind fills the screen. Behind it is your camera's live view.

Press a finger against the slats and they pry apart around it, showing the room behind.
Lift the finger and they fall shut.

That is the whole toy.

See [`SPEC.md`](SPEC.md) for the specification and [`AGENTS.md`](AGENTS.md) for the
principles it follows.

## Nothing is captured

This is a page that turns on your camera, so it should be easy to check what it does with it.

- The stream is attached to a `<video>` element and nothing else. It is never drawn to a
  canvas, never passed to `MediaRecorder`, never turned into a blob or a data URL.
- There is no network request after the page loads. The automated test fails if one is made.
- Audio is never requested: `getUserMedia` is called with `audio: false`.
- The camera **tracks** are stopped — not just paused — when you switch the camera off, when
  the page is hidden, and when you leave. The operating system's camera indicator should go
  out at the same moment.

`src/camera.js` is about a hundred lines and contains every line of camera handling in the app.

## Running it

Static site, no build step:

```sh
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/blinds/
```

`getUserMedia` needs a secure context. `localhost` counts as one, so this works for
development; on a phone you need HTTPS, which GitHub Pages provides.

## Using it

- **Drag anywhere on the blind** to pry it open. Several fingers open several gaps.
- **Let go** and it springs shut.
- **Open / Close** holds the blind open without a drag.
- **Camera on / off**, and **Flip** where the device has more than one camera.
- **Sound on / off** for the wooden clack when slats fall shut.

If you decline camera access, or there is no camera, the blind still works — there is a
painted sky behind it instead.

## How it works

| File | Role |
| --- | --- |
| `src/blind.js` | Slat angles: spring, damping, string coupling. No DOM, no camera |
| `src/render.js` | Builds the slats and writes transforms |
| `src/camera.js` | Acquisition, switching, lifecycle, failure handling |
| `src/sound.js` | The synthesised clack |
| `src/app.js` | State, controls, persistence, frame loop |

The geometry is the nice part. A slat is exactly as tall as the gap between slat centres,
and it rotates about its own centre line, so at 0° the slats tile the window perfectly and
at angle θ each one covers `cos θ` of its share. Coverage falls out of the geometry instead
of being faked with opacity — which is why a closed blind is genuinely opaque, at any slat
count, on any screen.

Each slat is one degree of freedom: an angle with a spring and a damper. A finger sets a
target angle with a Gaussian falloff, so pressing opens a band about five slats tall, and
the spring stiffens under the finger so the gap tracks it without lag and springs back
loosely when released.

The slats are then coupled to their neighbours, which is what makes the blind feel like one
object rather than a stack of flaps. The coupling smooths the *error* between each slat and
its target rather than the angle itself: movement spreads along the blind, but a slat held
under a finger still reaches the full 80°.
