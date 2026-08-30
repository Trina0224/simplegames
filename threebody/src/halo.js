// halo.js — finding a real periodic orbit that leaves the plane.
//
// The hard part is not evaluating the equations, exactly as it was for the 2D
// horseshoe: a halo is a measure-zero periodic solution inside an unstable
// region, so no grid and no random search will land on one. It has to be
// corrected into existence.
//
// The pipeline THREE_D_RESEARCH.md asks for, and what each piece is for:
//
//   Richardson third-order seed   only to land in the basin. Never displayed.
//   half-period section           the symmetry that makes it a 2x2 root find.
//   differential correction       what actually produces the orbit.
//   continuation in amplitude     what produces the family.
//
// Why a halo needs a third-order seed at all, when the 2D horseshoe needed none:
// near a collinear point the in-plane motion has frequency lambda and the
// out-of-plane motion has its own, and they are NOT equal. A linear seed
// therefore gives a Lissajous figure that never closes. The two frequencies are
// only brought into resonance by the nonlinear amplitude correction -- which is
// the constraint l1*Ax^2 + l2*Az^2 + Delta = 0 below. That relation is the whole
// reason halo orbits exist, and it cannot come from linear theory.
//
// Richardson (1980), Celestial Mechanics 22(3), 241-253, DOI 10.1007/BF01229511.
// Howell (1984), Celestial Mechanics 32, 53-71, DOI 10.1007/BF01358403.

import { MU, MOON_X, MOON_RADIUS } from './constants.js?v=20260830n';
import { lagrangePoints } from './lagrange.js?v=20260830n';
import { jacobi3 } from './cr3bp3d.js?v=20260830n';
import { propagate3, toPlaneCrossing3 } from './trajectory3d.js?v=20260830n';

/**
 * The Legendre coefficients of the expansion about a collinear point.
 *
 * `gamma` is the distance from the NEARER primary to the point, which for L1 and
 * L2 is the Moon. Everything downstream is a function of these.
 */
export function legendre(point, mu = MU) {
  const L = Object.fromEntries(lagrangePoints(mu).map((p) => [p.name, p]));
  const xL = L[point].x;
  const gamma = Math.abs(xL - (1 - mu));
  const c = (n) => (point === 'L1'
    ? (1 / gamma ** 3) * (mu + ((-1) ** n) * (1 - mu) * gamma ** (n + 1) / (1 - gamma) ** (n + 1))
    : ((-1) ** n / gamma ** 3) * (mu + (1 - mu) * gamma ** (n + 1) / (1 + gamma) ** (n + 1)));
  return { xL, gamma, c2: c(2), c3: c(3), c4: c(4) };
}

/**
 * A Richardson third-order halo, evaluated at its x-z plane crossing.
 *
 * At the crossing the expansion is at its simplest and its most useful: y has
 * only sine terms so it vanishes, and x and z have only cosine terms so their
 * derivatives vanish. The seed is therefore already of the perpendicular form
 * [x, 0, z, 0, vy, 0] that the corrector wants -- the same symmetry trick that
 * turned the 2D horseshoe into a scalar root find.
 *
 * `az` is the out-of-plane amplitude in NORMALISED units (fractions of the
 * Earth-Moon distance). `northern` picks between the mirror pair.
 */
/**
 * The third-order expansion's coefficients, once, for a given point.
 *
 * Split out because a halo and a Lissajous are the SAME expansion evaluated
 * under different rules: a halo obeys the amplitude constraint that brings the
 * in-plane and out-of-plane frequencies into resonance, and a Lissajous does
 * not. Sharing the coefficients is what makes that the only difference between
 * them, rather than two hand-written formulas that might drift apart.
 */
function expansion(point, mu) {
  const { xL, gamma, c2, c3, c4 } = legendre(point, mu);
  const lam = Math.sqrt((2 - c2 + Math.sqrt(9 * c2 * c2 - 8 * c2)) / 2);
  const k = (lam * lam + 1 + 2 * c2) / (2 * lam);
  const l2 = lam * lam;
  const d1 = (3 * l2 / k) * (k * (6 * l2 - 1) - 2 * lam);
  const d2 = (8 * l2 / k) * (k * (11 * l2 - 1) - 2 * lam);
  const a21 = 3 * c3 * (k * k - 2) / (4 * (1 + 2 * c2));
  const a22 = 3 * c3 / (4 * (1 + 2 * c2));
  const a23 = -3 * c3 * lam / (4 * k * d1) * (3 * k ** 3 * lam - 6 * k * (k - lam) + 4);
  const a24 = -3 * c3 * lam / (4 * k * d1) * (2 + 3 * k * lam);
  const b21 = -3 * c3 * lam / (2 * d1) * (3 * k * lam - 4);
  const b22 = 3 * c3 * lam / d1;
  const d21 = -c3 / (2 * l2);
  const a31 = -9 * lam / (4 * d2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k))
    + ((9 * l2 + 1 - c2) / (2 * d2)) * (3 * c3 * (2 * a23 - k * b21) + c4 * (2 + 3 * k * k));
  const a32 = -(9 * lam / (4 * d2)) * (4 * c3 * (k * a24 - b22) + k * c4)
    - (3 / (2 * d2)) * (9 * l2 + 1 - c2) * (c3 * (k * b22 + d21 - 2 * a24) - c4);
  const b31 = (3 / (8 * d2)) * 8 * lam * (3 * c3 * (k * b21 - 2 * a23) - c4 * (2 + 3 * k * k))
    + (3 / (8 * d2)) * (9 * l2 + 1 + 2 * c2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k));
  const b32 = (9 * lam / d2) * (c3 * (k * b22 + d21 - 2 * a24) - c4)
    + (3 * (9 * l2 + 1 + 2 * c2) / (8 * d2)) * (4 * c3 * (k * a24 - b22) + k * c4);
  const d31 = (3 / (64 * l2)) * (4 * c3 * a24 + c4);
  const d32 = (3 / (64 * l2)) * (4 * c3 * (a23 - d21) + c4 * (4 + k * k));
  const den = 2 * lam * (lam * (1 + k * k) - 2 * k);
  const s1 = ((3 / 2) * c3 * (2 * a21 * (k * k - 2) - a23 * (k * k + 2) - 2 * k * b21)
    - (3 / 8) * c4 * (3 * k ** 4 - 8 * k * k + 8)) / den;
  const s2 = ((3 / 2) * c3 * (2 * a22 * (k * k - 2) + a24 * (k * k + 2) + 2 * k * b22 + 5 * d21)
    + (3 / 8) * c4 * (12 - k * k)) / den;
  const a1 = -(3 / 2) * c3 * (2 * a21 + a23 + 5 * d21) - (3 / 8) * c4 * (12 - k * k);
  const a2 = (3 / 2) * c3 * (a24 - 2 * a22) + (9 / 8) * c4;
  return { xL, gamma, c2, c3, c4, lam, k, l2, a21, a22, a23, a24, b21, b22, d21,
    a31, a32, b31, b32, d31, d32, s1, s2,
    l1c: a1 + 2 * l2 * s1, l2c: a2 + 2 * l2 * s2, delta: l2 - c2,
    nuZ: Math.sqrt(c2) };
}

/**
 * The expansion at its x-z plane crossing, for given amplitudes in gamma units.
 *
 * Shared by the halo seed and the Lissajous seed. At tau1 = 0 the expansion is
 * at its simplest and its most useful: y has only sine terms so it vanishes, and
 * x and z have only cosine terms so their derivatives vanish.
 */
function atCrossing(E, Ax, Az, { northern = true, sign = 1 } = {}) {
  const { lam, k, gamma, xL, s1, s2, a21, a22, a23, a24, a31, a32,
    b21, b22, b31, b32, d21, d31, d32 } = E;
  const nu = 1 + s1 * Ax * Ax + s2 * Az * Az;
  const dm = northern ? 1 : -1;
  const xb = a21 * Ax * Ax + a22 * Az * Az - Ax + (a23 * Ax * Ax - a24 * Az * Az)
    + (a31 * Ax ** 3 - a32 * Ax * Az * Az);
  const zb = dm * (Az - 2 * d21 * Ax * Az + (d32 * Az * Ax * Ax - d31 * Az ** 3));
  const vyb = lam * nu * (k * Ax + 2 * (b21 * Ax * Ax - b22 * Az * Az)
    + 3 * (b31 * Ax ** 3 - b32 * Ax * Az * Az));
  return {
    state: [xL + sign * gamma * xb, 0, gamma * zb, 0, sign * gamma * vyb, 0],
    nu, period: 2 * Math.PI / (lam * nu),
  };
}

/**
 * A quasi-periodic Lissajous trajectory near a collinear point.
 *
 * The SAME expansion as a halo, with the amplitude constraint dropped. Ax and Az
 * are then independent, the in-plane frequency lambda*nu and the out-of-plane
 * one are no longer equal, and the motion never closes -- it winds around a
 * torus. That is the whole distinction and it is why this returns no period:
 * THREE_D_SPEC.md 9 is explicit that a Lissajous must not be called periodic,
 * and the surest way to keep that promise is for the object to have no period to
 * quote.
 *
 * It does not last forever either, and that is honest rather than a defect. L1
 * and L2 are unstable with an e-folding time under half a time unit, and a
 * third-order approximation of the centre manifold carries a small unstable
 * component that grows. Real Lissajous trajectories need station keeping for the
 * same reason. How long this one holds is measured, not asserted.
 */
export function lissajousSeed(point, ax, az, { mu = MU, northern = true, sign = 1 } = {}) {
  const E = expansion(point, mu);
  const Ax = ax / E.gamma, Az = az / E.gamma;
  const at = atCrossing(E, Ax, Az, { northern, sign });
  return {
    state: at.state, point, Ax: ax, Az: az,
    // the two frequencies that refuse to agree, which is what a Lissajous IS
    inPlane: E.lam * at.nu,
    outOfPlane: E.nuZ,
    ratio: (E.lam * at.nu) / E.nuZ,
    periodic: false,
  };
}

/**
 * Which way a trajectory eventually leaves the neighbourhood of a collinear
 * point, and when. Returns side 0 if it never does within tMax.
 */
function departure(state, xL, { mu = MU, tMax = 40, radius = 0.25 } = {}) {
  const r = propagate3(state, tMax, { mu, sample: 0.01, absTol: 1e-13, relTol: 1e-13 });
  for (let i = 0; i < r.xs.length; i += 1) {
    if (Math.hypot(r.xs[i] - xL, r.ys[i], r.zs[i]) > radius) {
      return { side: Math.sign(r.xs[i] - xL), t: r.ts[i], status: 'left the neighbourhood', bounded: false };
    }
  }
  // Leaving the ball is not the only way to stop being a Lissajous. An arc that
  // ends in the Moon has ended, and calling that "bounded for 30 TU" because it
  // never crossed a radius test would be the diagnostics choosing a flattering
  // question. Anything but a clean run to tMax counts as the end of the arc.
  return { side: 0, t: r.t, status: r.status, bounded: r.status === 'ok' && r.t >= tMax - 1e-9 };
}

/**
 * Push a Lissajous seed onto the centre manifold, by bisection.
 *
 * The third-order seed carries a small unstable component, and L1 and L2 have an
 * e-folding time under half a time unit, so it survives about a revolution and a
 * half before that component owns the trajectory. Measured: 4.4 TU at L1.
 *
 * No state-transition matrix is needed to fix this. A trajectory near a
 * collinear point leaves toward the nearer primary or away from it, and which
 * one depends continuously on the initial state; the set that leaves NEITHER way
 * is the boundary between them, and it is the manifold we want. So bracket the
 * two behaviours in one component and bisect. Each halving buys roughly another
 * e-folding, and double precision runs out at about e^36 -- which is where the
 * lifetime stops improving, not where the method does.
 *
 * Measured after refining: 60+ TU at L1 (about 22 revolutions), 32 TU at L2.
 * That is enough to watch the torus fill, which is the point of showing one.
 */
export function refineLissajous(seed, { mu = MU, tMax = 60, iterations = 60 } = {}) {
  const xL = legendre(seed.point, mu).xL;
  const base = seed.state;
  const at = (d) => [base[0], 0, base[2], 0, base[4] + d, 0];
  const probe = (d) => departure(at(d), xL, { mu, tMax: 40 });

  // bracket: widen until the two escape directions are both seen
  let lo = null, hi = null;
  for (const d of [0, 2e-4, -2e-4, 5e-4, -5e-4, 1e-3, -1e-3, 2e-3, -2e-3,
                   4e-3, -4e-3, 8e-3, -8e-3]) {
    const e = probe(d);
    if (e.side < 0 && (lo === null || Math.abs(d) < Math.abs(lo))) lo = d;
    if (e.side > 0 && (hi === null || Math.abs(d) < Math.abs(hi))) hi = d;
    if (lo !== null && hi !== null) break;
  }
  if (lo === null || hi === null) return null;

  let a = lo, b = hi;
  for (let i = 0; i < iterations; i += 1) {
    const m = 0.5 * (a + b);
    if (probe(m).side < 0) a = m; else b = m;
  }
  const dv = 0.5 * (a + b);
  const state = at(dv);
  const lasted = departure(state, xL, { mu, tMax });
  return {
    state, point: seed.point, Ax: seed.Ax, Az: seed.Az,
    inPlane: seed.inPlane, outOfPlane: seed.outOfPlane, ratio: seed.ratio,
    correction: dv, lifetime: lasted.t, ended: lasted.status || 'ok',
    bounded: lasted.bounded === true,
    C: jacobi3(state, mu), periodic: false,
  };
}

/**
 * Does this trajectory close, or does it wind?
 *
 * The distinction THREE_D_SPEC.md 9 insists on, measured rather than eyeballed.
 * Take the height at every second crossing of the x-z plane -- for a periodic
 * orbit those are the same point every time, so z repeats exactly. For a
 * Lissajous the two frequencies differ, so z precesses, and the spread over many
 * crossings is the evidence that it is not periodic.
 */
export function crossingHeights(state, n = 12, { mu = MU, tMax = 60 } = {}) {
  const zs = [];
  let y = state.slice(), t = 0;
  for (let i = 0; i < n * 2 && t < tMax; i += 1) {
    const c = toPlaneCrossing3(y, { mu, tMax: tMax - t, absTol: 1e-13, relTol: 1e-13 });
    if (!c) break;
    t += c.t; y = c.state;
    // The section is y = 0, so set it. The returned y is 1e-16 rather than zero,
    // and the crossing search skips its starting point only when y is EXACTLY
    // zero -- so without this the next search rediscovers the crossing it was
    // handed, at t of order 1e-9. That produced duplicated entries and, because
    // it broke the alternation, silently mixed the two faces of the orbit
    // together: the halo then measured a 45 000 km "spread" and looked as
    // aperiodic as the Lissajous.
    y[1] = 0;
    if (i % 2 === 1) zs.push(y[2]);      // every second crossing: the same face
  }
  if (zs.length < 2) return { zs, spread: 0 };
  return { zs, spread: Math.max(...zs) - Math.min(...zs) };
}

export function richardsonSeed(point, az, { mu = MU, northern = true, sign = 1 } = {}) {
  const { xL, gamma, c2, c3, c4 } = legendre(point, mu);
  const Az = az / gamma;                    // amplitudes are in gamma units

  const lam = Math.sqrt((2 - c2 + Math.sqrt(9 * c2 * c2 - 8 * c2)) / 2);
  const k = (lam * lam + 1 + 2 * c2) / (2 * lam);
  const l2 = lam * lam;

  const d1 = (3 * l2 / k) * (k * (6 * l2 - 1) - 2 * lam);
  const d2 = (8 * l2 / k) * (k * (11 * l2 - 1) - 2 * lam);

  const a21 = 3 * c3 * (k * k - 2) / (4 * (1 + 2 * c2));
  const a22 = 3 * c3 / (4 * (1 + 2 * c2));
  const a23 = -3 * c3 * lam / (4 * k * d1) * (3 * k ** 3 * lam - 6 * k * (k - lam) + 4);
  const a24 = -3 * c3 * lam / (4 * k * d1) * (2 + 3 * k * lam);
  const b21 = -3 * c3 * lam / (2 * d1) * (3 * k * lam - 4);
  const b22 = 3 * c3 * lam / d1;
  const d21 = -c3 / (2 * l2);

  const a31 = -9 * lam / (4 * d2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k))
    + ((9 * l2 + 1 - c2) / (2 * d2)) * (3 * c3 * (2 * a23 - k * b21) + c4 * (2 + 3 * k * k));
  const a32 = -(9 * lam / (4 * d2)) * (4 * c3 * (k * a24 - b22) + k * c4)
    - (3 / (2 * d2)) * (9 * l2 + 1 - c2) * (c3 * (k * b22 + d21 - 2 * a24) - c4);
  const b31 = (3 / (8 * d2)) * 8 * lam * (3 * c3 * (k * b21 - 2 * a23) - c4 * (2 + 3 * k * k))
    + (3 / (8 * d2)) * (9 * l2 + 1 + 2 * c2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k));
  const b32 = (9 * lam / d2) * (c3 * (k * b22 + d21 - 2 * a24) - c4)
    + (3 * (9 * l2 + 1 + 2 * c2) / (8 * d2)) * (4 * c3 * (k * a24 - b22) + k * c4);
  const d31 = (3 / (64 * l2)) * (4 * c3 * a24 + c4);
  const d32 = (3 / (64 * l2)) * (4 * c3 * (a23 - d21) + c4 * (4 + k * k));

  const den = 2 * lam * (lam * (1 + k * k) - 2 * k);
  const s1 = ((3 / 2) * c3 * (2 * a21 * (k * k - 2) - a23 * (k * k + 2) - 2 * k * b21)
    - (3 / 8) * c4 * (3 * k ** 4 - 8 * k * k + 8)) / den;
  const s2 = ((3 / 2) * c3 * (2 * a22 * (k * k - 2) + a24 * (k * k + 2) + 2 * k * b22 + 5 * d21)
    + (3 / 8) * c4 * (12 - k * k)) / den;

  const a1 = -(3 / 2) * c3 * (2 * a21 + a23 + 5 * d21) - (3 / 8) * c4 * (12 - k * k);
  const a2 = (3 / 2) * c3 * (a24 - 2 * a22) + (9 / 8) * c4;
  const l1c = a1 + 2 * l2 * s1;
  const l2c = a2 + 2 * l2 * s2;
  const delta = l2 - c2;

  // THE halo condition: in-plane and out-of-plane frequencies resonate only on
  // this curve. A requested Az with no real Ax has no halo, and saying so is
  // better than returning a number.
  const ax2 = -(l2c * Az * Az + delta) / l1c;
  if (!(ax2 > 0)) return null;
  const Ax = Math.sqrt(ax2);

  const nu = 1 + s1 * Ax * Ax + s2 * Az * Az;
  const period = 2 * Math.PI / (lam * nu);
  const dm = northern ? 1 : -1;

  // tau1 = 0: the perpendicular crossing of the x-z plane
  const xb = a21 * Ax * Ax + a22 * Az * Az - Ax + (a23 * Ax * Ax - a24 * Az * Az)
    + (a31 * Ax ** 3 - a32 * Ax * Az * Az);
  const zb = dm * (Az - 2 * d21 * Ax * Az + (d32 * Az * Ax * Ax - d31 * Az ** 3));
  const vyb = lam * nu * (k * Ax + 2 * (b21 * Ax * Ax - b22 * Az * Az)
    + 3 * (b31 * Ax ** 3 - b32 * Ax * Az * Az));

  // Back to synodic units.
  //
  // `sign` is the orientation of the expansion's x axis relative to the synodic
  // one. Texts differ on it and getting it wrong is silent -- the seed still
  // looks like a halo -- so it was settled by measurement rather than by reading:
  // both were tried and corrected, and +1 converges in 4 iterations at L1 AND L2
  // while -1 needs 8 at L1 and fails outright at L2. It is a seed either way;
  // the corrector is what decides, and it is what reports.
  return {
    state: [xL + sign * gamma * xb, 0, gamma * zb, 0, sign * gamma * vyb, 0],
    period, gamma, lambda: lam, k, Ax: Ax * gamma, Az: az, point, northern,
  };
}

/**
 * Differential correction to a genuinely periodic halo.
 *
 * Symmetry, stated explicitly as THREE_D_RESEARCH.md requires:
 *
 *   assumed    the orbit is symmetric about the x-z plane, so it crosses y = 0
 *              perpendicularly twice per revolution, half a period apart.
 *   fixed      z0 -- it is the amplitude parameter the family is continued in.
 *   corrected  x0 and vy0.
 *   section    the next y = 0 crossing after t = 0.
 *   residual   (vx, vz) at that crossing, driven to zero.
 *
 * Two residuals, two unknowns: a 2x2 Newton with a finite-difference Jacobian,
 * the same shape as the planar corrector. Differencing the whole map -- rather
 * than a state-transition matrix -- means the varying crossing TIME is handled
 * automatically instead of by an extra analytic term that is easy to get wrong.
 */
export function correctHalo(seed, { mu = MU, tol = 1e-11, maxIter = 40, tMax = 12,
                                    absTol = 1e-13, relTol = 1e-13 } = {}) {
  let x0 = seed[0], vy0 = seed[4];
  const z0 = seed[2];
  const shoot = (x, vy) => {
    const c = toPlaneCrossing3([x, 0, z0, 0, vy, 0], { mu, tMax, absTol, relTol });
    return c ? { vx: c.state[3], vz: c.state[5], half: c.t } : null;
  };
  let best = null;
  for (let i = 0; i < maxIter; i += 1) {
    const m = shoot(x0, vy0);
    if (!m) break;
    const err = Math.hypot(m.vx, m.vz);
    if (!best || err < best.err) best = { x0, vy0, err, half: m.half, iterations: i };
    if (err < tol) break;
    const h = 1e-8;
    const a = shoot(x0 + h, vy0), b = shoot(x0, vy0 + h);
    if (!a || !b) break;
    const j11 = (a.vx - m.vx) / h, j12 = (b.vx - m.vx) / h;
    const j21 = (a.vz - m.vz) / h, j22 = (b.vz - m.vz) / h;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
    let sx = (m.vx * j22 - m.vz * j12) / det;
    let sv = (m.vz * j11 - m.vx * j21) / det;
    const step = Math.hypot(sx, sv), cap = 0.02;
    if (step > cap) { sx *= cap / step; sv *= cap / step; }
    x0 -= sx; vy0 -= sv;
    if (!Number.isFinite(x0) || !Number.isFinite(vy0)) break;
  }
  if (!best) return null;
  const state = [best.x0, 0, z0, 0, best.vy0, 0];
  return {
    state, period: 2 * best.half, residual: best.err,
    converged: best.err < tol, iterations: best.iterations,
    C: jacobi3(state, mu),
  };
}

/** Fly one full period and report how nearly it came back. */
export function closure(orbit, { mu = MU, absTol = 1e-13, relTol = 1e-13 } = {}) {
  const r = propagate3(orbit.state, orbit.period, { mu, sample: orbit.period / 2000, absTol, relTol });
  let d = 0;
  for (let i = 0; i < 6; i += 1) d = Math.hypot(d, r.state[i] - orbit.state[i]);
  let zMax = 0;
  for (const z of r.zs) zMax = Math.max(zMax, Math.abs(z));
  return { error: d, run: r, zMax };
}

/**
 * Correct a halo with any ONE of the three initial components held fixed.
 *
 * Continuation in z0 walks the family beautifully until the family stops being a
 * function of z0 -- and at L2 it does, which is where NRHO territory begins.
 * Past the fold two members share a z0 and the corrector cannot choose between
 * them; it stops converging while the family itself carries on quite happily.
 * Holding a different component keeps going where z0 cannot.
 */
function correctWith(seed, hold, { mu = MU, tol = 1e-11, maxIter = 40, tMax = 12,
                                   absTol = 1e-13, relTol = 1e-13 } = {}) {
  // 'z' fixes z0 and corrects (x0, vy0); 'x' fixes x0 and corrects (z0, vy0)
  const free = hold === 'x' ? [2, 4] : [0, 4];
  const y = seed.slice();
  const shoot = (a, b) => {
    const st = y.slice();
    st[free[0]] = a; st[free[1]] = b;
    const c = toPlaneCrossing3(st, { mu, tMax, absTol, relTol });
    return c ? { vx: c.state[3], vz: c.state[5], half: c.t } : null;
  };
  let p = y[free[0]], q = y[free[1]], best = null;
  for (let i = 0; i < maxIter; i += 1) {
    const m = shoot(p, q);
    if (!m) break;
    const err = Math.hypot(m.vx, m.vz);
    if (!best || err < best.err) best = { p, q, err, half: m.half, iterations: i };
    if (err < tol) break;
    const h = 1e-8;
    const a = shoot(p + h, q), b = shoot(p, q + h);
    if (!a || !b) break;
    const j11 = (a.vx - m.vx) / h, j12 = (b.vx - m.vx) / h;
    const j21 = (a.vz - m.vz) / h, j22 = (b.vz - m.vz) / h;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
    let sp = (m.vx * j22 - m.vz * j12) / det;
    let sq = (m.vz * j11 - m.vx * j21) / det;
    const step = Math.hypot(sp, sq), cap = 0.02;
    if (step > cap) { sp *= cap / step; sq *= cap / step; }
    p -= sp; q -= sq;
    if (!Number.isFinite(p) || !Number.isFinite(q)) break;
  }
  if (!best) return null;
  const state = y.slice();
  state[free[0]] = best.p; state[free[1]] = best.q;
  return {
    state, period: 2 * best.half, residual: best.err,
    converged: best.err < tol, iterations: best.iterations, hold,
    C: jacobi3(state, mu),
  };
}

/**
 * The halo family walked down toward near-rectilinear geometry.
 *
 * NRHO is not a separate object. THREE_D_AGENT.md and THREE_D_SPEC.md 9 both
 * insist it is a region of the halo family's own landscape, reached by
 * continuation, so this is the same corrector walked further -- with the held
 * component switched from z0 to x0 at the fold, because past it the family is
 * no longer a function of z0, and a secant prediction in whichever parameter is
 * being held.
 *
 * What comes out is then checked for the thing that makes an NRHO an NRHO -- a
 * close lunar perilune and a long thin orbit -- rather than being labelled by
 * the shape it happens to draw.
 */
export function haloBranch(point, opts = {}) {
  const { steps = 400, dz = 0.0025, dx = -0.002, minStep = 2e-5 } = opts;
  const out = [];
  let prev = null, prev2 = null, hold = 'z', swapped = false;
  let step = dz;

  const take = (from, h, target) => {
    const idx = h === 'x' ? 0 : 2;
    const free = h === 'x' ? [2, 4] : [0, 4];
    const seed = from.state.slice();
    seed[idx] = target;
    if (prev2 && prev2.hold === h && from.param !== prev2.param) {
      const d = (target - from.param) / (from.param - prev2.param);
      for (const f of free) seed[f] = from.state[f] + d * (from.state[f] - prev2.state[f]);
    }
    return correctWith(seed, h, opts);
  };

  for (let i = 0; i < steps; i += 1) {
    if (!prev) {
      const r = richardsonSeed(point, 0.005, opts);
      if (!r) break;
      const o = correctWith(r.state, 'z', opts);
      if (!o || !o.converged) break;
      prev = { ...o, param: r.state[2], hold: 'z' };
      out.push(prev);
      continue;
    }

    // Halve the step rather than stopping. A failure here almost never means the
    // family has ended -- it means the predictor overshot into a region the
    // corrector cannot recover from, and the family goes on perfectly well at
    // half the stride. Measured: a fixed stride reaches a perilune of 13 931 km
    // and adaptive stepping keeps going from there.
    let o = null, target = null, tries = 0;
    let h = Math.abs(step);
    while (tries < 12 && h >= minStep) {
      target = prev.param + Math.sign(step) * h;
      o = take(prev, hold, target);
      if (o && o.converged) break;
      h /= 2; tries += 1; o = null;
    }

    if (!o && hold === 'z' && !swapped) {
      // The fold: past it the family is no longer a function of z0. Hold x0
      // instead and set off again.
      hold = 'x'; swapped = true; prev2 = null;
      step = dx;
      h = Math.abs(dx); tries = 0;
      while (tries < 12 && h >= minStep) {
        target = prev.state[0] + Math.sign(dx) * h;
        o = take({ ...prev, param: prev.state[0] }, hold, target);
        if (o && o.converged) break;
        h /= 2; tries += 1; o = null;
      }
      prev = { ...prev, param: prev.state[0] };
    }

    // A small residual is NOT enough, and this is the one place it matters.
    // The corrector drives (vx, vz) to zero at the next y = 0 crossing, which is
    // the half-period crossing only while the orbit still has exactly two such
    // crossings per revolution. Deep in the L1 branch that stops being true --
    // the orbit grazes the Moon and the topology changes -- and the corrector
    // then happily reports a residual of 1e-12 for a state whose orbit misses
    // itself by 2.4 DU after "one period". Measured, that is where the L1 branch
    // stops being a halo family, and the only thing that catches it is asking
    // whether the orbit actually CLOSES.
    if (o && o.converged && closure(o).error > 1e-6) o = null;

    if (!o) break;
    step = Math.sign(step) * Math.min(Math.abs(hold === 'x' ? dx : dz), h * 1.6);
    const m = { ...o, param: target, hold };
    prev2 = prev; prev = m;
    out.push(m);
  }
  return out;
}

/**
 * Pseudo-arclength continuation: the family walked with no held component at all.
 *
 * `haloBranch` walks the family by holding one component of the initial state and
 * correcting the other two. That works until the family turns over in whatever is
 * being held -- and the L2 branch turns over TWICE. The first fold is in z0 and
 * the branch handles it by switching to x0. The second is in x0, and it is where
 * the branch stops: measured, its last two members are 8.2e-5 apart in z0 and
 * 1.0e-7 apart in x0, which is a family running very nearly perpendicular to the
 * parameter it is being asked to advance. The stride collapses to `minStep` and
 * the walk ends at a perilune of 7412 km. Halving the stride does not help: with
 * minStep at 1e-7 it reaches 6729 km and stops for the same reason. A fold is not
 * the end of a family; it is the end of a PARAMETERISATION.
 *
 * So this one holds nothing. The unknown is the whole initial state
 * u = (x0, z0, vy0) -- y0, vx0 and vz0 are zero by the symmetry the corrector
 * assumes -- and the two residuals are (vx, vz) at the next y = 0 crossing, as
 * before. Two equations, three unknowns: the solution set is a curve, and the
 * family IS that curve. The third equation is the arclength condition
 *
 *     (u - u_pred) · t = 0
 *
 * which pins the corrector to the plane through the predicted point normal to the
 * family's own tangent. The tangent is the null vector of the 2x3 Jacobian, which
 * for a 2x3 matrix is just the cross product of its rows, and its sign is fixed by
 * continuity with the previous step. Nothing about that construction cares which
 * way the family happens to be leaning, so a fold in any component is simply not
 * an event.
 *
 * Measured: it passes the second fold without noticing and continues from a
 * perilune of 7412 km down to the lunar surface, through the geometry NASA
 * describes for Gateway (about 6.5 days, roughly 1 500 km at the near pass and
 * 70 000 km at the far one) on the way. Those members are found, not fitted.
 *
 * Closure loosens as it goes deep -- 1e-10 at the top, a few times 1e-9 at
 * Gateway depth -- and that is the orbits, not the arithmetic: these are violently
 * unstable and an initial condition good to 1e-11 cannot close better than its own
 * amplification allows. The gate is closure, as in `haloBranch`, so a member that
 * stops being periodic is dropped rather than reported.
 *
 * @param {Array} start   an already-corrected member to continue from
 * @param {Array} before  the member before it, which fixes the direction of travel
 */
export function haloArc(start, before, opts = {}) {
  const { mu = MU, steps = 6000, ds = 2e-4, minDs = 1e-9, tol = 1e-11,
          tMax = 12, absTol = 1e-13, relTol = 1e-13, closeTol = 1e-6,
          stopBelow = MOON_RADIUS } = opts;
  const P = { mu, tMax, absTol, relTol };
  const stateOf = (u) => [u[0], 0, u[1], 0, u[2], 0];

  // the two residuals, and the crossing time that gives the half period
  const shoot = (u) => {
    const c = toPlaneCrossing3(stateOf(u), P);
    return c ? { g: [c.state[3], c.state[5]], half: c.t } : null;
  };

  const jac = (u, m) => {
    const h = 1e-8, J = [[0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < 3; k += 1) {
      const v = u.slice(); v[k] += h;
      const a = shoot(v); if (!a) return null;
      J[0][k] = (a.g[0] - m.g[0]) / h;
      J[1][k] = (a.g[1] - m.g[1]) / h;
    }
    return J;
  };

  // null vector of a 2x3 matrix = the cross product of its rows, oriented to
  // continue in the direction already being travelled
  const tangent = (J, prev) => {
    const [a, b] = J;
    let t = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const n = Math.hypot(t[0], t[1], t[2]);
    if (!(n > 0) || !Number.isFinite(n)) return null;
    t = [t[0] / n, t[1] / n, t[2] / n];
    if (prev && t[0] * prev[0] + t[1] * prev[1] + t[2] * prev[2] < 0) t = [-t[0], -t[1], -t[2]];
    return t;
  };

  // 3x3 solve by Gauss-Jordan with partial pivoting -- small and dense enough
  // that nothing cleverer would earn its keep
  const solve3 = (A, r) => {
    const M = A.map((row, i) => [row[0], row[1], row[2], r[i]]);
    for (let c = 0; c < 3; c += 1) {
      let piv = c;
      for (let i = c + 1; i < 3; i += 1) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
      if (!(Math.abs(M[piv][c]) > 1e-16)) return null;
      const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      for (let i = 0; i < 3; i += 1) {
        if (i === c) continue;
        const f = M[i][c] / M[c][c];
        for (let j = c; j <= 3; j += 1) M[i][j] -= f * M[c][j];
      }
    }
    const u = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
    return u.every(Number.isFinite) ? u : null;
  };

  const correct = (pred, t) => {
    const u = pred.slice();
    for (let i = 0; i < 40; i += 1) {
      const m = shoot(u); if (!m) return null;
      const arc = (u[0] - pred[0]) * t[0] + (u[1] - pred[1]) * t[1] + (u[2] - pred[2]) * t[2];
      const err = Math.hypot(m.g[0], m.g[1]);
      if (err < tol && Math.abs(arc) < 1e-13) {
        return { u: u.slice(), half: m.half, residual: err, iterations: i };
      }
      const J = jac(u, m); if (!J) return null;
      const step = solve3([J[0], J[1], t], [m.g[0], m.g[1], arc]);
      if (!step) return null;
      const n = Math.hypot(step[0], step[1], step[2]), cap = 0.02;
      const k = n > cap ? cap / n : 1;
      for (let j = 0; j < 3; j += 1) u[j] -= step[j] * k;
      if (!u.every(Number.isFinite)) return null;
    }
    return null;
  };

  let u = [start.state[0], start.state[2], start.state[4]];
  let prevT = null;
  if (before) {
    const d = [u[0] - before.state[0], u[1] - before.state[2], u[2] - before.state[4]];
    const n = Math.hypot(d[0], d[1], d[2]);
    // the null vector's sign is arbitrary; without this the first step is as
    // likely to walk back up the family as down it
    if (n > 0) prevT = [d[0] / n, d[1] / n, d[2] / n];
  }

  const out = [];
  let stride = ds;
  for (let i = 0; i < steps; i += 1) {
    const m = shoot(u); if (!m) break;
    const J = jac(u, m); if (!J) break;
    const t = tangent(J, prevT); if (!t) break;

    let got = null, h = stride;
    while (h > minDs) {
      const pred = [u[0] + h * t[0], u[1] + h * t[1], u[2] + h * t[2]];
      const o = correct(pred, t);
      if (o) {
        const orbit = {
          state: stateOf(o.u), period: 2 * o.half, residual: o.residual,
          converged: true, iterations: o.iterations, hold: 'arc',
          C: jacobi3(stateOf(o.u), mu),
        };
        if (closure(orbit, { mu, absTol, relTol }).error < closeTol) { got = { o, orbit }; break; }
      }
      h /= 2;
    }
    if (!got) break;

    prevT = t; u = got.o.u;
    stride = Math.min(ds, h * 1.6);
    out.push(got.orbit);
    // A member whose perilune is under the lunar surface is not an orbit anyone
    // can fly, and the family really does continue into the Moon. Stop at the
    // ground rather than reporting orbits through it.
    if (lunarGeometry(got.orbit, { mu }).perilune <= stopBelow) { out.pop(); break; }
  }
  return out;
}

/** Perilune distance and the orbit's proportions -- what makes an NRHO one. */
export function lunarGeometry(orbit, { mu = MU } = {}) {
  const r = propagate3(orbit.state, orbit.period,
    { mu, sample: orbit.period / 4000, absTol: 1e-13, relTol: 1e-13 });
  let peri = Infinity, apo = 0, zMax = 0, xLo = Infinity, xHi = -Infinity;
  for (let i = 0; i < r.xs.length; i += 1) {
    const d = Math.hypot(r.xs[i] - MOON_X, r.ys[i], r.zs[i]);
    if (d < peri) peri = d;
    if (d > apo) apo = d;
    zMax = Math.max(zMax, Math.abs(r.zs[i]));
    xLo = Math.min(xLo, r.xs[i]); xHi = Math.max(xHi, r.xs[i]);
  }
  return { perilune: peri, apolune: apo, zMax, xSpan: xHi - xLo,
    // near-rectilinear means long and thin: tall in z against its width in x
    slenderness: zMax / Math.max(1e-12, xHi - xLo), run: r };
}

/**
 * A family, by continuation in the out-of-plane amplitude.
 *
 * Each member seeds the next, which is the point: only the first one needs
 * Richardson, and after that the family carries itself. Hand-tuning each member
 * separately is exactly what THREE_D_RESEARCH.md says not to do.
 */
export function haloFamily(point, azList, opts = {}) {
  const out = [];
  let prev = null, prev2 = null;
  for (const az of azList) {
    let seed;
    if (prev2) {
      // Secant prediction: extrapolate along the family rather than restarting
      // from where the last member happened to sit. Holding x0 and vy0 fixed
      // while jumping z0 works while the family is nearly flat and stops working
      // the moment it curves -- at L1 it survived exactly two steps. The tangent
      // costs nothing, since the previous two members are already in hand, and
      // it is what THREE_D_RESEARCH.md means by continuation rather than
      // independently hand-tuning states.
      const w = (az - prev.az) / (prev.az - prev2.az);
      seed = [
        prev.state[0] + w * (prev.state[0] - prev2.state[0]), 0, az, 0,
        prev.state[4] + w * (prev.state[4] - prev2.state[4]), 0,
      ];
    } else if (prev) {
      seed = [prev.state[0], 0, az, 0, prev.state[4], 0];
    } else {
      seed = (richardsonSeed(point, az, opts) || {}).state;
    }
    if (!seed) { out.push(null); continue; }
    const o = correctHalo(seed, opts);
    if (o && o.converged) { prev2 = prev; prev = { ...o, az }; out.push(prev); } else out.push(null);
  }
  return out;
}
