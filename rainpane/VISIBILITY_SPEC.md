# Rainpane — Atmospheric Visibility Specification

## Part 3: Rain Veil, Atmospheric Scattering, and Distance-Dependent Visibility

### Purpose

This document defines the third major Rainpane visual system: the atmosphere outside the virtual glass.

Rainpane already separates airborne rain from water attached to the pane. Heavy rain adds another visible phenomenon: distant rain, suspended droplets, humid air, and accumulated line-of-sight scattering reduce scene contrast and visibility. The result is a depth-dependent rain veil.

This is **not** a full-screen blur, and it is **not** glass condensation. The near foreground should remain comparatively readable while the deep forest is progressively obscured.

---

## 1. Physical design principle

Heavy rain should make the outside world harder to see because optical path length through rainy/humid air increases with distance.

Therefore:

- near scenery receives little atmospheric attenuation,
- mid-distance scenery receives moderate attenuation,
- far scenery receives the strongest attenuation,
- distant lights acquire soft scattering halos,
- heavy rain lowers far-scene contrast and apparent saturation,
- the lower near-ground/path region close to the viewer must **not** be uniformly fogged just because rain intensity is high.

The intended perceptual result is:

> The near ground is still readable, but the distant forest is being swallowed by rain and wet air.

The unintended result is:

> The entire screen became equally blurry or gray.

---

## 2. Research basis

### 2.1 Rain accumulation / veil

Deraining and adverse-weather literature distinguishes visible nearby rain streaks from **rain accumulation**: distant streaks can no longer be resolved individually and collectively form a veil that reduces scene contrast and visibility.

Useful reference:

- Wenhan Yang, Robby T. Tan, Shiqi Wang, Yuming Fang, Jiaying Liu, **“Single Image Deraining: From Model-Based to Data-Driven and Beyond.”** The survey distinguishes rain streak degradation from rain accumulation and discusses depth-aware rain models.

### 2.2 Rain-rate / visibility relationship

Observed meteorological visibility varies with precipitation rate and humidity rather than being a fixed artistic fog amount.

Useful reference:

- I. Gultepe & J. A. Milbrandt, **“Probabilistic Parameterizations of Visibility Using Observations of Rain Precipitation Rate, Relative Humidity, and Visibility,”** Journal of Applied Meteorology and Climatology 49(1), 2010, 36–46. DOI: 10.1175/2009JAMC1927.1.

This should be used qualitatively: Rainpane does not need certified meteorological visibility, but rain intensity and optional mist/humidity should control atmospheric extinction in a physically sensible way.

### 2.3 Airborne rain optics

- Garg & Nayar (2006), **“Photorealistic Rendering of Rain Streaks.”** Use for the appearance of resolvable airborne rain.
- Slomp et al. (2011), **“Photorealistic real-time rendering of spherical raindrops with hierarchical reflective and refractive maps.”** Use as a realtime rain-optics reference.

These references complement the veil model. Nearby resolvable streaks and distant accumulated rain are separate visual scales.

---

## 3. Separate simulation/rendering domains

The final image has three conceptually separate systems:

1. **Background scene** — forest, path, lights, user photo, or camera.
2. **Atmospheric rain domain** — airborne streaks + distance-dependent rain veil + humid-air scattering.
3. **Glass-water domain** — attached drops, thin film, rivulets, refraction, meniscus and highlights.

Atmospheric attenuation happens outside the pane. Glass refraction happens afterward.

Recommended render order:

```text
background scene
  -> atmospheric visibility / rain veil
  -> airborne rain where appropriate
  -> glass-water refraction/distortion
  -> glass-water highlights / meniscus
  -> UI
```

A glass droplet should therefore refract a background that is already softened by distant rain.

---

## 4. Required inputs

The atmospheric visibility system should consume:

- `rainIntensity` or the existing rainfall-rate proxy,
- optional `mistLevel` / humidity proxy,
- scene guidance data,
- time for subtle temporal variation.

For the built-in forest scene, provide or author:

- `depthMask(x,y)` — approximate scene distance, 0 near to 1 far,
- `nearGroundProtectionMask(x,y)` — explicitly protects near foreground/path pixels,
- `lightMask(x,y)` or a small list of known distant lamp positions.

Optional:

- `skyMask`,
- `vegetationMask`,
- coarse depth bands instead of a continuous mask.

A hand-authored depth mask is acceptable and preferred over pretending that a single flat background image has exact geometry.

---

## 5. Near-ground protection is a hard requirement

For the built-in forest/path scene, the visually near lower portion of the image must remain substantially clearer than the deep background.

This is not merely an aesthetic exception. A short optical path through rain produces less accumulated extinction than a long path.

Implementation may use both depth and a protection mask:

```text
D_eff(x,y) = depthMask(x,y)^gamma * (1 - nearGroundProtectionMask(x,y))
```

with `gamma > 1` so attenuation grows predominantly at larger depth.

Rules:

- do not derive fog strength from screen y alone,
- do not assume “lower screen = near” for arbitrary user photos,
- for the built-in scene, author the near-ground protection explicitly,
- near ground may soften slightly in a storm, but it must not be washed out at the same rate as far trees.

---

## 6. Atmospheric transmittance model

Use a Beer-Lambert / Koschmieder-style exponential attenuation as a practical visual approximation:

```text
T(x,y) = exp(-sigma * D_eff(x,y))
```

where:

- `T` = transmittance,
- `sigma` = effective atmospheric extinction,
- `D_eff` = effective scene distance.

A useful qualitative mapping is:

```text
sigma = kRain * pow(rainIntensity, p)
      + kMist * pow(mistLevel, q)
```

Suggested starting behavior:

- `p > 1` so heavy/storm conditions ramp more strongly than drizzle,
- small rain produces almost no veil,
- rain and mist contributions may combine but should not explode linearly into white fog.

Do not claim the constants are meteorologically exact unless they have been calibrated against measurements.

---

## 7. Airlight / veiling light

Atmospheric scattering reduces scene contrast by both attenuating background radiance and adding scattered environmental light.

Approximate composition:

```text
sceneAtmospheric = scene * T + airlight * (1 - T)
```

`airlight` should:

- be low saturation,
- be derived from scene/weather lighting when practical,
- avoid a flat white or neutral-gray overlay,
- remain subtle in drizzle/light rain,
- become perceptible primarily at distance during heavy/storm rain.

For the cool nighttime forest scene, a restrained cool blue/green-gray airlight is more plausible than bright white fog.

---

## 8. Distant artificial lights

The forest path contains sparse warm lights. These are useful atmospheric depth cues.

As atmospheric extinction increases, selected distant lights may develop:

- soft halo,
- reduced edge contrast,
- mild bloom/scattering,
- subtle surrounding color spill.

Halo strength should depend on:

- source brightness,
- scene distance,
- rain intensity,
- optional mist/humidity.

Do not apply a large bloom to every bright pixel. Near ground reflections and close highlights should remain comparatively crisp.

Do not turn halos into lens flares.

---

## 9. Rain accumulation versus visible streaks

Rainpane must represent both scales without confusing them.

### Resolvable nearby rain

Individual airborne streaks may remain visible and may use Garg–Nayar-inspired variation.

### Distant accumulated rain

At distance, individual streaks become unresolved. Their aggregate effect is primarily:

- contrast loss,
- veiling/scattering,
- slight desaturation,
- reduced detail,
- low-frequency temporal variation.

Heavy rain must not be represented only by increasing the number of foreground white streaks.

---

## 10. Temporal variation

Atmospheric rain is not perfectly uniform. A very subtle low-frequency animated modulation may vary `sigma` or airlight spatially over time.

Constraints:

- low contrast,
- slow motion,
- broad spatial scale,
- no television-static look,
- no obvious looping texture.

This modulation represents changing rain density / humid-air structure, not glass droplets.

---

## 11. Intensity behavior

### Dry

- no rain veil,
- normal scene contrast.

### Drizzle

- nearly no atmospheric attenuation,
- far lights may soften imperceptibly.

### Light rain

- very slight far-depth contrast reduction,
- near ground essentially unchanged.

### Rain / moderate

- deep forest begins to lose contrast,
- far lights gain mild halos,
- path foreground remains readable.

### Heavy

- distant trees clearly veiled,
- far path/detail noticeably reduced,
- distant lamps visibly softened,
- near foreground still significantly clearer.

### Storm

- deep forest can become strongly obscured,
- atmospheric depth appears compressed,
- distant lights glow through wet air,
- near ground is affected only moderately unless physically distant in the authored depth map.

---

## 12. User-selected images and camera mode

A single arbitrary photo does not provide trustworthy metric depth.

For v0.1:

- full fidelity depth-aware veil is required for the built-in scene,
- arbitrary local images may use a conservative global/light depth approximation,
- do not strongly fog the bottom of arbitrary images merely because it is at the bottom of the screen,
- future depth estimation is optional, not required.

Camera mode must not upload frames for depth processing.

---

## 13. Forbidden shortcuts

Do not implement heavy-rain visibility as:

- a uniform full-screen Gaussian blur,
- a uniform gray/white alpha overlay,
- equal attenuation at all depths,
- a bottom-to-top gradient that ignores scene geometry,
- only more airborne streak sprites,
- only more glass droplets,
- stronger bloom on every bright pixel,
- fake condensation on the inside of the glass.

A blur may be one small component of distant degradation, but it cannot be the model by itself.

---

## 14. Performance policy

This pass should be inexpensive relative to the water solver.

Acceptable implementation options include:

- one or a few fullscreen WebGL fragment passes,
- pre-authored depth/protection/light textures,
- low-resolution atmospheric noise upscaled smoothly,
- separable/bloom passes restricted to light-mask regions.

Do not sacrifice depth correctness merely to save one fullscreen pass without profiling.

---

## 15. Acceptance tests

A build passes Part 3 only if all are true:

1. Drizzle leaves the background essentially clear.
2. Heavy/storm rain visibly reduces **far-background** contrast.
3. Far trees lose clarity before the near foreground does.
4. The lower near path/ground remains noticeably clearer than the deep forest in heavy rain.
5. The implementation does not use one uniform fog opacity for the whole screen.
6. Distant selected lamps gain subtle rain/mist halos as extinction rises.
7. Near highlights/ground details are not given the same halo strength as distant lamps.
8. Rain veil is separate from glass-water state and can be disabled independently for diagnosis.
9. Glass droplets refract the already atmospherically degraded scene.
10. Storm mode feels like looking through a short clear foreground into increasingly opaque rainy distance, not like looking at a blurred photograph.

---

## 16. Implementation milestone

Treat this as **Part 3** of Rainpane. Do not interrupt current audio work solely to implement it.

When audio reaches a stable checkpoint:

1. author the built-in forest scene depth mask,
2. author near-ground protection,
3. mark the sparse distant lamps,
4. implement depth-dependent transmittance + airlight,
5. add distant-light scattering,
6. integrate it before glass-water refraction,
7. validate drizzle / rain / heavy / storm transitions on iPhone and iPad.

Do not redesign gravity, surface-water physics, or audio as part of this task.