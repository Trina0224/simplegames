// events3.js — the moments on a trajectory worth going to.
//
// Right now that means the closest and furthest approach to the Moon, which is
// what makes a near-rectilinear orbit legible: watching one at a uniform rate
// spends most of the time out at apolune and blinks through the pass that gives
// the family its name.
//
// ARTEMIS_DEMO_SPEC.md F is specific about where the answer comes from -- "the
// actual extrema measured from the selected simulated trajectory rather than
// predetermined timestamps". A stored timestamp would be right for one orbit and
// silently wrong for every other member the family slider can reach, and nothing
// on screen would say so.
//
// It lives in its own module, apart from the DOM, because a function that finds
// an extremum can be checked against one and a function inside a click handler
// cannot.

import { MOON_X, EARTH_X, DU_KM } from './constants.js?v=20260830p';

/**
 * Refine a sampled extremum by the parabola through it and its neighbours.
 *
 * The samples bracket the true extremum rather than sitting on it. Three points
 * and a quadratic give the vertex exactly for the local curvature and cost
 * nothing, and the correction is not cosmetic: near perilune an NRHO is moving
 * faster than anywhere else on the orbit, so half a sample of error there is the
 * largest error anywhere on it.
 */
function vertex(a, b, c, t0, h) {
  const den = a - 2 * b + c;
  if (!Number.isFinite(den) || den === 0) return { t: t0, d: b };
  const f = Math.max(-1, Math.min(1, 0.5 * (a - c) / den));
  return { t: t0 + f * h, d: b - 0.25 * (a - c) * f };
}

/**
 * Where a run comes closest to and furthest from a body, measured from its own
 * samples.
 *
 * @param run    {xs, ys, zs, ts} and either n or a full-length xs
 * @param about  the body's x on the rotating axis; the Moon by default
 */
export function extrema3(run, about = MOON_X) {
  // Callers hold two shapes of record: the propagator's, and the app's, which
  // adds `n`. Reading `run.n` off the first gives undefined, the loop never runs,
  // and both extrema come back as sample zero -- which is how a far pass came to
  // report 3.1 thousand km on an orbit that reaches 70.9.
  const n = run.n || run.xs.length;
  const d = (i) => Math.hypot(run.xs[i] - about, run.ys[i], run.zs[i]);
  let near = 0, far = 0, lo = Infinity, hi = 0;
  for (let i = 0; i < n; i += 1) {
    const v = d(i);
    if (v < lo) { lo = v; near = i; }
    if (v > hi) { hi = v; far = i; }
  }
  const at = (i) => (i <= 0 || i >= n - 1
    ? { t: run.ts[i], d: d(i) }
    : vertex(d(i - 1), d(i), d(i + 1), run.ts[i], run.ts[i + 1] - run.ts[i]));
  const a = at(near), b = at(far);
  return {
    near: a.t, far: b.t,
    low: a.d, high: b.d,
    lowKm: a.d * DU_KM, highKm: b.d * DU_KM,
    nearIndex: near, farIndex: far,
  };
}

export { MOON_X, EARTH_X };
