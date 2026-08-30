// cr3bp.js — the equations of motion, and nothing else.
//
// This file is the one place the physics is defined. Every trajectory in the
// application comes through `accel` and through no other path: there is no
// second model for drawing, no eased version for the inertial view, no
// hand-authored behaviour near the Moon. AGENTS.md makes that a hard rule and
// the whole product depends on it, because the point of the thing is that the
// strange paths were not drawn by us.
//
// State is [x, y, vx, vy] in the rotating frame, normalised units.

import { MU } from './constants.js?v=20260830n';

/** Distance to the Earth, and to the Moon. */
export function radii(x, y, mu = MU) {
  const dx1 = x + mu;
  const dx2 = x - 1 + mu;
  return [Math.hypot(dx1, y), Math.hypot(dx2, y)];
}

/**
 * The effective potential.
 *
 *   Omega = (x^2 + y^2)/2 + (1-mu)/r1 + mu/r2
 *
 * The first term is centrifugal, the other two gravitational. Every other
 * quantity in the model — the Lagrange points, the Jacobi constant, the
 * zero-velocity curves — is a statement about this one function.
 */
export function omega(x, y, mu = MU) {
  const [r1, r2] = radii(x, y, mu);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}

/** dOmega/dx, dOmega/dy. */
export function gradOmega(x, y, mu = MU) {
  const [r1, r2] = radii(x, y, mu);
  const a = (1 - mu) / (r1 * r1 * r1);
  const b = mu / (r2 * r2 * r2);
  return [
    x - a * (x + mu) - b * (x - 1 + mu),
    y - a * y - b * y,
  ];
}

/**
 * Acceleration in the rotating frame.
 *
 *   xddot =  2*ydot + dOmega/dx
 *   yddot = -2*xdot + dOmega/dy
 *
 * The 2*ydot and -2*xdot terms are Coriolis. They are what make this problem
 * unlike anything in a two-body intuition: the spacecraft is deflected by its
 * own motion, and that deflection is where horseshoes come from.
 */
export function accel(state, mu = MU) {
  const [x, y, vx, vy] = state;
  const [ox, oy] = gradOmega(x, y, mu);
  return [2 * vy + ox, -2 * vx + oy];
}

/** The derivative of the state, for the integrator. */
export function deriv(t, state, mu = MU) {
  const [ax, ay] = accel(state, mu);
  return [state[2], state[3], ax, ay];
}

/**
 * The Jacobi constant, C = 2*Omega - v^2.
 *
 * The only integral of motion the CR3BP has, and therefore the only thing that
 * can tell us whether an integration is still describing physics. It is never
 * renormalised — RESEARCH.md forbids it — because a constant that is forced to
 * be constant measures nothing.
 */
export function jacobi(state, mu = MU) {
  const [x, y, vx, vy] = state;
  return 2 * omega(x, y, mu) - (vx * vx + vy * vy);
}

/**
 * The speed a state at (x, y) must have to sit on a given Jacobi constant.
 * Returns NaN inside a forbidden region, where the implied square is negative —
 * which is exactly what "forbidden" means.
 */
export function speedForJacobi(x, y, C, mu = MU) {
  const v2 = 2 * omega(x, y, mu) - C;
  return v2 < 0 ? NaN : Math.sqrt(v2);
}
