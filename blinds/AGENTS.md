# AGENTS.md — Blinds

## Project purpose

Blinds turns the screen into a window with venetian blinds, closed. Behind the blinds is the device's live camera view.

Pushing a finger against the slats pries them apart, and the real world shows through the gap. Lift the finger and the slats fall shut again.

That is the entire product. Nothing is captured, nothing is saved, nothing is scored. It is a fidget: a window you can peek through.

Primary devices: **iPhone**, **Android phone**, **iPad**.
Desktop works and is where most development happens.

## Product principles

1. **The screen is a window.** The blinds are the interface. There is no viewfinder chrome, no shutter button, no photo UI, because there is nothing to take a photo with.
2. **Peeking is a gesture, not a toggle.** Slats open where the finger is and spring shut when it leaves. The pleasure is in the springiness.
3. **Nothing is captured, ever.** No stills, no recording, no canvas readback, no uploads, no network requests after load. The camera stream is displayed and discarded.
4. **The camera is a guest.** Release it when the page is hidden, and give the user an obvious way to switch it off. The operating system's camera indicator should tell the truth about what the app is doing.
5. **Playable without a camera.** A denied permission or a device with no camera still gets working blinds with something pleasant behind them.
6. **Sixty frames or it is not a fidget.** Anything that makes the slats lag ruins the toy. Update transforms only, never layout.
7. **Keep the implementation simple.** A static web application suitable for GitHub Pages: no backend, no build step, no framework, no WebGL, no physics library.

## Technical direction

- Standard HTML, CSS and modern JavaScript, ES modules.
- The camera comes from `navigator.mediaDevices.getUserMedia`. It requires a secure context: HTTPS in the field, `localhost` during development.
- The video element must carry `playsinline`, `muted` and `autoplay`. Without `playsinline`, iOS Safari takes the video fullscreen and the blinds disappear behind it. Start playback from inside a user gesture.
- The slats are DOM elements rotated about their horizontal centre line with `rotateX`. A slat as tall as the blind's pitch covers exactly its own share of the window at 0°, and covers `cos(angle)` of it as it tilts, so coverage falls out of the geometry rather than being faked.
- Each slat is one degree of freedom: an angle with a spring and a damper. That is the whole simulation. Run it on a fixed timestep, decoupled from rendering.
- Slats are strung together in a real blind. A light smoothing pass across neighbouring angles gives that connectedness for almost nothing.
- In the animation loop, write `transform`, `filter` and `opacity` and nothing else. No reads of layout properties, no class toggles, no style recalculation per slat per frame.
- Pointer events, with capture, and full multi-touch: several fingers should each open their own gap.
- Synthesise any sound with the Web Audio API. No audio files.
- Persist small preferences in `localStorage`. No accounts, no analytics, no telemetry of any kind.
- Keep the slat simulation free of DOM and camera code so it can be tested headlessly.

## Privacy

This is a camera app that must be obviously trustworthy, and the way to earn that is to have nothing to hide.

- Never draw the video to a canvas, never call `MediaRecorder`, never construct a blob or a data URL from the stream.
- Never make a network request after the page loads. The app is a handful of static files and should be readable end to end in a few minutes.
- Stop the media tracks — not just pause the element — when the page is hidden, when the user switches the camera off, and on unload.
- Say plainly in the UI and the README that nothing is captured. The claim is checkable in the source, which is the point.

## Main screen

The window fills the screen: a live camera layer, the slats above it, and a suggestion of a frame and a sill at the edges.

Always visible, and kept out of the way:

- a small control to switch the camera off and on
- a small control to swap between front and rear cameras, where more than one exists

Everything else is the blind itself. There is no cord and no wand: finger pressure is the only way to open it, and it always springs back. A blind you can prop open is a blind you stop poking at.

Resist adding a settings drawer. This toy has almost nothing to configure, and a drawer would be ceremony.

## Interaction model

- **Press and drag on the slats** — pries them apart around the finger, strongest at the finger and falling off over a couple of slats above and below. Whole slats tilt; that is what happens when you push a real one.
- **Multiple fingers** — each opens its own gap.
- **Release** — the slats spring shut with a small overshoot and settle.
- **Nothing else.** No pinch, no double-tap, no long-press menu. The only non-drag way to open the blind is the accessibility control, which exists so the toy does not depend on a gesture.

## Camera behaviour

- Prefer the rear camera; fall back to any available camera.
- Cover the window with the video, cropping rather than letterboxing, and recompute on orientation change.
- Permission denied, no camera, or an insecure origin: show a calm animated backdrop behind the slats instead, keep the blinds fully working, and offer a single quiet way to retry. Do not nag.
- Re-acquire the stream when the page becomes visible again, without a second permission prompt where the browser allows it.

## Sound

A soft wooden clack when slats fall shut, synthesised, quiet, and scaled to impact speed. Rate-limited so a fast fidget rattles rather than clips. It must be switchable, and the default should be chosen deliberately and written down.

## Accessibility

- Provide a control that opens and closes the blinds fully, so the toy does not depend on a drag.
- Respect `prefers-reduced-motion`: keep the opening, drop the springy overshoot.
- Describe the state in text for assistive technology — blinds open, blinds closed, camera on, camera off.
- Never rely on colour alone, and keep the two controls at a comfortable touch size.

## Version 0.1 scope

- live camera behind horizontal venetian blinds
- finger-pry with falloff, multi-touch, spring return
- camera on/off and front/rear switch
- graceful fallback with no camera
- clack sound, switchable
- portrait and landscape, phone and tablet
- preferences persisted locally

## Explicitly out of scope for v0.1

Do not add these unless specifically requested later:

- taking, saving, sharing or recording anything
- filters, effects or beautification
- vertical blinds, curtains, shutters or other window dressings
- AR, face detection, or any analysis of the video
- accounts, cloud, sync, sharing
- a settings drawer
- WebGL

## Definition of done

Version 0.1 is successful when a person can open the page on a phone, allow the camera once, see a closed blind, push a finger against it and watch the room behind appear through the gap, then let go and watch it fall shut — and when a person who declines the camera still gets a blind that feels exactly as good to play with.

Keep it quiet, tactile, and completely pointless.
