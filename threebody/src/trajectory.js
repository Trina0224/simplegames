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

import { Dopri5 } from './integrator.js';
import { deriv, jacobi } from './cr3bp.js';
import { MU, EARTH_RADIUS, MOON_RADIUS, EARTH_X, MOON_X } from './constants.js';

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
  const xs = [y[0]], ys = [y[1]], ts = [0];
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
      xs.push(out[0]); ys.push(out[1]); ts.push(next);
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
    xs, ys, ts, t, state: Array.from(y), status,
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
 * Differentially correct a symmetric periodic orbit.
 *
 * The CR3BP is symmetric under (x, y, vx, vy, t) -> (x, -y, -vx, vy, -t). So an
 * orbit that crosses the x-axis perpendicularly — y = 0 with vx = 0 — and does
 * so again later is periodic: the second half is the mirror of the first. That
 * turns "find a periodic orbit", which is a boundary value problem in four
 * dimensions, into a scalar root find: fix x0, vary vy0, and drive vx at the
 * next crossing to zero.
 *
 * This is the machinery AGENTS.md means by a numerically corrected solution. It
 * is also why a horseshoe cannot be found by trying initial conditions on a
 * grid: the family is unstable, so the set of states that stay on it has
 * measure zero, and only correction finds them.
 */
export function correctSymmetric(x0, vy0, { mu = MU, skip = 0, tMax = 40, tol = 1e-11, maxIter = 60 } = {}) {
  let v = vy0;
  const miss = (vv) => {
    const c = toAxisCrossing([x0, 0, 0, vv], { mu, skip, tMax, absTol: 1e-12, relTol: 1e-12 });
    return c ? { f: c.state[2], c } : null;
  };
  let last = null;
  for (let i = 0; i < maxIter; i += 1) {
    const a = miss(v);
    if (!a) return null;
    if (Math.abs(a.f) < tol) {
      return { x0, vy0: v, halfPeriod: a.c.t, period: 2 * a.c.t, crossing: a.c.state, iterations: i, residual: Math.abs(a.f) };
    }
    // Finite-difference derivative. A state transition matrix would be faster
    // and is the documented upgrade path; for a scalar unknown this is enough
    // and it cannot disagree with the propagator, which matters more.
    const dv = Math.max(1e-8, Math.abs(v) * 1e-6);
    const b = miss(v + dv);
    if (!b) return null;
    const slope = (b.f - a.f) / dv;
    if (!Number.isFinite(slope) || slope === 0) return null;
    let step = a.f / slope;
    // Damp the first steps: an unstable family has a steep, badly conditioned
    // derivative and an undamped Newton step leaves the family altogether.
    const cap = 0.05 * Math.max(1e-3, Math.abs(v));
    if (Math.abs(step) > cap) step = Math.sign(step) * cap;
    v -= step;
    last = a;
  }
  return last ? null : null;
}
