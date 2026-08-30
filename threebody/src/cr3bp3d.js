// cr3bp3d.js — the spatial circular restricted three-body problem.
//
// THREE_D_SPEC.md 2 writes it out and this file is that, in the same normalised
// Earth-Moon units the planar solver uses. The one structural requirement worth
// stating at the top, because everything else depends on it:
//
//   the planar problem is an INVARIANT SUBSPACE of this one.
//
// z = 0 and vz = 0 gives zddot = 0 exactly -- not to tolerance, exactly, since
// dOmega/dz carries a factor of z -- so a state that starts in the plane can
// never leave it, and the six-state propagator reproduces the validated planar
// trajectories. That is milestone B and it is checked in tools/validate.mjs
// rather than assumed here.
//
// This file does not replace cr3bp.js. The 2D core stays exactly as validated;
// THREE_D_AGENT.md rule 10 is that 2D tests are not weakened to make 3D pass, so
// the planar code keeps its own arithmetic and this is checked against it.

import { MU } from './constants.js?v=20260830p';

/** Distances to the two primaries, in three dimensions. */
export function radii3(x, y, z, mu = MU) {
  const dx1 = x + mu, dx2 = x - 1 + mu;
  return [Math.hypot(dx1, y, z), Math.hypot(dx2, y, z)];
}

/** The effective potential. Unchanged in form; r1 and r2 now carry z. */
export function omega3(x, y, z, mu = MU) {
  const [r1, r2] = radii3(x, y, z, mu);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}

/**
 * Its gradient.
 *
 * Note there is no z in the centrifugal term: the rotation is about z, so the
 * out-of-plane direction feels gravity alone. That is the whole reason halo
 * orbits are hard -- z has a restoring force but no centrifugal relief, so its
 * natural frequency differs from the in-plane one and the two only resonate at
 * a finite amplitude.
 */
export function gradOmega3(x, y, z, mu = MU) {
  const [r1, r2] = radii3(x, y, z, mu);
  const a = (1 - mu) / (r1 * r1 * r1);
  const b = mu / (r2 * r2 * r2);
  return [
    x - a * (x + mu) - b * (x - 1 + mu),
    y - a * y - b * y,
    -a * z - b * z,
  ];
}

/** Acceleration, with the Coriolis terms. */
export function accel3(s, mu = MU) {
  const [ox, oy, oz] = gradOmega3(s[0], s[1], s[2], mu);
  return [2 * s[4] + ox, -2 * s[3] + oy, oz];
}

/** dy/dt for the integrator: [vx, vy, vz, ax, ay, az]. */
export function deriv3(t, s, mu = MU) {
  const [ax, ay, az] = accel3(s, mu);
  return [s[3], s[4], s[5], ax, ay, az];
}

/** C = 2*Omega - v^2, with v now three-dimensional. */
export function jacobi3(s, mu = MU) {
  return 2 * omega3(s[0], s[1], s[2], mu) - (s[3] * s[3] + s[4] * s[4] + s[5] * s[5]);
}

/** A planar state widened into the spatial one, and back. */
export const lift = (s) => [s[0], s[1], 0, s[2], s[3], 0];
export const flatten = (s) => [s[0], s[1], s[3], s[4]];
