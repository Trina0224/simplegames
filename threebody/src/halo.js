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

import { MU } from './constants.js?v=20260830i';
import { lagrangePoints } from './lagrange.js?v=20260830i';
import { jacobi3 } from './cr3bp3d.js?v=20260830i';
import { propagate3, toPlaneCrossing3 } from './trajectory3d.js?v=20260830i';

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
