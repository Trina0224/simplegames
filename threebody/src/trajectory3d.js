// trajectory3d.js — propagation and sections for the spatial problem.
//
// Deliberately a sibling of trajectory.js rather than a generalisation of it.
// THREE_D_AGENT.md rule 10 says the 2D tests are not weakened to make 3D pass,
// and the surest way to honour that is to leave the planar file alone and let
// the regression test compare the two rather than assume a shared rewrite is
// faithful. They share the integrator, and that sharing is checked: the planar
// suite's output is identical across the change that made it six-state capable.
//
// Collision is the three-dimensional distance to a body centre, against the
// physical radius (rule 9). A projected 2D distance would let a spacecraft pass
// straight through the Moon as long as it did so from above.

import { Dopri5 } from './integrator.js?v=20260830h';
import { deriv3, jacobi3 } from './cr3bp3d.js?v=20260830h';
import { MU, EARTH_RADIUS, MOON_RADIUS, EARTH_X, MOON_X } from './constants.js?v=20260830h';

// The planar solver's defaults, deliberately, so a 3D run of a planar state is
// asked for the same accuracy rather than a quietly different one.
//
// The two will still not take identical STEPS at z = 0, and that is expected:
// the error norm is an RMS over the state width, so six components -- two of
// them exactly zero -- give a norm sqrt(4/6) times the planar one and the
// controller therefore picks different step sizes. What has to agree is the
// TRAJECTORY, to within the tolerance asked for, and that is measured by
// tightening both and watching the difference fall.
const DEFAULT = { absTol: 1e-11, relTol: 1e-11, maxStep: 0.05 };

export function propagate3(y0, T, opts = {}) {
  const { mu = MU, sample = 0.01, ...tol } = opts;
  const o = { ...DEFAULT, ...tol, dim: 6 };
  const f = (t, y) => deriv3(t, y, mu);
  const it = new Dopri5(f, o);
  it.reset();

  const y = Float64Array.from(y0);
  const C0 = jacobi3(y, mu);
  const xs = [y[0]], ys = [y[1]], zs = [y[2]];
  const vxs = [y[3]], vys = [y[4]], vzs = [y[5]], ts = [0];
  const out = new Float64Array(6);
  let t = 0, h = 1e-4, next = sample, drift = 0, status = 'ok';

  while (t < T) {
    const tPrev = t;
    const r = it.step(t, y, Math.min(h, T - t));
    if (r.failed) { status = 'integration failed'; break; }
    t += r.h; h = r.hNext;

    while (next <= t && next >= tPrev) {
      it.interpolate((next - tPrev) / r.h, out);
      xs.push(out[0]); ys.push(out[1]); zs.push(out[2]);
      vxs.push(out[3]); vys.push(out[4]); vzs.push(out[5]); ts.push(next);
      next += sample;
    }

    const d = Math.abs(jacobi3(y, mu) - C0);
    if (d > drift) drift = d;

    if (Math.hypot(y[0] - EARTH_X, y[1], y[2]) < EARTH_RADIUS) { status = 'impact: Earth'; break; }
    if (Math.hypot(y[0] - MOON_X, y[1], y[2]) < MOON_RADIUS) { status = 'impact: Moon'; break; }
    if (Math.hypot(y[0], y[1], y[2]) > 12) { status = 'left display domain'; break; }
  }
  return {
    xs, ys, zs, vxs, vys, vzs, ts, t, state: Array.from(y), status,
    C0, C: jacobi3(y, mu), drift, relDrift: drift / Math.max(1, Math.abs(C0)),
    accepted: it.accepted, rejected: it.rejected,
  };
}

/**
 * Integrate to the next crossing of the x-z plane (y = 0) and return the state
 * there.
 *
 * This is the section the halo corrector shoots to. A halo is symmetric about
 * the x-z plane, so it crosses that plane perpendicularly -- vx = 0 and vz = 0 --
 * twice per revolution, half a period apart. Finding the crossing accurately is
 * what makes the corrector able to converge at all: taking the step endpoint
 * instead would be wrong by up to a whole step, and a step here can be hours.
 */
export function toPlaneCrossing3(y0, { mu = MU, tMax = 20, skip = 0, ...tol } = {}) {
  const o = { ...DEFAULT, ...tol, dim: 6 };
  const f = (t, y) => deriv3(t, y, mu);
  const it = new Dopri5(f, o);
  it.reset();
  const y = Float64Array.from(y0);
  const probe = new Float64Array(6);
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
