// zvs.js — the zero-velocity SURFACE, as a stack of real slices.
//
// In the plane the Jacobi boundary is a curve; in space it is a surface,
// 2*Omega(x,y,z) = C. THREE_D_SPEC.md 11 asks for it and warns in the same
// breath that "a volumetric/isosurface visualization can easily obscure the
// orbit" -- which is the honest objection, because the orbit is the thing the
// page is about.
//
// So this draws no surface. It draws the surface's LEVEL SETS at a stack of
// heights: at each z, the exact contour of 2*Omega(x,y,z) = C, by the same
// marching squares the planar curves use. Every curve on screen is a genuine
// solution of the boundary equation at a real height, not a triangulation of one
// -- which satisfies "do not use a decorative mesh" by having no mesh to be
// decorative, and "allow transparency/slicing" by being slices.
//
// What it shows that the planar curve cannot: the boundary CLOSES OVER with
// height. Far from both primaries 2*Omega is nearly x^2 + y^2 and barely depends
// on z, so the outer boundary hardly moves; near a primary the well is
// 2(1-mu)/r1 + 2mu/r2, and r1 and r2 both grow with |z|, so the allowed pockets
// around Earth and Moon shrink as you climb and eventually vanish. A halo lives
// exactly there -- above the neck, where the planar picture has nothing to say.
//
// The heights are taken from the trajectory's own excursion rather than being
// round numbers, so every slice is at an altitude the spacecraft actually
// reaches. A boundary drawn at a height nothing goes to is decoration by another
// route.

import { MU, MOON_X } from './constants.js?v=20260830p';
import { omega3 } from './cr3bp3d.js?v=20260830p';

/**
 * Marching squares over F = 2*Omega(x, y, z) - C at one height.
 *
 * Identical in method to the planar zeroVelocityCurves -- deliberately, so the
 * z = 0 slice can be checked against it and has to agree. F < 0 is forbidden.
 */
export function sliceAt(C, z, { mu = MU, x0 = -1.8, x1 = 1.8, y0 = -1.8, y1 = 1.8, n = 240 } = {}) {
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
  const f = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j += 1) {
    const y = y0 + j * dy;
    for (let i = 0; i <= n; i += 1) {
      const x = x0 + i * dx;
      // clamped: at a primary this is astronomically large and only the sign
      // matters to a contour
      f[j * (n + 1) + i] = Math.min(1e6, 2 * omega3(x, y, z, mu) - C);
    }
  }
  const segs = [];
  const at = (i, j) => f[j * (n + 1) + i];
  const lerp = (a, b, va, vb) => a + (b - a) * (0 - va) / (vb - va);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const v00 = at(i, j), v10 = at(i + 1, j), v11 = at(i + 1, j + 1), v01 = at(i, j + 1);
      let code = 0;
      if (v00 > 0) code |= 1;
      if (v10 > 0) code |= 2;
      if (v11 > 0) code |= 4;
      if (v01 > 0) code |= 8;
      if (code === 0 || code === 15) continue;
      const xa = x0 + i * dx, xb = xa + dx, ya = y0 + j * dy, yb = ya + dy;
      const B = [lerp(xa, xb, v00, v10), ya];
      const R = [xb, lerp(ya, yb, v10, v11)];
      const T = [lerp(xa, xb, v01, v11), yb];
      const L = [xa, lerp(ya, yb, v00, v01)];
      const push = (p, q) => segs.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: push(L, B); break;
        case 2: case 13: push(B, R); break;
        case 3: case 12: push(L, R); break;
        case 4: case 11: push(R, T); break;
        case 6: case 9: push(B, T); break;
        case 7: case 8: push(L, T); break;
        case 5: push(L, B); push(R, T); break;      // saddle
        case 10: push(L, T); push(B, R); break;
        default: break;
      }
    }
  }
  return new Float64Array(segs);
}

/**
 * The heights to slice at, taken from what the trajectory actually does.
 *
 * Symmetric about the plane because Omega is even in z -- the surface above and
 * below are mirror images, and drawing both is what makes it read as a solid
 * rather than as a lid. Zero is always included: it is the planar curve, the one
 * a reader coming from the 2D view already knows.
 */
export function sliceHeights(zMax, count = 3, over = 1.35) {
  const out = [0];
  if (!(zMax > 0)) return out;
  // Up to a third again above the orbit's own excursion, deliberately. The
  // interesting thing is not the boundary where the orbit is -- at these
  // energies there usually isn't one there -- it is the boundary CLOSING OVER
  // just above it. The Gateway-like NRHO climbs to 69 707 km and its lid is at
  // 72 000: slicing only to the orbit's own height would stop 2 300 km short of
  // the one feature worth drawing.
  for (let k = 1; k <= count; k += 1) {
    const z = (zMax * over * k) / count;
    out.push(z, -z);
  }
  return out;
}

/**
 * The zero-velocity surface at this energy, as slices through the region the
 * trajectory occupies.
 *
 * Returns one entry per height, each with its own segments. A height whose
 * segments are empty is not an error and not hidden: it means the boundary has
 * closed over below that altitude, which is a fact about the energy worth
 * seeing.
 */
export function zeroVelocitySlices(C, zMax, opts = {}) {
  const { count = 3, over = 1.35, ...rest } = opts;
  return sliceHeights(zMax, count, over).map((z) => ({ z, segs: sliceAt(C, z, rest) }));
}

/**
 * The sampling window for a trajectory: its own extent, with room around it.
 *
 * The default window is the whole Earth-Moon neighbourhood, and at a halo's zoom
 * that spends nearly all its resolution on a distant outer boundary while the
 * feature the reader is looking at -- the lid over the Moon -- falls between two
 * grid cells. Sizing the window to the orbit puts the cells where the curve is.
 *
 * Square, because a rectangular window would make the marching-squares cells
 * anisotropic and the contour would inherit that as a direction-dependent error.
 */
export function windowFor(run, { margin = 2.2, min = 0.42, mu = MU } = {}) {
  const n = run.n || run.xs.length;
  let far = 0;
  for (let i = 0; i < n; i += 1) {
    far = Math.max(far, Math.hypot(run.xs[i] - MOON_X, run.ys[i], run.zs[i]));
  }
  // Centred on the Moon and generous, because the feature is not small and not
  // where the orbit is. Measured at the Gateway-like energy: the forbidden region
  // is a pair of lobes standing off the Earth-Moon line at |y| between 0.3 and
  // 0.55 DU, which a window sized to the orbit's own thin bounding box cut
  // straight through -- the curves then ran off the edge and read as loose arcs
  // instead of as a region closing in.
  // Tight enough that the orbit stays readable inside the frame that holds the
  // whole stack -- THREE_D_SPEC.md 11's other requirement, and the one a wider
  // window quietly breaks: at three times the apolune the boundary was complete
  // and the trajectory was forty pixels.
  const half = Math.max(min, far * margin);
  return { x0: MOON_X - half, x1: MOON_X + half, y0: -half, y1: half };
}

/** Is this point reachable at all, at this energy? The spatial test. */
export function forbidden3(x, y, z, C, mu = MU) {
  return 2 * omega3(x, y, z, mu) - C < 0;
}

/**
 * How high you can get directly above a primary at this energy.
 *
 * This is the number the slice stack is a picture of. Straight above a body,
 * 2*Omega is 1/|z| plus terms that barely move, so it falls monotonically with
 * height: infinite at the surface, and crossing C at exactly one altitude. Above
 * that the point is unreachable, and the allowed pocket over that body has a lid.
 *
 * The first version of this asked whether the point above the body was FORBIDDEN
 * and bisected on that. It returned zero at every energy, which is correct and
 * useless: the region around a primary is the allowed pocket, not the forbidden
 * ring, so the point directly above one is never forbidden at z = 0. The question
 * had to be turned round.
 */
export function ceilingOver(C, bodyX, { mu = MU, hi = 4, iterations = 80 } = {}) {
  // There is no "no pocket at all" case to guard against, and an earlier version
  // of this wasted a branch on one: 2*Omega diverges at a primary, so the point
  // directly above a body is allowed at z = 0 at every finite energy. What the
  // ceiling does at large C is collapse onto the body -- it tends to 2*mu/C, the
  // altitude at which the body's own well alone falls to C, and it is checked
  // against that asymptote rather than against a case that cannot happen.
  if (!forbidden3(bodyX, 0, hi, C, mu)) return Infinity; // open past the top of the search
  let lo = 0, up = hi;
  for (let i = 0; i < iterations; i += 1) {
    const m = 0.5 * (lo + up);
    if (forbidden3(bodyX, 0, m, C, mu)) up = m; else lo = m;
  }
  return 0.5 * (lo + up);
}
