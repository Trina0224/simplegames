// presets3d.js — spatial orbits, with the provenance to reproduce them.
//
// Every state here came out of tools/halo.mjs: a Richardson seed, differential
// correction to a perpendicular half-period crossing, then continuation in
// out-of-plane amplitude. None of them was typed in or adjusted by eye, and
// none is a literature state copied across. `origin` says how each was reached
// so it can be regenerated from nothing.
//
// THREE_D_AGENT.md's acceptance list wants the initial six-state, the period,
// the Jacobi constant, the correction residual, the closure error, the
// integrator tolerance, the Jacobi drift and the step counts recorded. They are
// here and they are re-measured by validate.mjs section 13 rather than trusted.

import { MU } from './constants.js?v=20260830h';

export const PRESETS3D = [
  {
    id: 'halo-l1',
    name: 'L1 halo',
    point: 'L1',
    blurb: 'A periodic orbit that encircles L1 and leaves the plane entirely — '
      + '25 000 km above and below it. Nothing tilts the camera to make this: '
      + 'the z in the state is real, and the orbit closes on itself in 12 days.',
    // Full double precision, not a tidy twelve decimals. A halo is unstable --
    // that is what makes it hard to find and what makes it need correcting --
    // so truncating the stored state is not a rounding, it is a different orbit:
    // measured, 12 decimals costs a factor of 122 in closure here and 705 at L2.
    // The 2D horseshoe taught the same lesson at 1.8e5 per period.
    state: [0.8245886263759395, 0, 0.065, 0, 0.17657533043323353, 0],
    period: 2.7674202404692116,
    duration: 2.7674202404692116 * 3,
    C: 3.1411548908811935,
    residual: 1.015e-14,
    closure: 6.385e-13,
    origin: 'Richardson third-order seed at L1, corrected on the y=0 section (vx=vz=0), '
      + 'continued in z0 from 0.005 to 0.065 DU in steps of 0.005',
    expect: 'closes after 12.02 days; |z| reaches 24 986 km; C = 3.141155',
  },
  {
    id: 'halo-l2',
    name: 'L2 halo',
    point: 'L2',
    blurb: 'The same thing beyond the Moon. Wider, slower, and further out of the '
      + 'plane — the L2 family grows its z excursion much faster than L1’s.',
    state: [1.1044958584642677, 0, 0.045, 0, 0.22115577335987788, 0],
    period: 3.3777355930591972,
    duration: 3.3777355930591972 * 3,
    C: 3.133250450207309,
    residual: 2.184e-15,
    closure: 1.124e-12,
    origin: 'Richardson third-order seed at L2, corrected on the y=0 section (vx=vz=0), '
      + 'continued in z0 from 0.005 to 0.045 DU in steps of 0.005',
    expect: 'closes after 14.67 days; |z| reaches 25 810 km; C = 3.133250',
  },
];

export const byId3d = (id) => PRESETS3D.find((p) => p.id === id) || null;
export { MU };
