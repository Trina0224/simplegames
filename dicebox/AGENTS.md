# AGENTS.md — Dice Box

## Project purpose

Dice Box is a very small browser toy that turns the phone or tablet into a glass box with dice inside.

The user shakes the device. The dice rattle around, bounce off the walls, and settle. When the device is still, the dice are still, and the pips are readable.

It is deliberately a boring game. There is no score, no opponent, no progression. The whole product is the tactile loop: shake, rattle, read the number. It exists so that a group with no dice on the table can still roll one.

Primary devices: **iPhone**, **Android phone**, **iPad**.
Desktop should still work, but desktop is not the design target.

## Product principles

1. **The device is the box.** Shaking throws the dice; tilting makes them slide toward the low edge. Motion input is the product, not a gimmick layered on a button.
2. **Open and shake immediately.** At most one tap to grant motion access, then straight into the box. No menus in the way.
3. **The dice must be fair.** A number a group actually uses to decide something has to be honestly random. Fairness is a correctness requirement, not a nicety.
4. **Still device, still dice.** When the device stops, the dice settle quickly and stay settled. Never let a die drift or jitter under a resting hand.
5. **Playable without sensors.** A desktop browser, a denied permission, or a device with no accelerometer must still be able to roll.
6. **Readable at a glance.** Pips large enough to read at arm's length on a table, from across the table if possible.
7. **Keep the implementation simple.** Version 0.1 is a static web application suitable for GitHub Pages. No backend, no build step, no framework, no physics library unless a simpler approach has been tried and proven inadequate.
8. **Motion data is private.** Sensor readings never leave the device. No analytics, no network calls, no accounts.

## Technical direction

- Standard HTML, CSS and modern JavaScript. ES modules, served over HTTP(S).
- Sensors come from `DeviceMotionEvent` (`accelerationIncludingGravity`, `acceleration`, `rotationRate`). `DeviceOrientationEvent` may supplement, but tilt should be derivable from the gravity vector alone.
- **iOS 13+ requires `DeviceMotionEvent.requestPermission()`, called from inside a user gesture, over HTTPS.** The permission request is the reason the app opens on a tap-to-start surface. Android Chrome needs no prompt but still requires a secure context.
- **Do not trust one platform's axis signs.** Browsers have historically disagreed on the sign of `accelerationIncludingGravity`. Detect the convention at rest instead of hard-coding it, and normalise everything into one internal frame.
- Rotate the sensor frame by `screen.orientation.angle`, or tilt will point the wrong way in landscape.
- Never assume a sample rate. Measure `dt` from event timestamps; iOS, Android and desktop all differ.
- Split shake from tilt: a low-pass filter recovers the gravity vector (tilt), a high-pass filter recovers shake energy.
- Run the simulation on a fixed timestep, decoupled from `requestAnimationFrame`, so behaviour does not change with frame rate.
- Prefer CSS 3D transforms over WebGL for rendering the dice. It is cheap, crisp on every screen, and needs no library.
- Synthesise collision sounds with the Web Audio API rather than shipping audio files. Audio must be initialised from a user gesture.
- Use `navigator.vibrate` for haptics where it exists, and degrade silently where it does not (iOS Safari has no vibration API).
- Keep simulation, sensor input, and rendering in separate modules. The simulation must be runnable and testable with synthetic input and no sensors at all.
- Persist small preferences in `localStorage`. No accounts.

## Fairness

The face a die shows must come from a cryptographic random source (`crypto.getRandomValues`), drawn at the moment the die settles, with a rejection-sampling step so the six faces are exactly equally likely.

A hand-written approximate simulation must never be the thing that decides the number. Approximate physics has approximate biases, and a die that quietly favours a face is a broken product even if it looks convincing.

The physics decides where and when the dice stop. The random source decides what they show. The settle animation rotates each cube to the drawn face.

This should be stated plainly in the UI or the README rather than hidden — the honesty is part of why the toy is usable for real decisions.

## Main screen

The box fills the screen. It should read as a shallow glass tray seen from above: walls with thickness, dice casting soft shadows on the floor, a hint of reflection on the glass.

Always visible:

- the box and the dice
- a dice-count control (1, 2, 3)
- the current total, when the dice are at rest

Everything else is either absent or behind one small control. There is no need for a full settings drawer if the settings fit in a compact strip.

The first screen the user sees on iOS is a tap-to-start surface, because the motion permission demands a gesture. Make that surface part of the toy — a tap on the glass — not an interstitial dialog.

## Interaction model

- **Shake** — throws the dice with an impulse proportional to the shake energy.
- **Tilt** — the in-plane component of gravity accelerates the dice toward the low edge, so the dice behave like objects in a real tray.
- **Flick / drag** — a pointer fallback that throws the dice, for desktop and for denied permissions.
- **Tap the box** — a plain re-roll that always works.

Dice at rest wake up when a new shake exceeds the threshold. Settling should feel decisive: dice must not creep for seconds after the hand stops.

## Physics

A full 3D rigid-body engine is out of scope for v0.1.

Model the dice as bodies moving on the 2D floor of the box, with position, velocity and a tumble state. Collide dice with each other and with the four walls, with damping and restitution. Render each die as a real 3D cube that tumbles while it moves and eases to an axis-aligned orientation as it settles.

This is deliberately a physical *feel* rather than a physical *truth*. If the feel does not survive contact with a real device, tune the model before reaching for a library.

## Sound and haptics

Collisions produce short, dry clicks — dice on glass, not a drum machine. Wall hits and die-die hits should sound different. Volume should follow impact speed, and simultaneous collisions must not stack into a burst of clipping.

Haptics, where available, should fire on settle rather than on every collision.

Both must be defeatable, and both must be silent by default in a way that does not surprise someone who opens this in a quiet room. Decide the default deliberately and write it down.

## Accessibility

- The total and the individual values must be available as text, not only as pips.
- Announce the result to screen readers when the dice settle.
- Respect `prefers-reduced-motion`: keep the roll, cut the tumbling flourish.
- Never encode meaning in colour alone.
- Large touch targets for the dice-count control.

## Version 0.1 scope

- 1 to 3 dice, six faces each
- motion permission flow that works on current iOS Safari and Android Chrome
- shake to roll, tilt to slide, flick and tap fallbacks
- collisions with walls and between dice
- cryptographically fair face values
- readable total at rest
- collision sound and settle haptics
- responsive portrait and landscape layouts
- preferences persisted locally

## Explicitly out of scope for v0.1

Do not add these unless specifically requested later:

- dice other than six-sided
- more than three dice
- roll history or statistics
- multiplayer or shared rolls
- accounts, cloud sync, leaderboards
- betting or currency of any kind
- a 3D engine or physics library
- a backend, or any network request after load
- custom dice skins beyond a single tasteful default

## Definition of done

Version 0.1 is successful when a person can open the page on a phone, tap once, shake the device, hear and see one to three dice rattle around a glass box, put the device down, and read the number — and when a person who declines motion access can still flick the dice with a finger and get an equally fair result.

Keep it tactile, honest, and pointless in the best way.
