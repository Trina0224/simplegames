# Threebody — Spacecraft Asset / UI Contract

## Asset purpose

The user will provide a transparent-background, top-down science-fiction spacecraft image for the Free Launch editor and the in-flight marker.

This artwork is intentionally more futuristic than a real mission spacecraft. Threebody is still a physics sandbox: the artwork exists to give the user something obvious to grab, aim and watch.

The sprite is presentation only.

---

## Required asset characteristics

Preferred source:

- PNG or WebP with real alpha transparency,
- top-down / plan view,
- clear longitudinal nose direction,
- no baked black background,
- no large external shadow rectangle,
- enough empty transparent margin that glow does not clip,
- approximately square source canvas is fine.

The canonical visual nose should point **upward in the source image**. Rendering code can rotate the image from that convention.

Do not interpret image pixel dimensions as physical spacecraft size.

---

## Orientation convention

For readability, the sprite may point along the current displayed velocity vector.

```text
sprite nose angle = displayed velocity direction
```

This is a visualization convention only.

It does **not** imply:

- attitude dynamics,
- thrust direction,
- aerodynamic heading,
- reaction-wheel control,
- rigid-body rotation,
- that the spacecraft must be pointing where it is moving in a real mission.

The velocity vector remains the authoritative physics cue.

In Free Launch edit mode, pointing the spacecraft nose along the velocity arrow is strongly preferred because it makes the drag interaction self-explanatory.

---

## Display size

Use CSS/screen pixels, not DU, for the interactive sprite size.

Suggested initial values:

```text
Free Launch editor: 24–32 px visible craft, with ~32–44 px hit target
In flight:          10–16 px visible craft
```

Tune on iPad rather than assuming desktop mouse precision.

Zoom must not make the sprite physically enormous or microscopic merely because world scale changed. The craft is an interface marker.

The user may later decide to change these sizes after on-device testing.

---

## Editor appearance

While placing/aiming:

- draw the spacecraft at the larger editor size,
- add a restrained selection halo or glow,
- keep the velocity arrow clearly visible above/around the sprite,
- show velocity magnitude close enough to associate it with the arrow but not directly on top of the craft.

If the image has bright blue engine glow, do not add so much additional glow that the silhouette disappears.

The sprite itself should not be used as the entire touch hit region; provide a comfortable invisible hit target.

---

## In-flight appearance

After Launch:

- shrink to the normal marker size,
- retain a small halo if necessary against the dark background,
- rotate to follow displayed instantaneous velocity for visual readability,
- keep trajectory line visually more important than the sprite.

If velocity is extremely small and its angle becomes numerically/noisily undefined, preserve the most recent meaningful orientation rather than flickering.

---

## Frame behavior

The same asset is used in rotating, Earth-following and barycentric inertial views.

Its position and displayed velocity direction must come from the same frame-transform layer as the trajectory. Do not manually rotate the sprite using Moon angle or screen angle independently of the transformed velocity.

Changing frame changes only the visual representation of the same physical state.

---

## No physics coupling

The asset must never affect:

- gravity,
- spacecraft mass,
- collision radius,
- Earth/Moon collision detection,
- integration step size,
- Jacobi constant,
- targeting,
- trajectory classification.

Physical spacecraft remains a massless test particle. Earth/Moon collision checks continue to use the particle position against the physical body radii.

---

## Fallback

If the asset fails to load, fall back to the existing vector spacecraft/triangle marker rather than breaking the simulation.

The physics and Free Launch mode must remain usable without the image asset.

---

## Cache/versioning

Threebody now versions its module graph to avoid Safari mixed-build caching. Treat the spacecraft asset similarly when replacing it during development: either version its URL/file name or include it in whatever asset-cache strategy is used so iOS does not silently keep an older sprite.

---

## Acceptance checks

1. Transparent areas actually show the scene behind the craft.
2. Source-up direction maps consistently to the renderer's velocity angle.
3. Editor and in-flight sizes are screen-space UI sizes, not world-space physical sizes.
4. Frame switching keeps sprite orientation consistent with the displayed velocity.
5. Missing asset falls back gracefully.
6. Replacing the asset cannot produce a mixed old/new UI on Safari without an obvious version mismatch.
7. No asset property reaches any numerical physics calculation.