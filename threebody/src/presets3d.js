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

import { MU } from './constants.js?v=20260830m';
import { ARTEMIS3D } from './artemis.js?v=20260830m';

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

/**
 * A near-rectilinear halo orbit.
 *
 * Not a separate object and not a canned shape: THREE_D_SPEC.md 9 insists NRHO
 * is a REGION of the halo family's own landscape, and this is the same corrector
 * that produced the small halos above, walked 64 members down the L2 branch.
 *
 * Two things the walk needed. The family stops being a function of z0 partway
 * down -- that is the fold where NRHO territory begins -- so the held component
 * switches from z0 to x0 there, 33 steps in one and 31 in the other. And the
 * stride halves rather than stopping when the corrector cannot recover, because
 * a failure almost never means the family has ended.
 *
 * It is near-rectilinear by MEASUREMENT, not by the shape it draws: 74 611 km of
 * out-of-plane excursion against a 21 971 km span in x, a perilune 5 675 km above
 * the Moon's surface, and an apolune of 77 696 km.
 *
 * This is ideal Earth-Moon CR3BP, and it is not Gateway's orbit -- but for a
 * narrower reason than this comment used to give. It said reproducing Gateway's
 * geometry "would need an ephemeris model this project does not have", and that
 * turned out to be wrong: the same family, continued past the fold the branch was
 * stopping at, passes straight through 6.5 days and a 1 500 km near pass. See
 * GATEWAY_NRHO in artemis.js. What still needs an ephemeris is the OPERATIONAL
 * orbit -- the 9:2 synodic resonance is a resonance with the real Sun-Earth-Moon
 * system, and station keeping is what holds it. The spec says not to claim
 * operational fidelity, so this claims none.
 */
export const NRHO3D = {
  id: 'nrho-l2',
  name: 'L2 NRHO',
  point: 'L2',
  blurb: 'The same halo family, continued until it becomes long and thin. It '
    + 'swings 77 000 km out and then falls to within 5 675 km of the Moon’s '
    + 'surface, every 7.9 days. The whole orbit is one narrow loop standing on end.',
  state: [0.9870857208063908, 0, 0.019267509954168757, 0, 1.087606474285779, 0],
  period: 1.8109336821422881,
  duration: 1.8109336821422881 * 3,
  C: 3.0285534103016762,
  residual: 1.559e-12,
  closure: 3.255e-10,
  periluneKm: 7412,
  apoluneKm: 77696,
  slenderness: 3.396,
  origin: 'the L2 halo branch, continued from a Richardson seed at Az = 0.005 DU: '
    + '33 steps holding z0, then 31 holding x0 past the fold, with the stride halved '
    + 'on any step the corrector could not recover from',
  expect: 'perilune 5 675 km above the Moon; |z| 74 611 km against 21 972 km of x; closes in 7.86 days',
};

/**
 * Lissajous trajectories.
 *
 * Deliberately a SEPARATE list with no `period` field. THREE_D_SPEC.md 9: a
 * Lissajous must not be called periodic, and the surest way to keep that promise
 * is for the object to have no period to quote. What it has instead is two
 * frequencies that refuse to agree, a lifetime, and a measured proof that it
 * does not close.
 *
 * These are not forever. L1 and L2 have an e-folding time under half a time
 * unit, and a third-order approximation of the centre manifold carries a small
 * unstable component; bisecting onto the manifold buys about an e-folding per
 * halving until double precision runs out. Real Lissajous trajectories need
 * station keeping for exactly the same reason, so the honest thing is to say how
 * long each one holds rather than to loop it silently.
 */
export const LISSAJOUS3D = [
  {
    id: 'lissajous-l1',
    name: 'L1 Lissajous',
    point: 'L1',
    quasi: true,
    blurb: 'Not a periodic orbit. The in-plane and out-of-plane motions run at '
      + 'slightly different rates, so the path never closes — it winds around a '
      + 'torus, and every pass through the plane happens at a different height.',
    state: [0.8265876806734829, 0, 0.012600695082136853, 0, 0.10557236481730659, 0],
    lifetime: 35.94,
    duration: 33,
    C: 3.177632536340015,
    inPlane: 2.309798,
    outOfPlane: 2.268831,
    spreadKm: 3944,
    origin: 'Richardson third-order expansion at L1 with Ax = Az = 0.012 DU and the '
      + 'halo amplitude constraint dropped, then bisected onto the centre manifold '
      + 'between the two escape directions (60 halvings, dvy = 7.884e-3)',
    expect: 'never closes: 8 successive passes through the plane spread over 3 944 km',
  },
  {
    id: 'lissajous-l2',
    name: 'L2 Lissajous',
    point: 'L2',
    quasi: true,
    blurb: 'The same idea beyond the Moon, with a bigger vertical amplitude. Watch '
      + 'the height at which it crosses the plane: it is different every time, and '
      + 'that is what "quasi-periodic" means.',
    state: [1.1373725408640845, 0, 0.028017446905756273, 0, 0.08496866288616428, 0],
    lifetime: 34.36,
    duration: 31,
    C: 3.164342354612123,
    inPlane: 1.866213,
    outOfPlane: 1.786176,
    spreadKm: 15623,
    origin: 'Richardson third-order expansion at L2 with Ax = 0.015, Az = 0.030 DU and '
      + 'the halo amplitude constraint dropped, then bisected onto the centre manifold '
      + '(60 halvings, dvy = -9.211e-4)',
    expect: 'never closes: 8 successive passes through the plane spread over 15 623 km',
  },
];

export const ALL3D = [...PRESETS3D, NRHO3D, ...LISSAJOUS3D, ...ARTEMIS3D];
export const byId3d = (id) => ALL3D.find((p) => p.id === id) || null;
export { MU };
