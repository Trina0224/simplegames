// targeting3d.js — reaching something that is going somewhere.
//
// The planar targeting in targeting.js aims at L1..L5, which sit still in the
// rotating frame. Gateway does not. ARTEMIS_DEMO_SPEC.md is explicit about what
// that changes: "Do not target a frozen marker. The terminal condition must
// compare the spacecraft state with Gateway's state at the same future time."
//
// So the residual here is evaluated against a target state that is itself
// propagated to the arrival epoch. Targeting where Gateway is NOW would be a
// different and much easier problem whose answer is wrong by however far Gateway
// travels during the flight -- for a 6.5 day orbit and a multi-day transfer, most
// of the way round.
//
// Two more things this file is careful about, both of them lessons already paid
// for elsewhere in this project:
//
//   A candidate that did not fly the whole way is not a transfer. propagate3
//   stops early on impact and its terminal state is then wherever it stopped;
//   differencing THAT against the target still produces a number, and near a
//   body it can be a small one. Only an arc with status 'ok' that ran out of
//   time may be scored. (targeting.js records the planar version of this.)
//
//   Position is not rendezvous. Matching position alone is an intercept, and the
//   spec says not to call it anything else. A rendezvous needs the relative
//   VELOCITY driven to zero too, which one impulse cannot do -- so the arrival
//   burn is a second impulse, computed against the target's velocity AT ARRIVAL,
//   and the result is classified by measuring what the propagated trajectory
//   actually does rather than by what the algebra intended.

import { MU } from './constants.js?v=20260830n';
import { jacobi3 } from './cr3bp3d.js?v=20260830n';
import { propagate3 } from './trajectory3d.js?v=20260830n';
import { vuToMs } from './constants.js?v=20260830n';

/**
 * Where a periodic target is at time `t` after its own epoch zero.
 *
 * Reduced modulo the period, and that is the accurate choice rather than a
 * shortcut. An NRHO is violently unstable -- propagating one for ten periods
 * amplifies the initial condition's last bits into something visibly off the
 * orbit -- while the stored state closes to 6e-11 DU, about 20 metres. Flying
 * one period at a time from the stored state is therefore both cheaper and
 * closer to the truth than flying ten.
 */
export function targetAt(orbit, t, { mu = MU } = {}) {
  const T = orbit.period;
  let s = ((t % T) + T) % T;
  if (s === 0) return orbit.state.slice();
  const r = propagate3(orbit.state, s, { mu, sample: s, absTol: 1e-13, relTol: 1e-13 });
  return r.state.slice();
}

/**
 * Fly a candidate and report where it got to, and whether it got there at all.
 *
 * `reached` is the whole point: propagate3 leaves its loop with status 'ok' only
 * by running out of time, so 'ok' plus a full T is exactly "flew the whole way".
 */
export function endPoint3(state, T, mu = MU) {
  const r = propagate3(state, T, { mu, sample: T, absTol: 1e-11, relTol: 1e-11 });
  return {
    s: r.state.slice(),
    status: r.status,
    t: r.t,
    reached: r.status === 'ok' && r.t >= T - 1e-9 * Math.max(1, T),
  };
}

/** 3x3 solve, Gauss-Jordan with partial pivoting. */
function solve3(A, r) {
  const M = A.map((row, i) => [row[0], row[1], row[2], r[i]]);
  for (let c = 0; c < 3; c += 1) {
    let p = c;
    for (let i = c + 1; i < 3; i += 1) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (!(Math.abs(M[p][c]) > 1e-16)) return null;
    const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
    for (let i = 0; i < 3; i += 1) {
      if (i === c) continue;
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= 3; j += 1) M[i][j] -= f * M[c][j];
    }
  }
  const u = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  return u.every(Number.isFinite) ? u : null;
}

/**
 * Solve for the departure burn that puts the spacecraft where the target will be
 * in time `T`, then say what it would take to actually stop there.
 *
 * Three unknowns -- the burn's three components -- and three residuals, the
 * components of the arrival position error. Newton on a finite-difference
 * Jacobian, damped, because near a close approach the Jacobian goes nearly
 * singular and an undamped step lands the next guess inside the Moon.
 *
 * @param state   the spacecraft's six-state at departure
 * @param epoch   the departure time, on the TARGET's clock
 * @param target  {state, period} -- a periodic orbit the goal rides on
 * @param T       flight time
 */
export function solveRendezvous3(state, epoch, target, T, {
  mu = MU, posTol = 1e-6, velTol = 1e-9, maxIter = 40,
} = {}) {
  // Where the target will BE, not where it is. Computed once: it depends on the
  // arrival epoch, which is fixed for this flight time, and not on the burn.
  const goal = targetAt(target, epoch + T, { mu });

  const fly = (d) => {
    const e = endPoint3([state[0], state[1], state[2],
                         state[3] + d[0], state[4] + d[1], state[5] + d[2]], T, mu);
    return { ...e, r: [e.s[0] - goal[0], e.s[1] - goal[1], e.s[2] - goal[2]] };
  };

  let d = [0, 0, 0];
  // Two records, kept apart on purpose. `best` may only ever hold an iterate
  // that flew the whole way; `blocked` remembers the nearest one that did not,
  // so a refusal can say what stopped it instead of just failing.
  let best = null, blocked = null;
  for (let i = 0; i < maxIter; i += 1) {
    const m = fly(d);
    const err = Math.hypot(m.r[0], m.r[1], m.r[2]);
    if (m.reached) {
      if (!best || err < best.err) best = { d: d.slice(), err, arrival: m.s.slice(), iterations: i };
    } else if (!blocked || err < blocked.err) {
      blocked = { err, status: m.status, t: m.t };
    }
    if (m.reached && err < posTol) break;

    const h = 1e-7;
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let ok = true;
    for (let k = 0; k < 3 && ok; k += 1) {
      const dd = d.slice(); dd[k] += h;
      const a = fly(dd);
      if (!a.s.every(Number.isFinite)) { ok = false; break; }
      for (let row = 0; row < 3; row += 1) J[row][k] = (a.r[row] - m.r[row]) / h;
    }
    if (!ok) break;
    const step = solve3(J, m.r);
    if (!step) break;
    const n = Math.hypot(step[0], step[1], step[2]), cap = 0.05;
    const k = n > cap ? cap / n : 1;
    for (let j = 0; j < 3; j += 1) d[j] -= step[j] * k;
    if (!d.every(Number.isFinite)) break;
  }

  if (!best) {
    return blocked
      ? { converged: false, feasible: false, timeOfFlight: T,
          blocked: blocked.status, blockedAt: blocked.t, kind: 'infeasible' }
      : null;
  }

  // --- what it would take to STOP there ------------------------------------
  //
  // The arrival burn is measured against the target's velocity at the ARRIVAL
  // epoch. Against its velocity at departure -- the frozen-target mistake in its
  // other form -- this number would be wrong by however much the target
  // accelerated during the flight, which on an NRHO near perilune is most of its
  // speed.
  const arr = best.arrival;
  const dv2 = [goal[3] - arr[3], goal[4] - arr[4], goal[5] - arr[5]];
  const dv1mag = Math.hypot(best.d[0], best.d[1], best.d[2]);
  const dv2mag = Math.hypot(dv2[0], dv2[1], dv2[2]);

  // Measured, not asserted: the classification comes from the propagated arrival
  // state and the target's own state, both computed above.
  const posErr = best.err;
  const relSpeedBefore = dv2mag;
  const after = [arr[3] + dv2[0], arr[4] + dv2[1], arr[5] + dv2[2]];
  const relSpeedAfter = Math.hypot(after[0] - goal[3], after[1] - goal[4], after[2] - goal[5]);

  const departed = [state[0], state[1], state[2],
                    state[3] + best.d[0], state[4] + best.d[1], state[5] + best.d[2]];
  return {
    // the burns
    dv1: best.d.slice(), dv1Mag: dv1mag, dv1Ms: vuToMs(dv1mag),
    dv2: dv2.slice(), dv2Mag: dv2mag, dv2Ms: vuToMs(dv2mag),
    dvTotal: dv1mag + dv2mag, dvTotalMs: vuToMs(dv1mag + dv2mag),
    // the arrival, measured
    timeOfFlight: T,
    epoch, arrivalEpoch: epoch + T,
    arrival: arr, goal: goal.slice(),
    relPos: [arr[0] - goal[0], arr[1] - goal[1], arr[2] - goal[2]],
    posErr,
    relSpeedBefore, relSpeedAfter,
    // and what it may be called
    converged: posErr < posTol,
    feasible: true,
    status: 'ok',
    kind: classify(posErr, relSpeedAfter, posTol, velTol),
    blockedBy: blocked ? blocked.status : null,
    C0: jacobi3(state, mu), C1: jacobi3(departed, mu),
    iterations: best.iterations,
  };
}

/**
 * What a candidate may be called.
 *
 * The spec, twice: "A position-only intercept is not a rendezvous", and "Do not
 * call it docking until relative-state conditions support that term." So the
 * name is derived from the two measured residuals and nothing else -- there is
 * no path through this function that returns 'rendezvous' without both.
 */
export function classify(posErr, relSpeed, posTol = 1e-6, velTol = 1e-9) {
  if (!(posErr < posTol)) return 'missed';
  return relSpeed < velTol ? 'rendezvous' : 'intercept';
}

/**
 * Scan flight times and report the cheapest that converged.
 *
 * Deliberately not called optimal: it is a scan over a list, which is a much
 * weaker thing than an optimisation, and AGENTS.md forbids the stronger claim.
 */
export function planRendezvous3(state, epoch, target, {
  mu = MU, times = null, posTol = 1e-6, velTol = 1e-9,
} = {}) {
  const list = times || [0.5, 0.8, 1.2, 1.6, 2, 2.6, 3.2, 4, 5, 6, 7.5, 9, 11, 13];
  const solved = [];
  const blocked = new Map();
  for (const T of list) {
    const s = solveRendezvous3(state, epoch, target, T, { mu, posTol, velTol });
    if (s && s.converged && s.feasible) solved.push(s);
    else if (s && (s.blocked || s.blockedBy)) {
      const why = s.blocked || s.blockedBy;
      blocked.set(why, (blocked.get(why) || 0) + 1);
    }
  }
  solved.sort((a, b) => a.dvTotal - b.dvTotal);
  return {
    best: solved[0] || null,
    all: solved,
    tried: list.length,
    blocked: [...blocked.entries()].sort((a, b) => b[1] - a[1]),
  };
}
