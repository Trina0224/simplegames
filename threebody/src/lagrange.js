// lagrange.js — the five equilibria, solved rather than looked up.
//
// AGENTS.md is explicit that these must come out of the model. That is not
// pedantry: solving them is the first real test that the equations, the signs
// and the frame convention are all right at once. If L1 lands at 0.8369 the
// gradient is correct, and if it does not, nothing downstream is worth running.
//
// It also gives the linear behaviour at each point for free, which is what lets
// the product say something true rather than treating all five as parking
// spots: the collinear three are saddles and the triangular two are not.

import { MU } from './constants.js?v=20260830d';
import { gradOmega, omega } from './cr3bp.js?v=20260830d';

/**
 * dOmega/dx along the x-axis. Written separately from gradOmega because on the
 * axis the y terms vanish identically and the cube roots want their signs kept
 * explicitly — (x+mu)/|x+mu|^3 is sign(x+mu)/(x+mu)^2, and getting that wrong
 * puts L3 on the wrong side of the Earth.
 */
function axisGradient(x, mu) {
  const d1 = x + mu;
  const d2 = x - 1 + mu;
  return x
    - (1 - mu) * Math.sign(d1) / (d1 * d1)
    - mu * Math.sign(d2) / (d2 * d2);
}

/**
 * Bisection, then Newton. Bisection alone is slow; Newton alone wanders off a
 * singularity when it starts near a primary. Bracketing first makes the answer
 * unconditional, and a few Newton steps then take it to machine precision.
 */
function solveAxis(lo, hi, mu) {
  let a = lo, b = hi;
  let fa = axisGradient(a, mu);
  for (let i = 0; i < 200; i += 1) {
    const m = 0.5 * (a + b);
    const fm = axisGradient(m, mu);
    if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
  }
  let x = 0.5 * (a + b);
  for (let i = 0; i < 40; i += 1) {
    const f = axisGradient(x, mu);
    const h = 1e-8;
    const df = (axisGradient(x + h, mu) - axisGradient(x - h, mu)) / (2 * h);
    if (!Number.isFinite(df) || df === 0) break;
    const step = f / df;
    x -= step;
    if (Math.abs(step) < 1e-15) break;
  }
  return x;
}

/** Second derivatives of Omega, for the linear analysis. */
export function hessOmega(x, y, mu = MU) {
  const dx1 = x + mu, dx2 = x - 1 + mu;
  const r1 = Math.hypot(dx1, y), r2 = Math.hypot(dx2, y);
  const r1_3 = r1 ** 3, r2_3 = r2 ** 3, r1_5 = r1 ** 5, r2_5 = r2 ** 5;
  const m1 = 1 - mu;
  const oxx = 1 - m1 / r1_3 - mu / r2_3 + 3 * m1 * dx1 * dx1 / r1_5 + 3 * mu * dx2 * dx2 / r2_5;
  const oyy = 1 - m1 / r1_3 - mu / r2_3 + 3 * m1 * y * y / r1_5 + 3 * mu * y * y / r2_5;
  const oxy = 3 * m1 * dx1 * y / r1_5 + 3 * mu * dx2 * y / r2_5;
  return { oxx, oyy, oxy };
}

/**
 * Linear behaviour about an equilibrium.
 *
 * Linearising the rotating-frame equations gives
 *   lambda^4 + (4 - Oxx - Oyy) lambda^2 + (Oxx Oyy - Oxy^2) = 0,
 * a quadratic in lambda^2. A real positive lambda^2 means a real growing
 * eigenvalue and therefore a saddle: the point is unstable, and the e-folding
 * time says how fast a perturbation runs away. That number is worth showing —
 * "unstable" is an abstraction, "doubles its error every 2.2 days" is not.
 */
export function linearAt(x, y, mu = MU) {
  const { oxx, oyy, oxy } = hessOmega(x, y, mu);
  const b = 4 - oxx - oyy;
  const c = oxx * oyy - oxy * oxy;
  const disc = b * b - 4 * c;
  const roots = disc >= 0
    ? [(-b + Math.sqrt(disc)) / 2, (-b - Math.sqrt(disc)) / 2]
    : [];
  let growth = 0;
  for (const l2 of roots) if (l2 > 0) growth = Math.max(growth, Math.sqrt(l2));
  return {
    unstable: growth > 1e-9,
    growth,                                   // largest real eigenvalue, 1/TU
    eFoldTu: growth > 1e-9 ? 1 / growth : Infinity,
    // complex lambda^2 pair means oscillation with no real growing direction
    oscillatory: disc < 0,
  };
}

/**
 * All five, with their Jacobi constants and their linear character.
 *
 * The collinear brackets are chosen to sit strictly between the singularities:
 * L1 lies between the primaries, L2 beyond the Moon, L3 beyond the Earth. The
 * triangular pair is exact — each forms an equilateral triangle with the two
 * primaries, which is true for any mass ratio and needs no solving.
 */
export function lagrangePoints(mu = MU) {
  const eps = 1e-7;
  const L1x = solveAxis(-mu + eps, 1 - mu - eps, mu);
  const L2x = solveAxis(1 - mu + eps, 2.5, mu);
  const L3x = solveAxis(-2.5, -mu - eps, mu);
  const tri = Math.sqrt(3) / 2;
  const make = (name, x, y) => ({
    name, x, y,
    C: 2 * omega(x, y, mu),
    ...linearAt(x, y, mu),
    // how far the model is from calling this an equilibrium at all
    residual: Math.hypot(...gradOmega(x, y, mu)),
  });
  return [
    make('L1', L1x, 0),
    make('L2', L2x, 0),
    make('L3', L3x, 0),
    make('L4', 0.5 - mu, tri),
    make('L5', 0.5 - mu, -tri),
  ];
}
