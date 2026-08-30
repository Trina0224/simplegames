// freelaunch3d.js — writing a six-state initial condition by hand.
//
// Phase 3's first two items, and they are the same editor: a free launch edits
// position and velocity from t = 0, and an impulsive burn edits velocity only,
// from wherever the spacecraft already is. Making them one object is not
// tidiness -- it is how the burn inherits the preview, the validity rules and
// the frame handling without a second copy that could disagree.
//
// The interaction problem, stated plainly because it drives every decision here:
// a screen point is a LINE through a 3D scene, so a drag can only ever set two
// of three components. THREE_D_SPEC.md 10 is explicit that vz must not be hidden
// behind an arbitrary default and the control still called 3D. So:
//
//   drag           sets the two horizontal components, on the plane at the
//                  current height -- direct manipulation, same as in 2D
//   z and vz       have their own sliders, with their own readouts
//
// Nothing is inferred. The third component is always somewhere you can see it
// and always somewhere you can change it.

import { MU, EARTH_RADIUS, MOON_RADIUS, EARTH_X, MOON_X } from './constants.js?v=20260830n';
import { jacobi3 } from './cr3bp3d.js?v=20260830n';

/** How far ahead a 3D preview looks. */
export const PREVIEW3_TU = 12;

export class Editor3D {
  constructor() {
    this.active = false;
    this.mode = 'launch';    // 'launch' edits position too; 'burn' does not
    this.state = null;       // [x, y, z, vx, vy, vz], rotating, at `epoch`
    this.epoch = 0;
    this.before = null;      // the state the burn started from, for the delta
    this.preview = null;
    this.pending = false;
    this.dirty = false;
    this.aim = -Math.PI / 4;
  }

  begin(state, { mode = 'launch', epoch = 0 } = {}) {
    this.active = true;
    this.mode = mode;
    this.epoch = epoch;
    this.state = state.slice();
    this.before = state.slice();
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
    if (!this.active || this.mode !== 'launch') return;
    this.state[0] = x; this.state[1] = y;
    this.dirty = true;
  }

  height(z) {
    if (!this.active || this.mode !== 'launch') return;
    this.state[2] = z;
    this.dirty = true;
  }

  setVelocity(vx, vy) {
    if (!this.active) return;
    this.state[3] = vx; this.state[4] = vy;
    this.dirty = true;
  }

  setVz(vz) {
    if (!this.active) return;
    this.state[5] = vz;
    this.dirty = true;
  }

  /** The impulse this edit represents, when it is a burn. */
  deltaV() {
    if (!this.before) return [0, 0, 0];
    return [this.state[3] - this.before[3], this.state[4] - this.before[4],
            this.state[5] - this.before[5]];
  }

  /**
   * Is this somewhere the equations can start from?
   *
   * The three-dimensional distance to a body centre, against the PHYSICAL radius
   * -- the same test collision uses. A projected distance would happily allow a
   * spacecraft placed directly above the Moon's centre at zero altitude.
   */
  invalidReason() {
    if (!this.state) return 'no state';
    const [x, y, z] = this.state;
    if (![x, y, z].every(Number.isFinite)) return 'not a position';
    if (Math.hypot(x - EARTH_X, y, z) < EARTH_RADIUS) return 'inside the Earth';
    if (Math.hypot(x - MOON_X, y, z) < MOON_RADIUS) return 'inside the Moon';
    return null;
  }

  valid() { return this.invalidReason() === null; }
  jacobi() { return this.state ? jacobi3(this.state, MU) : null; }
  speed() { return this.state ? Math.hypot(this.state[3], this.state[4], this.state[5]) : 0; }
}
