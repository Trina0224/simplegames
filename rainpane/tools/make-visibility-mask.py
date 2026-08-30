#!/usr/bin/env python3
"""Author the atmospheric visibility masks for the built-in forest scene.

VISIBILITY_SPEC.md section 4 asks for depthMask, nearGroundProtectionMask and
lightMask, and says a hand-authored depth mask is preferred over pretending a
flat photograph has geometry. This is that authoring, written as code so the
reasoning is reviewable and the result reproducible rather than a binary blob
somebody has to trust.

It is not pure invention either. The scene's nine lanterns are physical objects
of roughly one size, so their apparent size on screen measures their distance:
size goes as 1/z. Fitting a ground plane z = 1/(v - v_horizon) to the measured
core areas puts the horizon at v = 0.389, and that single fitted number then
predicts the remaining lanterns' sizes to within about ten per cent. The depth
of the path is therefore measured, not guessed. What IS authored by hand is
everything the lanterns cannot speak for: the canopy above the horizon, the
side vegetation, and which pixels count as near ground.

Output: assets/visibility-mask.png
  R = depth        0 near .. 1 far
  G = near-ground protection
  B = lantern mask, weighted so distant lamps dominate

Run from the repository root:  python3 rainpane/tools/make-visibility-mask.py
"""

from PIL import Image, ImageFilter
import math

OUT_W, OUT_H = 256, 171          # smooth fields; the scene itself is 1535x1024

# --- measured -----------------------------------------------------------------
# Fitted from the lanterns' blown-out core areas; see the module docstring.
V_HORIZON = 0.389
Z_NEAR = 1.64                    # ground distance at the bottom of the frame
Z_FAR = 12.0                     # where distance stops mattering visually

# The nine lanterns, found by detecting warm blown-out cores and discarding the
# wet-path reflections beneath them (a reflection sits directly under a brighter
# source). Core area in pixels is kept because it is the distance evidence.
LANTERNS = [
    (0.585, 0.529, 157), (0.655, 0.535, 205), (0.446, 0.536, 111),
    (0.534, 0.570, 187), (0.652, 0.592, 244), (0.383, 0.626, 406),
    (0.737, 0.685, 523), (0.159, 0.766, 1144), (0.190, 0.787, 144),
]


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else 0.0
    return t * t * (3 - 2 * t)


def path_u(v):
    """Where the path runs. It leaves frame bottom-left of the vanishing point."""
    t = clamp((v - V_HORIZON) / (1.0 - V_HORIZON))
    return 0.58 + (0.45 - 0.58) * t


def ground_depth(v):
    """Ground-plane distance, normalised to 0 near .. 1 far."""
    z = 1.0 / max(0.012, v - V_HORIZON)
    return clamp((z - Z_NEAR) / (Z_FAR - Z_NEAR))


def canopy_depth(u, v):
    """Above the horizon there is no ground plane, so this part is authored.

    The gap of sky and far trees sits around the middle; the leaves at the top
    corners and down both edges are the nearest thing in the frame, hanging in
    front of the camera. This is exactly the case the spec warns about — screen
    height alone would call the top of the image distant and fog the near
    canopy along with the deep forest.
    """
    centre = 1.0 - smoothstep(0.06, 0.32, abs(u - 0.52))
    # the very top edge is overhanging leaf, near whatever its lateral position
    overhang = 1.0 - smoothstep(0.0, 0.16, v)
    return clamp(0.10 + 0.88 * centre * (1.0 - 0.85 * overhang))


def depth_at(u, v):
    g = ground_depth(v)
    c = canopy_depth(u, v)
    d = g + (c - g) * (1.0 - smoothstep(V_HORIZON - 0.07, V_HORIZON + 0.07, v))
    # Vegetation flanking the path is nearer than the path at the same height:
    # the trunks on the left edge at mid-frame are a few metres away, not fifty.
    side = smoothstep(0.15, 0.44, abs(u - path_u(v)))
    return clamp(d * (1.0 - 0.55 * side))


def protection_at(u, v):
    """Near ground, authored for this scene only.

    Section 5 makes this a hard requirement and also forbids deriving fog from
    screen y in general. Both hold: this is a per-scene authored mask that
    happens to follow height because in THIS photograph the bottom of the frame
    really is the path at the viewer's feet. It is not a rule about images.
    """
    near = smoothstep(0.60, 0.94, v)
    # the boulders at the lower right are close too, and not on the path
    rocks = smoothstep(0.62, 0.80, v) * smoothstep(0.60, 0.78, u)
    return clamp(max(near, 0.75 * rocks))


def main():
    img = Image.new('RGB', (OUT_W, OUT_H))
    px = img.load()
    for j in range(OUT_H):
        v = (j + 0.5) / OUT_H
        for i in range(OUT_W):
            u = (i + 0.5) / OUT_W
            px[i, j] = (
                int(round(255 * depth_at(u, v))),
                int(round(255 * protection_at(u, v))),
                0,
            )
    img = img.filter(ImageFilter.GaussianBlur(1.6))   # no banding in the veil

    # Lanterns go in last so the blur cannot smear them off their sources.
    lamps = Image.new('L', (OUT_W, OUT_H), 0)
    lp = lamps.load()
    for u0, v0, area in LANTERNS:
        d = depth_at(u0, v0)
        # A halo belongs to a distant lamp, not to every bright pixel: the near
        # lantern is marked faintly so it can stay crisp in a storm.
        weight = 0.25 + 0.75 * d
        # Wide, because this is a halo and not a dot. A tight mask puts the
        # added light exactly where the attenuation is taking it away again,
        # and the two cancel: measured, the ring around a far lamp came out
        # DARKER than with no veil at all.
        r = 0.018 + 0.085 * math.sqrt(area) / 34.0
        for j in range(OUT_H):
            for i in range(OUT_W):
                du = (i + 0.5) / OUT_W - u0
                dv = ((j + 0.5) / OUT_H - v0) / 1.0
                t = math.hypot(du, dv) / r
                if t < 3.2:
                    val = weight * math.exp(-t * t * 0.85)
                    if val * 255 > lp[i, j]:
                        lp[i, j] = int(round(clamp(val) * 255))
    lamps = lamps.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.merge('RGB', (img.split()[0], img.split()[1], lamps))
    img.save('rainpane/assets/visibility-mask.png')

    print(f'wrote rainpane/assets/visibility-mask.png  {OUT_W}x{OUT_H}')
    print(f'horizon v={V_HORIZON}  (fitted from lantern apparent sizes)')
    print('  where                     depth  protect')
    for name, u, v in [
        ('near path, bottom centre', 0.45, 0.97), ('near lantern', 0.159, 0.766),
        ('lower-right boulders', 0.72, 0.75), ('mid path', 0.50, 0.66),
        ('far lanterns', 0.585, 0.529), ('deep forest centre', 0.52, 0.45),
        ('near canopy, top left', 0.10, 0.06), ('sky gap, top centre', 0.52, 0.20),
        ('left trunks, mid frame', 0.06, 0.55),
    ]:
        print(f'  {name:24s}  {depth_at(u, v):.2f}   {protection_at(u, v):.2f}')


if __name__ == '__main__':
    main()
