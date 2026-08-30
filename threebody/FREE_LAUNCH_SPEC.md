# Threebody — Free Launch / Throw Spacecraft Specification

## Purpose

Add a direct sandbox mode where the user can place a spacecraft anywhere in the existing planar Earth–Moon CR3BP scene, choose an initial velocity by dragging, preview the resulting trajectory, and then launch it.

This feature is not a rocket-launch simulator and must not expand the physical model beyond the existing CR3BP. It is simply a user-authored initial state:

```text
[x0, y0, vx0, vy0]
```

The attraction is simple: **put the spacecraft somewhere, throw it in some direction, and see where the real equations take it.**

---

## Scope boundary

Free Launch stays inside the current model.

Do not add:

- atmosphere,
- launch pads,
- staging,
- propellant mass,
- finite-duration thrust,
- Earth surface launch dynamics,
- ephemeris Earth–Moon–Sun dynamics,
- autopilot steering.

The spacecraft remains a massless CR3BP test particle. Once launched, it coasts ballistically until the user applies a later impulsive burn, resets, or a physical termination event occurs.

---

## User flow

Free Launch should be a clearly selectable sandbox mode, separate from the curated orbit-family presets.

Recommended interaction is deliberately two-stage so position and velocity are never ambiguous.

### Stage 1 — Place

- Enter `Free launch` / `Throw spacecraft` mode.
- Pause playback while editing the initial state.
- Show a visibly larger draggable spacecraft sprite as an editor handle.
- The user drags the spacecraft to any valid location in the current display frame.
- Placement changes position only; it does not secretly choose a velocity.
- Earth/Moon physical interiors are invalid initial positions. Prevent or clearly reject placement inside a body.

The placed screen position must be transformed back to the canonical rotating CR3BP coordinates at the selected launch epoch.

### Stage 2 — Set velocity

After placement, the user drags outward from the spacecraft to define initial velocity.

```text
arrow direction -> velocity direction in the current display frame
arrow length    -> velocity magnitude
```

Show the magnitude live in human units, preferably m/s below 1000 m/s and km/s above it.

The arrow is an input control. Its vector must be transformed back to the canonical rotating-frame velocity before propagation.

The interaction should remain usable at every zoom level; therefore velocity sensitivity should be screen-space based or otherwise normalized so zooming does not make the same hand gesture mean a radically different speed.

### Stage 3 — Preview

Before committing:

- numerically integrate the candidate state using the same trajectory propagator used everywhere else,
- draw the preview as a clearly distinct temporary path,
- show predicted terminal status if known (`ok`, `impact: Earth`, `impact: Moon`, left-domain/escape-like, etc.),
- update the preview whenever position or velocity changes.

The preview must be a real CR3BP propagation, never a spline or hand-drawn guide.

For responsiveness, debounce/cancel stale preview jobs rather than lowering numerical correctness without measurement.

### Stage 4 — Launch

Only after the user presses `Launch` does the candidate state become the live run.

On Launch:

- use exactly the state that produced the visible preview,
- reset playback time to the launch epoch / t = 0 for the new run unless the UI deliberately supports another clearly documented epoch convention,
- shrink the editor spacecraft sprite to the normal in-flight marker size,
- retain the same normal diagnostics, collision handling, frame switching, zoom, pan, ZVC, burns and targeting behavior.

A preview path must not silently change between the last displayed preview and Launch.

---

## Reference-frame contract

Free Launch must work in all three existing display frames:

1. rotating / synodic,
2. Earth-following,
3. barycentric inertial.

The user may place and aim the spacecraft in whichever frame is currently displayed, but the physical initial state must always be converted into the canonical rotating CR3BP state before integration.

Do not create different physics for different views.

A placement at a visible screen point in one frame, followed by switching frames before launch, should still describe the same physical state; only its displayed coordinates change.

For velocity, use the correct state/vector transform. Do not confuse a displayed inertial/Earth-following velocity vector with rotating-frame velocity components.

---

## Spacecraft orientation

The spacecraft artwork is a visual/UI device, not a new attitude-dynamics model.

For Free Launch editing:

- orient the sprite nose along the proposed velocity vector so the intent is visually obvious,
- if velocity magnitude is nearly zero, retain the previous editor orientation or use a neutral default.

During ballistic flight:

- the sprite may continue to point along the displayed instantaneous velocity for readability,
- this is presentation only,
- do not model torque, reaction wheels, aerodynamic attitude, thrust-vectoring, or spacecraft rotational dynamics.

The velocity arrow remains the authoritative physical direction cue.

---

## Visual treatment

The user-provided spacecraft asset is expected to be a transparent-background, top-down science-fiction spacecraft image.

Editor state:

- approximately 20–32 CSS px tall/wide enough to grab comfortably on iPad,
- optional soft glow / selection halo,
- obvious nose direction,
- large hit target independent of the image's visible alpha footprint.

In-flight state:

- smaller than the editor state,
- should not dominate Earth/Moon/L points/trajectory,
- may retain a subtle glow for visibility.

The rendered spacecraft size is nonphysical and must never affect gravity, collision radius or trajectory integration.

---

## Interaction priority

Free Launch introduces a temporary editing interaction that must coexist with camera controls.

Recommended rule while editing:

```text
pointer on spacecraft editor -> move spacecraft
pointer on velocity handle/arrow -> set velocity
pointer on empty space -> pan
pinch / wheel -> zoom
Launch -> commit candidate state
Cancel / Reset -> leave candidate state without modifying the previous live run
```

Do not reuse the normal in-flight drag-to-burn gesture while the spacecraft is in placement mode; the two meanings are too easy to confuse.

After Launch, restore the existing normal interaction contract.

---

## Initial velocity UX

A zero-velocity initial state is allowed mathematically if outside a body, but the UI should make it clear that zero displayed velocity in one frame does not imply zero velocity in every other frame.

Useful optional helpers that do not alter the physics:

- `0 m/s in this frame` button,
- numeric magnitude readout,
- optional direction angle readout,
- optional common velocity suggestions only if clearly labeled as helpers rather than orbit presets.

Do not automatically choose a "safe" orbit velocity. The point of the mode is experimentation, including crashes and escapes.

---

## Zero-velocity curves

ZVC remains derived from the candidate/live Jacobi constant.

While editing a Free Launch candidate, it is useful to update ZVC from the candidate state so the user can see how the chosen speed changes dynamically accessible regions.

If implemented, distinguish preview/candidate ZVC from the currently running trajectory state so the UI never displays one state's C while drawing another state's boundary.

---

## Collision and invalid-state rules

- Do not allow an initial point inside physical Earth or Moon.
- Preview propagation uses the same physical collision radii and event handling as live propagation.
- A preview that collides is still a valid experiment; report it rather than hiding it.
- Launching a predicted collision is allowed unless product UX explicitly asks for a confirmation. The sandbox should permit failure.
- No bounce and no decorative avoidance behavior.

---

## Performance

Dragging a velocity arrow may generate many preview requests. Do not queue every intermediate state.

Preferred behavior:

```text
new editor state
    -> cancel/ignore stale preview job
    -> integrate newest candidate asynchronously
    -> display newest completed preview only
```

The live solver, validated presets and numerical tolerances must not be weakened to make the editor feel responsive.

---

## Diagnostics

Do not remove the current full diagnostics.

For a Free Launch candidate/live run, diagnostics should still support:

```text
position
speed
C / C0
Jacobi drift after launch
solver accepted/rejected steps
frame
status
build
```

During editing, it is acceptable to label values explicitly as `candidate` so they are not confused with the previous live run.

---

## Acceptance tests

A Free Launch implementation is unacceptable if any of the following fail:

1. User can place a spacecraft at an arbitrary valid point without changing the previous live trajectory until Launch.
2. User can define both initial velocity direction and magnitude.
3. Candidate state is converted correctly from each of the three display frames into the same canonical rotating CR3BP state.
4. Preview is generated by the normal CR3BP propagator, not by drawing.
5. Launch uses the same state shown by the final preview.
6. Switching display frames does not create a new physical candidate or alter the candidate trajectory.
7. Preview and live collision handling use physical Earth/Moon radii.
8. Zoom/pan do not alter the candidate physical state.
9. Spacecraft sprite size/orientation does not affect physics.
10. Normal burn/targeting interactions resume after Launch.
11. Jacobi drift after Launch remains within the existing numerical contract.
12. Repeating the same initial state at tighter tolerance preserves the qualitative outcome.

---

## Product intent

This is not an additional mission-design subsystem. It is the most direct expression of the existing sandbox:

**choose the initial condition yourself and let the equations answer.**

Crashes, unexpected loops, temporary captures, escapes and strange librations are all valid outcomes. Do not protect the user from interesting dynamics.