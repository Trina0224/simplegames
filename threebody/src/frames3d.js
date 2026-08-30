// frames3d.js — the same six-state history, seen from three places.
//
// THREE_D_SPEC.md 7: the planar transforms extend directly. The rotation is
// about z, so (x, y) turn and z is carried through untouched; the velocity picks
// up the frame's angular velocity in the plane and vz is likewise unchanged,
// because the frame has no angular velocity component out of the plane.
//
// The rule that matters more than the algebra: ONE integrated history, three
// ways of drawing it. No frame gets its own integration, ever.

import { EARTH_X, MOON_X } from './constants.js?v=20260830k';

/** Rotating -> barycentric inertial. */
export function toInertial3(x, y, z, vx, vy, vz, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [
    x * c - y * s,
    x * s + y * c,
    z,
    (vx - y) * c - (vy + x) * s,
    (vx - y) * s + (vy + x) * c,
    vz,
  ];
}

/** Inertial -> rotating, the exact inverse. */
export function toRotating3(X, Y, Z, VX, VY, VZ, t) {
  const c = Math.cos(t), s = Math.sin(t);
  const x = X * c + Y * s;
  const y = -X * s + Y * c;
  return [x, y, Z, VX * c + VY * s + y, -VX * s + VY * c - x, VZ];
}

/**
 * Earth's own barycentric inertial six-state.
 *
 * Earth stays in the reference plane in the ideal CR3BP, so its z and vz are
 * exactly zero -- which is why subtracting it leaves the spacecraft's z alone,
 * as THREE_D_RESEARCH.md notes. The out-of-plane excursion of a halo is the same
 * number in the Earth-following view as in the rotating one.
 */
export function earthInertial3(t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [EARTH_X * c, EARTH_X * s, 0, -EARTH_X * s, EARTH_X * c, 0];
}

export const FRAMES3 = ['rotating', 'earth', 'inertial'];

/** One six-state, in whichever frame is on screen. */
export function displayState3(x, y, z, vx, vy, vz, t, frame) {
  if (frame === 'rotating') return [x, y, z, vx, vy, vz];
  const st = toInertial3(x, y, z, vx, vy, vz, t);
  if (frame !== 'earth') return st;
  const e = earthInertial3(t);
  return [st[0] - e[0], st[1] - e[1], st[2] - e[2],
          st[3] - e[3], st[4] - e[4], st[5] - e[5]];
}

/** Position only, for trail samples that each carry their own time. */
export function displayPos3(x, y, z, t, frame) {
  if (frame === 'rotating') return [x, y, z];
  const c = Math.cos(t), s = Math.sin(t);
  let X = x * c - y * s, Y = x * s + y * c;
  if (frame === 'earth') { X -= EARTH_X * c; Y -= EARTH_X * s; }
  return [X, Y, z];
}

/** Where the primaries and the barycentre are. All of them stay at z = 0. */
export function bodies3(t, frame) {
  if (frame === 'rotating') {
    return { earth: [EARTH_X, 0, 0], moon: [MOON_X, 0, 0], barycenter: [0, 0, 0] };
  }
  return {
    earth: displayPos3(EARTH_X, 0, 0, t, frame),
    moon: displayPos3(MOON_X, 0, 0, t, frame),
    barycenter: displayPos3(0, 0, 0, t, frame),
  };
}
