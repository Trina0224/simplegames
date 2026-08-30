// playback.js — how the playback clock advances, and when it stops.
//
// One rule, and it is not obvious enough to leave inline in the animation frame:
//
//   A trajectory that came back round may be played round again. One that ended
//   did not, and must not be.
//
// A halo closes, so looping its playback shows the reader exactly what the orbit
// does. A free launch that ends "impact: Moon" does not close: wrapping its clock
// to zero replays the crash on a loop, and a spacecraft that hits the Moon over
// and over is a picture of something that did not happen. The status field is
// what separates the two -- `ok` means the propagation reached the span it was
// asked for, anything else means an event stopped it early.
//
// It lives here, apart from the DOM, so the rule can be tested. The bug it fixes
// was invisible to every test in the suite because it was three lines inside a
// requestAnimationFrame callback.

/**
 * Advance a playback clock by dt and say whether playback continues.
 *
 * @param {number} clock  current playback time, in TU
 * @param {number} dt     elapsed time to add, in TU
 * @param {{ts: Float64Array|number[], n: number, status: string}} run
 * @param {boolean} loop  whether this view repeats a completed run
 * @returns {{t: number, playing: boolean}}
 */
export function advance(clock, dt, run, loop = false) {
  const end = run.ts[run.n - 1];
  const t = clock + dt;
  if (t < end) return { t, playing: true };
  if (loop && run.status === 'ok') return { t: 0, playing: true };
  return { t: end, playing: false };
}

/**
 * Where Play should resume from.
 *
 * Pressing Play on a run already sitting at its end would stop again on the very
 * next frame and read as a dead button. Play means play, so it starts over.
 */
export function resumeFrom(clock, run) {
  return clock >= run.ts[run.n - 1] ? 0 : clock;
}
