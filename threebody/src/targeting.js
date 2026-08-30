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

import { MU } from './constants.js?v=20260830k';
import { jacobi } from './cr3bp.js?v=20260830k';
import { propagate } from './trajectory.js?v=20260830k';
import { vuToMs } from './constants.js?v=20260830k';

/**
 * Fly a candidate and report where it got to — and whether it got there at all.
 *
 * `reached` is the question that matters and the one this used to skip.
 * `propagate` stops early on impact, on escape and on integration failure, and
 * its terminal `state` is then wherever it stopped. Differencing that against
 * the target still produces a number, and for a target that sits near a body —
 * L1 and L2 are a few thousand kilometres from the Moon — that number can be
 * small enough to score as an arrival. A candidate that never flew the whole way
 * is not a transfer, whatever its terminal residual says, so the residual is not
 * allowed to speak for it.
 *
 * `propagate` leaves the loop with status 'ok' only by running out of time, so
 * 'ok' is exactly "reached T"; `t` is carried anyway, both as a check on that
 * and so a caller can say when the thing stopped.
 */
function endPoint(state, T, mu) {
  const r = propagate(state, T, { mu, sample: T, absTol: 1e-11, relTol: 1e-11 });
  return {
    p: [r.state[0], r.state[1]],
    status: r.status,
    t: r.t,
    reached: r.status === 'ok' && r.t >= T - 1e-9 * Math.max(1, T),
  };
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
    return { dx: e.p[0] - target[0], dy: e.p[1] - target[1], status: e.status, reached: e.reached, t: e.t };
  };
  // Two separate records. `best` may only ever hold an iterate that flew the
  // whole T, because that is the only kind that can be offered as an answer.
  // `blocked` remembers the nearest thing that did not, so a refusal can say
  // what stopped it rather than just "no solution".
  let best = null, blocked = null;
  for (let i = 0; i < maxIter; i += 1) {
    const m = miss(dvx, dvy);
    const err = Math.hypot(m.dx, m.dy);
    if (m.reached) {
      if (!best || err < best.err) best = { dvx, dvy, err, status: m.status, iterations: i };
    } else if (!blocked || err < blocked.err) {
      blocked = { err, status: m.status, t: m.t };
    }
    if (m.reached && err < tol) break;
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
  // Nothing flew the whole way. Say so, and say what got in the way; do not
  // fall back on the least-bad colliding arc, which is what a caller filtering
  // on `converged` alone would otherwise be handed.
  if (!best) {
    return blocked
      ? { converged: false, feasible: false, timeOfFlight: T, blocked: blocked.status, blockedAt: blocked.t }
      : null;
  }
  const after = [state[0], state[1], state[2] + best.dvx, state[3] + best.dvy];
  return {
    dvx: best.dvx, dvy: best.dvy,
    dv: Math.hypot(best.dvx, best.dvy),
    dvMs: vuToMs(Math.hypot(best.dvx, best.dvy)),
    timeOfFlight: T,
    residual: best.err,
    converged: best.err < tol,
    feasible: true,
    status: best.status,
    // What the iterates that did NOT fly the whole way ran into, if any. Not a
    // fault in this answer -- it flew -- but the reason a caller can give when
    // no flight time in a scan produced one.
    blockedBy: blocked ? blocked.status : null,
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
  const blocked = new Map();
  for (const T of list) {
    const s = solveBurn(state, target, T, { mu, tol });
    // `feasible` is checked as well as `converged` and not instead of it. They
    // are different claims -- one that the arithmetic converged, one that the
    // path exists -- and a transfer needs both to be true.
    if (s && s.converged && s.feasible) solved.push(s);
    else if (s && (s.blocked || s.blockedBy)) {
      const why = s.blocked || s.blockedBy;
      blocked.set(why, (blocked.get(why) || 0) + 1);
    }
  }
  solved.sort((a, b) => a.dv - b.dv);
  return {
    best: solved[0] || null,
    all: solved,
    tried: list.length,
    // e.g. [['impact: Moon', 4]] -- why the flight times that failed, failed
    blocked: [...blocked.entries()].sort((a, b) => b[1] - a[1]),
  };
}
