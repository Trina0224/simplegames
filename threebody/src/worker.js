// worker.js — the solver, off the main thread.
//
// SPEC.md asks for this explicitly, and the reason is not that integration is
// slow. It is that integration and animation want completely different things:
// a horseshoe is 190 days of physics that has to be right, and the screen wants
// 60 evenly spaced pictures a second. Coupling them means either a stuttering
// animation or a solver whose step size is chosen by the display.
//
// So the worker computes physical states as fast as it can and the main thread
// plays back what it has. Nothing here decides how anything looks.

import { propagate } from './trajectory.js?v=20260830m';

self.onmessage = (e) => {
  const { id, state, duration, sample, absTol, relTol } = e.data;
  try {
    const r = propagate(state, duration, { sample, absTol, relTol });
    const xs = Float64Array.from(r.xs);
    const ys = Float64Array.from(r.ys);
    const vxs = Float64Array.from(r.vxs);
    const vys = Float64Array.from(r.vys);
    const ts = Float64Array.from(r.ts);
    self.postMessage({
      id, xs, ys, vxs, vys, ts,
      state: r.state, status: r.status, C0: r.C0, C: r.C,
      drift: r.drift, relDrift: r.relDrift,
      accepted: r.accepted, rejected: r.rejected,
    }, [xs.buffer, ys.buffer, vxs.buffer, vys.buffer, ts.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
