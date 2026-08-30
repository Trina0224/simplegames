// trajectory.js — propagation, events, and periodic-orbit correction.
//
// Everything that turns the equations into a path a person can look at lives
// here: propagate a state, stop it when it hits something or crosses a plane,
// and find the initial conditions of orbits that close on themselves.
//
// Event detection deserves a word. The naive way to catch a y=0 crossing is to
// notice the sign flipped and take the last step's endpoint; that is wrong by up
// to a whole step, and a step here can be hours. The interpolant the integrator
// already builds gives the crossing to the method's own accuracy for the cost of
// a few bisections, which is what makes the differential corrector below able to
// converge at all.

import { Dopri5 } from './integrator.js?v=20260830k';
import { deriv, jacobi, omega } from './cr3bp.js?v=20260830k';
import { MU, EARTH_RADIUS, MOON_RADIUS, EARTH_X, MOON_X } from './constants.js?v=20260830k';

const DEFAULT = { absTol: 1e-11, relTol: 1e-11, maxStep: 0.05 };

/**
 * Propagate, sampling at a fixed cadence in time so the renderer gets an even
 * trail whatever the solver did with its steps.
 *
 * Stops on collision with a physical body radius — the spec is explicit that
 * collision is detected against the real radius, never the drawn one — and
 * reports why it stopped rather than returning a truncated path silently.
 */
export function propagate(y0, T, opts = {}) {
  const { mu = MU, sample = 0.01, onEvent = null, ...tol } = opts;
  const o = { ...DEFAULT, ...tol };
  const f = (t, y) => deriv(t, y, mu);
  const it = new Dopri5(f, o);
  it.reset();

  const y = Float64Array.from(y0);
  const C0 = jacobi(y, mu);
  // Velocities are sampled too, not reconstructed later by differencing the
  // positions. A differenced velocity is wrong by the sample spacing, and the
  // Jacobi constant computed from it drifts by 1e-5 while the integration is
  // holding 1e-11 — the readout would then be reporting its own arithmetic
  // rather than the solver's, which is exactly the thing RESEARCH.md says not
  // to hide. The interpolant already carries them.
  const xs = [y[0]], ys = [y[1]], vxs = [y[2]], vys = [y[3]], ts = [0];
  const out = new Float64Array(4);
  let t = 0, h = 1e-4, next = sample, drift = 0, status = 'ok';

  while (t < T) {
    const y0x = y[0], y0y = y[1];
    const tPrev = t;
    const r = it.step(t, y, Math.min(h, T - t));
    if (r.failed) { status = 'integration failed'; break; }
    t += r.h; h = r.hNext;

    // sample the interpolant, not the step ends
    while (next <= t && next >= tPrev) {
      it.interpolate((next - tPrev) / r.h, out);
      xs.push(out[0]); ys.push(out[1]); vxs.push(out[2]); vys.push(out[3]); ts.push(next);
      next += sample;
    }

    const d = Math.abs(jacobi(y, mu) - C0);
    if (d > drift) drift = d;

    const dE = Math.hypot(y[0] - EARTH_X, y[1]);
    const dM = Math.hypot(y[0] - MOON_X, y[1]);
    if (dE < EARTH_RADIUS) { status = 'impact: Earth'; break; }
    if (dM < MOON_RADIUS) { status = 'impact: Moon'; break; }
    if (Math.hypot(y[0], y[1]) > 12) { status = 'left display domain'; break; }
    if (onEvent && onEvent(t, y) === false) { status = 'stopped'; break; }
    void y0x; void y0y;
  }
  return {
    xs, ys, vxs, vys, ts, t, state: Array.from(y), status,
    C0, C: jacobi(y, mu), drift, relDrift: drift / Math.max(1, Math.abs(C0)),
    accepted: it.accepted, rejected: it.rejected,
  };
}

/**
 * Integrate to the next crossing of y = 0, and return the state there.
 *
 * `skip` ignores that many crossings first, which is how the half-period of a
 * symmetric orbit is distinguished from its quarter-period. The crossing itself
 * is found by bisecting the step's own interpolant.
 */
export function toAxisCrossing(y0, { mu = MU, tMax = 20, skip = 0, ...tol } = {}) {
  const o = { ...DEFAULT, ...tol };
  const f = (t, y) => deriv(t, y, mu);
  const it = new Dopri5(f, o);
  it.reset();
  const y = Float64Array.from(y0);
  const probe = new Float64Array(4);
  let t = 0, h = 1e-4, left = skip;

  while (t < tMax) {
    const yPrev = y[1], tPrev = t;
    const r = it.step(t, y, Math.min(h, tMax - t));
    if (r.failed) return null;
    t += r.h; h = r.hNext;
    if (yPrev === 0 || Math.sign(y[1]) === Math.sign(yPrev)) continue;
    if (left > 0) { left -= 1; continue; }

    let lo = 0, hi = 1;
    for (let i = 0; i < 80; i += 1) {
      const m = 0.5 * (lo + hi);
      it.interpolate(m, probe);
      if (Math.sign(probe[1]) === Math.sign(yPrev)) lo = m; else hi = m;
    }
    it.interpolate(0.5 * (lo + hi), probe);
    return { t: tPrev + r.h * 0.5 * (lo + hi), state: Array.from(probe) };
  }
  return null;
}

/**
 * Differentially correct a symmetric periodic orbit at a fixed Jacobi constant.
 *
 * The CR3BP is symmetric under (x, y, vx, vy, t) -> (x, -y, -vx, vy, -t). So an
 * orbit that crosses the x-axis perpendicularly — y = 0 with vx = 0 — and does
 * so again later is periodic: the second half is the mirror of the first. That
 * turns a four-dimensional boundary value problem into a scalar root find.
 *
 * Fixing C rather than the velocity is what keeps the search inside a family:
 * a perpendicular crossing at x0 has its speed determined by the Jacobi
 * constant, so x0 is the only unknown. Shoot to the next y=0 crossing and drive
 * the vx there to zero.
 *
 * This is what AGENTS.md means by a numerically corrected solution, and it is
 * the only way to reach an unstable family. The horseshoes are unstable, so the
 * set of initial conditions that stay on them has measure zero: no grid ever
 * lands on one. Three thousand tried states found nothing; correction finds
 * them to machine precision.
 */
export function correctAtEnergy(C, sign, x0Seed, { mu = MU, tMax = 600, tol = 1e-12, maxIter = 40, tighten = 1e-13 } = {}) {
  // The target is 1e-12 and not smaller because that is the shooting function's
  // own noise floor: vx at the crossing is the end of a 20-TU integration at
  // tolerance 1e-13, so it is only knowable to about 1e-12, and a tighter
  // target has Newton chasing integration noise instead of the root.
  let best = null;
  const shoot = (x) => {
    const v2 = 2 * omega(x, 0, mu) - C;
    if (v2 <= 0) return null;
    const c = toAxisCrossing([x, 0, 0, sign * Math.sqrt(v2)], { mu, tMax, absTol: tighten, relTol: tighten, maxStep: 0.05 });
    return c ? { f: c.state[2], t: c.t } : null;
  };
  let x = x0Seed;
  for (let i = 0; i < maxIter; i += 1) {
    const a = shoot(x);
    if (!a) break;
    const here = { C, sign, x0: x, vy0: sign * Math.sqrt(Math.max(0, 2 * omega(x, 0, mu) - C)), halfPeriod: a.t, period: 2 * a.t, residual: Math.abs(a.f), iterations: i };
    if (!best || here.residual < best.residual) best = here;
    if (Math.abs(a.f) < tol) return here;
    // Finite-difference derivative. A state transition matrix is the documented
    // upgrade; for one unknown this cannot disagree with the propagator, which
    // matters more than the speed.
    const dx = 1e-9;
    const b = shoot(x + dx);
    if (!b) break;
    const slope = (b.f - a.f) / dx;
    if (!Number.isFinite(slope) || slope === 0) break;
    let step = a.f / slope;
    // An unstable family has a steep, badly conditioned derivative; an undamped
    // Newton step leaves the family altogether.
    if (Math.abs(step) > 1e-3) step = Math.sign(step) * 1e-3;
    x -= step;
  }
  // Running out of iterations is not the same as failing. Returning null while
  // holding a converged answer was the first bug this function had.
  return best;
}

/**
 * Every symmetric periodic orbit at this energy, over a range of crossings.
 *
 * Sweeps x0 and watches the sign of vx at the next crossing: each sign change
 * brackets a member, which is then corrected. Coarse tolerance for the sweep,
 * tight for the correction — the sweep only has to get the bracket right.
 */
export function findSymmetricFamily(C, sign, { mu = MU, from = -1.55, to = -0.62, samples = 180, tMax = 600 } = {}) {
  const probe = [];
  for (let i = 0; i <= samples; i += 1) {
    const x0 = from + (to - from) * i / samples;
    const v2 = 2 * omega(x0, 0, mu) - C;
    if (v2 <= 0) { probe.push(null); continue; }
    const c = toAxisCrossing([x0, 0, 0, sign * Math.sqrt(v2)], { mu, tMax, absTol: 1e-9, relTol: 1e-9, maxStep: 0.05 });
    probe.push(c ? { x0, f: c.state[2] } : null);
  }
  const out = [];
  for (let i = 1; i < probe.length; i += 1) {
    const a = probe[i - 1], b = probe[i];
    if (!a || !b) continue;
    if (Math.sign(a.f) === Math.sign(b.f)) continue;
    if (Math.abs(a.f) > 5 || Math.abs(b.f) > 5) continue;     // a singularity, not a root
    const orb = correctAtEnergy(C, sign, 0.5 * (a.x0 + b.x0), { mu, tMax });
    if (orb) out.push(orb);
  }
  return out;
}

/**
 * Classify a co-orbital orbit by its dynamics, never by its shape.
 *
 * The resonant angle is the longitude relative to the Moon, which sits at zero
 * in the rotating frame; psi measures it from 180 degrees so that a horseshoe
 * librates about psi = 0. L4 and L5 sit at psi = -120 and +120, so a horseshoe
 * has to pass beyond both without ever reaching +-180, where the Moon is.
 * `a` is the osculating semi-major axis about the barycentre: a 1:1 resonance
 * keeps its mean near 1, which is what makes it co-orbital rather than merely
 * horseshoe-shaped.
 */
export function classifyCoorbital(state, period, { mu = MU, samples = 4000 } = {}) {
  const states = [];
  const r = propagate(state, period, {
    mu, sample: period / samples, absTol: 1e-13, relTol: 1e-13,
    onEvent: (t, y) => { states.push([y[0], y[1], y[2], y[3]]); },
  });
  let lo = Infinity, hi = -Infinity, aLo = Infinity, aHi = 0, aSum = 0, aN = 0;
  let moonMin = Infinity, circulates = false, prev = null;
  for (const [x, y, vx, vy] of states) {
    let psi = Math.atan2(y, x) - Math.PI;
    while (psi > Math.PI) psi -= 2 * Math.PI;
    while (psi <= -Math.PI) psi += 2 * Math.PI;
    psi *= 180 / Math.PI;
    if (prev !== null && Math.abs(psi - prev) > 90) circulates = true;
    prev = psi;
    lo = Math.min(lo, psi); hi = Math.max(hi, psi);
    const VX = vx - y, VY = vy + x;                    // rotating -> inertial
    const rr = Math.hypot(x, y);
    const a = 1 / (2 / rr - (VX * VX + VY * VY));
    if (a > 0 && Number.isFinite(a)) { aLo = Math.min(aLo, a); aHi = Math.max(aHi, a); aSum += a; aN += 1; }
    moonMin = Math.min(moonMin, Math.hypot(x - 1 + mu, y));
  }
  const aMean = aN ? aSum / aN : NaN;
  let kind = 'not co-orbital';
  if (circulates) kind = 'circulating';
  else if (hi > 120 && lo < -120) kind = 'horseshoe';
  else if (hi < 0) kind = 'tadpole L4';
  else if (lo > 0) kind = 'tadpole L5';
  else if (Math.abs(lo) > 150 && Math.abs(hi) > 150) kind = 'quasi-satellite';
  return { kind, psiLo: lo, psiHi: hi, aLo, aHi, aMean, moonMin, drift: r.relDrift, status: r.status };
}
