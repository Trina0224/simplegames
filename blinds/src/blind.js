// blind.js — the slat simulation. One angle per slat, a spring, and a string.
// No DOM and no camera in here, so the feel can be tested without a device.

export const MAX_ANGLE = 80;      // degrees; fully edge-on would be 90
const SIGMA = 1.2;                // falloff of a finger's influence, in slats
const K_REST = 380;               // spring stiffness when nothing is touching it
const K_DRIVE = 2400;             // stiffness under a finger, so the gap tracks it
const Z_REST = 0.55;              // damping ratio at rest: one small overshoot
const Z_DRIVE = 0.95;             // damping ratio under a finger: no wobble
const COUPLING = 0.08;            // how strongly a slat drags its neighbours
const STILL_ANGLE = 0.05;         // degrees
const STILL_VEL = 0.5;            // degrees per second

export class Blind {
  constructor(count = 1, pitch = 1) {
    this.resize(count, pitch);
    this.pointers = [];
    this.held = 0;                // 0..1, the accessibility "hold it open" control
    this.overshoot = true;        // false under prefers-reduced-motion
  }

  /**
   * Rebuild for a new slat count, carrying the current shape across so a
   * resize or rotation does not visibly rebuild the blind.
   */
  resize(count, pitch) {
    const previous = this.angles;
    const previousCount = previous ? previous.length : 0;
    this.count = count;
    this.pitch = pitch;
    this.angles = new Float32Array(count);
    this.velocities = new Float32Array(count);
    this.targets = new Float32Array(count);
    this.weights = new Float32Array(count);
    this._error = new Float32Array(count);
    if (previousCount) {
      for (let i = 0; i < count; i += 1) {
        const source = Math.min(previousCount - 1, Math.round((i / count) * previousCount));
        this.angles[i] = previous[source];
      }
    }
  }

  /** Active pointers, as y positions in blind-local pixels. */
  setPointers(ys) {
    this.pointers = ys;
  }

  /** 0 = let it fall shut, 1 = hold it fully open. */
  setHeld(amount) {
    this.held = Math.max(0, Math.min(1, amount));
  }

  get idle() {
    if (this.pointers.length || this.held > 0) return false;
    for (let i = 0; i < this.count; i += 1) {
      if (Math.abs(this.angles[i] - this.targets[i]) > STILL_ANGLE) return false;
      if (Math.abs(this.velocities[i]) > STILL_VEL) return false;
    }
    return true;
  }

  /** Peak opening, 0..1 — used to fade the frame's inner shadow. */
  get openness() {
    let peak = 0;
    for (let i = 0; i < this.count; i += 1) peak = Math.max(peak, this.angles[i]);
    return peak / MAX_ANGLE;
  }

  _updateTargets() {
    const { count, pitch, pointers, weights, targets } = this;
    const base = this.held;
    for (let i = 0; i < count; i += 1) {
      let weight = 0;
      const centre = (i + 0.5) * pitch;
      for (let p = 0; p < pointers.length; p += 1) {
        const d = (pointers[p] - centre) / pitch / SIGMA;
        const w = Math.exp(-d * d);
        // max, not sum: two fingers side by side must not push past the maximum.
        if (w > weight) weight = w;
      }
      if (base > weight) weight = base;
      weights[i] = weight;
      targets[i] = MAX_ANGLE * weight;
    }
  }

  /** One fixed timestep. Returns the largest closing impact, for the sound. */
  step(dt) {
    this._updateTargets();
    const { count, angles, velocities, targets, weights } = this;
    let impact = 0;

    for (let i = 0; i < count; i += 1) {
      const drive = weights[i];
      const k = K_REST + (K_DRIVE - K_REST) * drive;
      const rest = this.overshoot ? Z_REST : 1;
      const zeta = rest + (Z_DRIVE - rest) * drive;
      const c = 2 * zeta * Math.sqrt(k);
      const before = angles[i];
      velocities[i] += (k * (targets[i] - before) - c * velocities[i]) * dt;
      angles[i] = before + velocities[i] * dt;
      // A slat arriving back at shut is what makes the clack.
      if (before > 0.6 && angles[i] <= 0.6 && velocities[i] < 0) {
        impact = Math.max(impact, -velocities[i]);
      }
    }

    // The slats hang from one ladder cord, so each one drags its neighbours.
    // Smooth the *error* rather than the angle: motion spreads along the blind,
    // but a slat held under a finger still reaches its full target angle.
    if (COUPLING > 0 && count > 2) {
      const error = this._error || (this._error = new Float32Array(count));
      for (let i = 0; i < count; i += 1) error[i] = angles[i] - targets[i];
      for (let i = 0; i < count; i += 1) {
        const prev = error[i > 0 ? i - 1 : 0];
        const next = error[i < count - 1 ? i + 1 : count - 1];
        angles[i] = targets[i] + error[i] + COUPLING * (prev + next - 2 * error[i]);
      }
    }

    for (let i = 0; i < count; i += 1) {
      if (angles[i] < 0) { angles[i] = 0; if (velocities[i] < 0) velocities[i] = 0; }
      if (angles[i] > MAX_ANGLE) { angles[i] = MAX_ANGLE; if (velocities[i] > 0) velocities[i] = 0; }
    }

    return impact;
  }

  /** Snap to rest, used when rebuilding or when motion is not wanted. */
  settle() {
    this._updateTargets();
    this.angles.set(this.targets);
    this.velocities.fill(0);
  }
}

/** How much of the window a slat at this angle still covers, 0..1. */
export function coverage(angleDegrees) {
  return Math.cos((angleDegrees * Math.PI) / 180);
}
