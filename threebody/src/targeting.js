// targeting.js — "go to L1" is a boundary value problem, not a waypoint.
//
// AGENTS.md is emphatic: never steer the spacecraft's position during ballistic
// flight. What the user asks for is a burn now such that the equations, left
// alone afterwards, deliver the spacecraft to the target later. That is a
// shooting problem, and its answer can be that there isn't one.
//
// The unknowns are the two components of the burn; the flight time is scanned
// rather than solved, because with time free the problem is underdetermined and
// the answer would be an arbitrary point on a curve of solutions.

import { MU } from './constants.js?v=20260830e';
import { jacobi } from './cr3bp.js?v=20260830e';
import { propagate } from './trajectory.js?v=20260830e';
import { vuToMs } from './constants.js?v=20260830e';

function endPoint(state, T, mu) {
  const r = propagate(state, T, { mu, sample: T, absTol: 1e-11, relTol: 1e-11 });
  return { p: [r.state[0], r.state[1]], status: r.status };
}

/**
 * Solve for the burn that reaches `target` in time `T`.
 *
 * Newton on a 2x2 finite-difference Jacobian. Damped, because a nearly-singular
 * Jacobian near a close approach otherwise throws the guess into the Moon and
 * the next iteration is meaningless.
 */
export function solveBurn(state, target, T, { mu = MU, tol = 1e-6, maxIter = 30 } = {}) {
  let dvx = 0, dvy = 0;
  const miss = (ax, ay) => {
    const e = endPoint([state[0], state[1], state[2] + ax, state[3] + ay], T, mu);
    return { dx: e.p[0] - target[0], dy: e.p[1] - target[1], status: e.status };
  };
  let best = null;
  for (let i = 0; i < maxIter; i += 1) {
    const m = miss(dvx, dvy);
    const err = Math.hypot(m.dx, m.dy);
    if (!best || err < best.err) best = { dvx, dvy, err, status: m.status, iterations: i };
    if (err < tol) break;
    const h = 1e-7;
    const a = miss(dvx + h, dvy);
    const b = miss(dvx, dvy + h);
    const j11 = (a.dx - m.dx) / h, j12 = (b.dx - m.dx) / h;
    const j21 = (a.dy - m.dy) / h, j22 = (b.dy - m.dy) / h;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
    let sx = (m.dx * j22 - m.dy * j12) / det;
    let sy = (m.dy * j11 - m.dx * j21) / det;
    const step = Math.hypot(sx, sy), cap = 0.05;
    if (step > cap) { sx *= cap / step; sy *= cap / step; }
    dvx -= sx; dvy -= sy;
    if (!Number.isFinite(dvx) || !Number.isFinite(dvy)) break;
  }
  if (!best) return null;
  const after = [state[0], state[1], state[2] + best.dvx, state[3] + best.dvy];
  return {
    dvx: best.dvx, dvy: best.dvy,
    dv: Math.hypot(best.dvx, best.dvy),
    dvMs: vuToMs(Math.hypot(best.dvx, best.dvy)),
    timeOfFlight: T,
    residual: best.err,
    converged: best.err < tol,
    status: best.status,
    C0: jacobi(state, mu),
    C1: jacobi(after, mu),
    iterations: best.iterations,
  };
}

/**
 * Try a range of flight times and report the cheapest that converged.
 *
 * Deliberately NOT called a minimum-delta-v solution. AGENTS.md forbids that
 * claim without an actual optimisation, and this is a scan over a handful of
 * flight times, which is a different and much weaker thing.
 */
export function planTransfer(state, target, { mu = MU, times = null, tol = 1e-5 } = {}) {
  // Out to 30 TU: a transfer between libration points is weeks to months, and
  // stopping at 13 declares "no solution" for journeys that simply take longer
  // than the list allowed.
  const list = times || [1.2, 1.8, 2.5, 3.2, 4, 5, 6.5, 8, 10, 13, 16, 20, 25, 30];
  const solved = [];
  for (const T of list) {
    const s = solveBurn(state, target, T, { mu, tol });
    if (s && s.converged) solved.push(s);
  }
  solved.sort((a, b) => a.dv - b.dv);
  return { best: solved[0] || null, all: solved, tried: list.length };
}
