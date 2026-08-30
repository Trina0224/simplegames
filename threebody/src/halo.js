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

import { MU } from './constants.js?v=20260830h';
import { lagrangePoints } from './lagrange.js?v=20260830h';
import { jacobi3 } from './cr3bp3d.js?v=20260830h';
import { propagate3, toPlaneCrossing3 } from './trajectory3d.js?v=20260830h';

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
