// zvc.js — zero-velocity curves, from the spacecraft's own Jacobi constant.
//
// 2*Omega(x,y) = C is the boundary of where the spacecraft can be at all: inside
// it the implied square of the speed is negative, so the region is not merely
// unvisited but unreachable. AGENTS.md forbids drawing decorative contours
// detached from the current C, which is the whole reason this is computed from
// the live state rather than baked once — a burn changes C, and the necks around
// L1 and L2 open or close in response. That is the most direct thing the
// simulator can show about why some journeys are cheap and others impossible.

import { MU } from './constants.js?v=20260830f';
import { omega } from './cr3bp.js?v=20260830f';

/**
 * Marching squares over F = 2*Omega - C. Returns line segments in model
 * coordinates; F < 0 is the forbidden side.
 *
 * The grid is deliberately coarse-then-fine: Omega diverges at both primaries,
 * so a uniform grid either wastes most of its samples in empty space or misses
 * the neck at L1, which is the feature that matters most. 320 cells across the
 * region of interest resolves the necks and costs about a millisecond.
 */
export function zeroVelocityCurves(C, { mu = MU, x0 = -1.8, x1 = 1.8, y0 = -1.8, y1 = 1.8, n = 320 } = {}) {
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
  const f = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j += 1) {
    const y = y0 + j * dy;
    for (let i = 0; i <= n; i += 1) {
      const x = x0 + i * dx;
      // clamped: right at a primary this is astronomically large and only the
      // sign matters for the contour
      f[j * (n + 1) + i] = Math.min(1e6, 2 * omega(x, y, mu) - C);
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

/** Is this point reachable at all, at this energy? */
export function forbidden(x, y, C, mu = MU) {
  return 2 * omega(x, y, mu) - C < 0;
}
