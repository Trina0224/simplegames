// gravity.js — Fog Mirror's src/orientation.js, plus a display rotation.
//
// The sensor mapping itself is copied verbatim and is still frozen: upright
// runs down; right edge physically down runs right; left edge physically down
// runs left; nearly flat gives weak in-plane gravity. Do not redesign it
// without a real-device test showing a regression.
//
// What was added is the one thing that mapping was missing, on device evidence:
// a rotation by the display's own orientation. DeviceMotion reports in the
// device's fixed frame, which is the screen's frame only while the display is
// in its natural orientation. Rainpane relayouts when you rotate the device, so
// past that point the two frames disagree by exactly screen.orientation.angle
// and the water runs the wrong way — sideways at a quarter turn, and straight
// UP with the tablet held upside-down, which is how this was found.
//
// The correction is the identity at angle 0, so every case the original mapping
// was verified against behaves exactly as before. It is a rotation of the
// answer, not a change to how the sensor is read.

export class GravitySensor {
  constructor() {
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
    this.enabled = false;
    this.available = 'DeviceMotionEvent' in window;
    this._bound = (e) => this._onMotion(e);
    this._last = null;
    this.raw = { x: 0, y: 0, z: 0 };
  }

  async start() {
    if (!this.available) return false;
    try {
      const Ctor = window.DeviceMotionEvent;
      if (typeof Ctor.requestPermission === 'function') {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') return false;
      }
      window.removeEventListener('devicemotion', this._bound);
      this._last = null;
      this.gx = 0;
      this.gy = 1;
      this.gz = 0;
      window.addEventListener('devicemotion', this._bound, { passive: true });
      this.enabled = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  stop() {
    window.removeEventListener('devicemotion', this._bound);
    this.enabled = false;
    this._last = null;
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;

    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    const tau = 0.24;
    const alpha = 1 - Math.exp(-dt / tau);

    // This is the exact gravity mapping from commit 89b765f, which was verified
    // on the target iPad before later gravity experiments changed it.
    // On that device, DeviceMotion x/y already track the physical screen, so do
    // not apply screen.orientation.angle again.
    const z = Number.isFinite(a.z) ? a.z : 0;
    const mag = Math.max(0.001, Math.hypot(a.x, a.y, z));
    const tx = -a.x / mag;
    const ty = -a.y / mag;
    const tz = -z / mag;

    this.raw = { x: a.x, y: a.y, z };
    this.gx += (tx - this.gx) * alpha;
    this.gy += (ty - this.gy) * alpha;
    this.gz += (tz - this.gz) * alpha;
  }

  /**
   * How far the display is turned from the device's natural orientation.
   * `screen.orientation` is the modern answer; iOS before 16.4 only has
   * `window.orientation`, which counts the same rotation the other way round.
   */
  angle() {
    const so = window.screen && window.screen.orientation;
    if (so && Number.isFinite(so.angle)) return ((so.angle % 360) + 360) % 360;
    const w = window.orientation;
    if (Number.isFinite(w)) return (((360 - w) % 360) + 360) % 360;
    return 0;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    // Rotated at read time rather than folded into the smoothing, so that
    // turning the device takes effect on the next frame instead of waiting for
    // a quarter-second filter to re-converge on the answer it already had.
    const th = (this.angle() * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dx = this.gx * c - this.gy * s;
    const dy = this.gx * s + this.gy * c;
    const plane = Math.min(1, Math.hypot(dx, dy));
    if (plane < 0.06) return { x: 0, y: 0, plane: 0 };
    return { x: dx / plane, y: dy / plane, plane };
  }

  debug() {
    return {
      source: 'DeviceMotionEvent / 89b765f mapping + display rotation',
      enabled: this.enabled,
      angle: this.angle(),
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, z: this.gz },
      vector: this.vector(),
    };
  }
}
