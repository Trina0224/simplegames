// gravity.js — Fog Mirror's src/orientation.js, plus a display rotation.
//
// The sensor mapping itself is copied verbatim and is still frozen: upright
// runs down; right edge physically down runs right; left edge physically down
// runs left; nearly flat gives weak in-plane gravity. Do not redesign it
// without a real-device test showing a regression.
//
// What was added is the one thing that mapping was missing, on device evidence:
// a rotation from the frame the sensor reports in to the frame the page is laid
// out in. Rainpane relayouts when you turn the device; the sensor does not, so
// past that point the two disagree and the water runs the wrong way.
//
// The subtlety, and it cost a wrong fix first: those two frames are measured
// from DIFFERENT reference orientations. CoreMotion's axes are fixed to the
// hardware with +y toward the top of the device *in portrait*, on every iOS
// device. `screen.orientation.angle` is measured from the device's NATURAL
// orientation — which is portrait on a phone but LANDSCAPE on an iPad. So an
// iPad in portrait reports 90, not 0, and rotating by the angle at face value
// turns the water sideways in the one orientation that used to work.
//
// See rotation(). It is a rotation of the answer, not a change to how the
// sensor is read, and it is the identity whenever the display is in the same
// orientation the frozen mapping was verified in — portrait.

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

  /**
   * The rotation from the sensor's frame to the display's frame.
   *
   * `angle()` counts from the device's natural orientation and the sensor
   * counts from portrait, so the two differ by a quarter turn on any device
   * whose natural orientation is landscape. Rather than special-case iPads,
   * work out which angle value *means* portrait on this device from the shape
   * of the viewport, and measure from there. In portrait the result is zero on
   * every device, so the frozen mapping is untouched where it was verified.
   */
  rotation() {
    const a = this.angle();
    const portraitNow = window.innerHeight >= window.innerWidth;
    const portraitAngle = portraitNow ? a % 180 : (a + 90) % 180;
    // The half-turn is empirical, and it is honest to say so. Portrait is
    // confirmed correct on device with no half-turn; landscape came back
    // exactly upside-down, on both landscape orientations. Two different
    // derivations of the angle relation each fit one round of device reports
    // and contradict the other, which means the reported values are not what
    // either derivation assumes. Rather than guess a third time, this encodes
    // what the device actually does, and debug() now reports every input the
    // question depends on so it can be settled by reading rather than by
    // theory.
    const half = portraitNow ? 0 : 180;
    return (((portraitAngle - a + half) % 360) + 360) % 360;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    // Rotated at read time rather than folded into the smoothing, so that
    // turning the device takes effect on the next frame instead of waiting for
    // a quarter-second filter to re-converge on the answer it already had.
    const th = (this.rotation() * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dx = this.gx * c - this.gy * s;
    const dy = this.gx * s + this.gy * c;
    const plane = Math.min(1, Math.hypot(dx, dy));
    if (plane < 0.06) return { x: 0, y: 0, plane: 0 };
    return { x: dx / plane, y: dy / plane, plane };
  }

  debug() {
    const so = window.screen && window.screen.orientation;
    return {
      source: 'DeviceMotionEvent / 89b765f mapping + display rotation',
      enabled: this.enabled,
      angle: this.angle(),
      rotation: this.rotation(),
      // Everything the rotation is derived from, so a wrong answer can be read
      // off the device instead of reasoned about.
      reported: so && Number.isFinite(so.angle) ? so.angle : null,
      kind: so && so.type ? so.type : null,
      legacy: Number.isFinite(window.orientation) ? window.orientation : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, z: this.gz },
      vector: this.vector(),
    };
  }
}
