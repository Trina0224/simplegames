// display.js — three ways of looking at one trajectory.
//
// There is exactly one physical solution, integrated once in rotating
// coordinates. Everything here is a coordinate change applied to states that
// already exist; nothing in this file may cause an integration, and none of it
// feeds back into the dynamics. frames.js holds the rotating<->inertial
// transform that the numerical validation suite checks; this module builds the
// display frames on top of it and is the only place the renderer and the input
// handler ask "where does this go on screen".
//
// The three frames, and what each is for:
//
//   rotating   the frame the CR3BP is written in. Earth, Moon and L1-L5 stand
//              still, and the horseshoe looks like a horseshoe.
//   earth      Earth held at the display origin, Moon revolving around it.
//              The familiar picture, and NOT an inertial frame: it is the
//              barycentric inertial solution with the origin translated onto
//              Earth's instantaneous state. Earth is not stationary in the
//              model and is never claimed to be.
//   inertial   barycentric, non-rotating. Where the motion is actually
//              happening, and where the horseshoe stops being a shape.
//
// SPEC.md 5.2 writes the Earth-following construction as
//
//     r_EF = r_inertial - r_earth,inertial
//     v_EF = v_inertial - v_earth,inertial
//
// and that subtraction is written out literally below rather than folded into
// an algebraically equal but differently-rounded shortcut, so that the
// validation suite compares the code against the spec's own arithmetic.

import { EARTH_X, MOON_X } from './constants.js?v=20260830p';
import { toInertial, toRotating } from './frames.js?v=20260830p';

/** The frames the UI may ask for, in the order they are offered. */
export const FRAMES = ['rotating', 'earth', 'inertial'];

/** What the readout calls each one. */
export const FRAME_LABEL = {
  rotating: 'rotating (synodic)',
  earth: 'Earth-following',
  inertial: 'barycentric inertial',
};

/**
 * Earth's own barycentric inertial state at time t.
 *
 * Earth sits at EARTH_X on the rotating x-axis with zero rotating velocity, so
 * its inertial motion is pure rotation about the barycentre at unit rate. This
 * is toInertial(EARTH_X, 0, 0, 0, t) written out; it is what gets subtracted.
 */
export function earthInertial(t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [EARTH_X * c, EARTH_X * s, -EARTH_X * s, EARTH_X * c];
}

/**
 * One rotating-frame position, in whichever frame is on screen.
 *
 * Each sample carries its own time: a trail is a sequence of states at
 * different instants, and rotating all of them by the time of the newest one
 * would draw a curve the spacecraft never flew.
 */
export function displayPos(x, y, t, frame) {
  if (frame === 'rotating') return [x, y];
  const c = Math.cos(t), s = Math.sin(t);
  const X = x * c - y * s, Y = x * s + y * c;
  if (frame !== 'earth') return [X, Y];
  return [X - EARTH_X * c, Y - EARTH_X * s];
}

/** A full state, positions and velocities together. */
export function displayState(x, y, vx, vy, t, frame) {
  if (frame === 'rotating') return [x, y, vx, vy];
  const st = toInertial(x, y, vx, vy, t);
  if (frame !== 'earth') return st;
  const e = earthInertial(t);
  return [st[0] - e[0], st[1] - e[1], st[2] - e[2], st[3] - e[3]];
}

/**
 * Where the primaries and the barycentre are at time t.
 *
 * In the Earth-following frame the subtraction leaves Earth at exactly (0, 0) —
 * bit-for-bit, not merely to tolerance — because it is its own translation.
 * The barycentre lands MU = 0.0122 DU (4671 km) from Earth's centre toward the
 * Moon, which is inside the Earth, and is the honest reason the frame is not
 * inertial: that point is the one going round in a circle, not Earth.
 */
export function displayBodies(t, frame) {
  if (frame === 'rotating') {
    return { earth: [EARTH_X, 0], moon: [MOON_X, 0], barycenter: [0, 0] };
  }
  return {
    earth: displayPos(EARTH_X, 0, t, frame),
    moon: displayPos(MOON_X, 0, t, frame),
    barycenter: displayPos(0, 0, t, frame),
  };
}

/** The five equilibria. They travel with the Earth-Moon line, not with Earth. */
export function displayPoints(points, t, frame) {
  return points.map((p) => {
    const [px, py] = displayPos(p.x, p.y, t, frame);
    return { ...p, px, py };
  });
}

/**
 * The inverse of displayState: a full state read off the displayed picture,
 * expressed in the rotating coordinates the integrator works in.
 *
 * Free Launch needs this and nothing else did. The user places a spacecraft and
 * drags out a velocity in whatever frame happens to be on screen, and what comes
 * back has to be one canonical rotating state -- FREE_LAUNCH_SPEC.md is explicit
 * that the three frames must not grow three different physics.
 *
 * Velocity cannot be inverted on its own: the rotating<->inertial velocity map
 * carries a term in the POSITION, which is why this takes and returns a whole
 * state rather than offering a tidier vector-only function that would be wrong.
 * (burnToRotating below is the exception that proves it -- an impulse leaves the
 * position alone, so that term cancels and only the rotation survives.)
 */
export function displayToRotating(X, Y, VX, VY, t, frame) {
  if (frame === 'rotating') return [X, Y, VX, VY];
  let ix = X, iy = Y, ivx = VX, ivy = VY;
  if (frame === 'earth') {
    // undo the translation first: the Earth-following frame IS the inertial one
    // with Earth's own state subtracted, so add it back and carry on.
    const e = earthInertial(t);
    ix += e[0]; iy += e[1]; ivx += e[2]; ivy += e[3];
  }
  return toRotating(ix, iy, ivx, ivy, t);
}

/**
 * A velocity change drawn in the displayed frame, expressed in rotating
 * coordinates so the integrator can use it.
 *
 * An impulsive burn does not move the spacecraft, so the position-dependent
 * part of the rotating<->inertial velocity map cancels and only the rotation
 * survives: dv_rot = R(-t) dV_inertial. The Earth-following frame differs from
 * the inertial one by a translation of both position and velocity, and a
 * translation common to both endpoints leaves a difference alone — so a Delta-v
 * read off the Earth-following view is already the inertial Delta-v, and the
 * same inverse rotation finishes the job.
 */
export function burnToRotating(dx, dy, t, frame) {
  if (frame === 'rotating') return [dx, dy];
  const c = Math.cos(t), s = Math.sin(t);
  return [dx * c + dy * s, -dx * s + dy * c];
}
