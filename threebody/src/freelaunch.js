// freelaunch.js — the user writes the initial condition, the equations answer.
//
// FREE_LAUNCH_SPEC.md is emphatic about what this is NOT: no atmosphere, no
// staging, no propellant, no finite burn, no autopilot. The spacecraft is the
// same massless CR3BP test particle it always was. All this file does is hold a
// candidate [x, y, vx, vy] while the user edits it, and hand it to the same
// propagator everything else uses.
//
// Two decisions are worth stating because they are what keep the three display
// frames honest:
//
// 1. The candidate is stored in ROTATING coordinates, always. The user places
//    and aims in whichever frame is on screen, and app.js converts once, on the
//    way in, through display.js. Switching frames mid-edit therefore cannot
//    produce a second physical state -- there is only ever one, and the frames
//    are three ways of drawing it. That is acceptance test 6.
//
// 2. The editor works at epoch t = 0 and the clock is held there. The scene the
//    user aims into is the scene the trajectory starts in; if editing happened
//    at the running clock and Launch reset to zero, the Moon would jump between
//    the last preview and the launch. The spec allows another epoch convention
//    if it is documented; this is the one, and this is why.

import { MU, EARTH_RADIUS, MOON_RADIUS, EARTH_X, MOON_X } from './constants.js?v=20260830j';
import { jacobi } from './cr3bp.js?v=20260830j';

/** How far ahead a preview looks. Long enough to show the character of the
 *  orbit -- a capture, a loop, an escape -- without making the drag wait. */
export const PREVIEW_TU = 20;

export class FreeLaunch {
  constructor() {
    this.active = false;
    this.state = null;      // [x, y, vx, vy], rotating coordinates, epoch t = 0
    this.preview = null;    // whatever propagate() returned for it
    this.pending = false;   // a preview is in flight
    this.dirty = false;     // the state changed since the last preview started
    this.aim = -Math.PI / 2; // last meaningful heading, so a zero-speed sprite
                             // keeps pointing somewhere instead of flickering
  }

  begin(state) {
    this.active = true;
    this.state = state ? state.slice() : [0.5, 0.5, 0, 0];
    this.preview = null;
    this.dirty = true;
  }

  end() {
    this.active = false;
    this.preview = null;
    this.pending = false;
    this.dirty = false;
  }

  place(x, y) {
    if (!this.active) return;
    this.state[0] = x; this.state[1] = y;
    this.dirty = true;
  }

  setVelocity(vx, vy) {
    if (!this.active) return;
    this.state[2] = vx; this.state[3] = vy;
    this.dirty = true;
  }

  /**
   * Is this a state the equations can start from?
   *
   * Only one rule, and it is the physical radius -- the same one collision uses
   * in trajectory.js, never the radius the renderer draws. A point inside a body
   * is not a spacecraft, it is a typo.
   */
  invalidReason() {
    if (!this.state) return 'no state';
    const [x, y] = this.state;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'not a position';
    if (Math.hypot(x - EARTH_X, y) < EARTH_RADIUS) return 'inside the Earth';
    if (Math.hypot(x - MOON_X, y) < MOON_RADIUS) return 'inside the Moon';
    return null;
  }

  valid() { return this.invalidReason() === null; }

  /** The candidate's Jacobi constant, for the readout and for its own ZVC. */
  jacobi() { return this.state ? jacobi(this.state, MU) : null; }

  speed() { return this.state ? Math.hypot(this.state[2], this.state[3]) : 0; }
}
