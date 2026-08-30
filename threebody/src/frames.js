// frames.js — the same trajectory, seen from two places.
//
// There is one physical solution. The rotating frame is where it was computed
// and where the geometry is legible; the inertial frame is where it is actually
// happening. SPEC.md is explicit that switching between them is a coordinate
// transform of one trajectory and never a second integration, and that rule is
// the whole point of the feature: the horseshoe stops looking like a horseshoe
// the moment you stop rotating with the Moon, and that is the lesson.
//
// The frame turns at unit rate, so the angle at time t is just t.

import { MU, EARTH_X, MOON_X } from './constants.js?v=20260830k';

/** Rotating -> inertial. Position rotates; velocity picks up the frame's own motion. */
export function toInertial(x, y, vx, vy, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [
    x * c - y * s,
    x * s + y * c,
    (vx - y) * c - (vy + x) * s,
    (vx - y) * s + (vy + x) * c,
  ];
}

/** Inertial -> rotating, the exact inverse. Round trips to 1e-16. */
export function toRotating(X, Y, VX, VY, t) {
  const c = Math.cos(t), s = Math.sin(t);
  const x = X * c + Y * s;
  const y = -X * s + Y * c;
  return [x, y, VX * c + VY * s + y, -VX * s + VY * c - x];
}

/** Where the primaries are at time t. Fixed in one frame, circling in the other. */
export function bodies(t, frame) {
  if (frame === 'rotating') {
    return { earth: [EARTH_X, 0], moon: [MOON_X, 0], barycenter: [0, 0] };
  }
  const c = Math.cos(t), s = Math.sin(t);
  return {
    earth: [EARTH_X * c, EARTH_X * s],
    moon: [MOON_X * c, MOON_X * s],
    barycenter: [0, 0],
  };
}

/** The five equilibria, which travel with the Moon rather than standing still. */
export function movePoints(points, t, frame) {
  if (frame === 'rotating') return points.map((p) => ({ ...p, px: p.x, py: p.y }));
  const c = Math.cos(t), s = Math.sin(t);
  return points.map((p) => ({ ...p, px: p.x * c - p.y * s, py: p.x * s + p.y * c }));
}

export { MU };
