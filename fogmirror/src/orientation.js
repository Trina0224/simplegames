// orientation.js — which way is down, in the frame the page is drawn in.
//
// The sensor mapping below is frozen: upright runs down; right edge physically
// down runs right; left edge physically down runs left; nearly flat gives weak
// in-plane gravity. It was verified on the target iPad and must not be
// redesigned without a real-device test showing a regression.
//
// What it was missing, and what Rainpane found the hard way: a rotation from
// the frame the sensor reports in to the frame the page is laid out in. This
// page relayouts when you turn the device (see the orientationchange handler in
// app.js); the sensor does not. Past that point the two disagree and the water
// runs the wrong way across the picture.
//
// The subtlety, and it cost three wrong fixes in Rainpane before the cause was
// found: those two frames are measured from DIFFERENT reference orientations.
// CoreMotion's axes are fixed to the hardware with +y toward the top of the
// device *in portrait*, on every iOS device. `screen.orientation.angle` is
// measured from the device's NATURAL orientation — which is portrait on a phone
// but LANDSCAPE on an iPad. So an iPad held in portrait reports 90, not 0, and
// rotating by that angle at face value turns the water sideways in the one
// orientation that used to work.
//
// See rotation(). It rotates the answer; it does not change how the sensor is
// read. In portrait it is the identity on every device, so the frozen mapping
// is untouched exactly where it was verified.

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
    return (((portraitAngle - a) % 360) + 360) % 360;
  }

  /**
   * Is the display refusing to follow the device?
   *
   * Device readings settled a long argument about this in Rainpane. On a
   * rotation-locked iPad, `screen.orientation` stays `portrait-primary` at 90
   * and the viewport stays portrait however the tablet is held — so the
   * correction above is a no-op, correctly, and gravity in screen coordinates
   * points at whichever screen edge is physically lowest. Held sideways that is
   * the left or right edge, and water running across the screen is the feature
   * working, not a bug. It only looks wrong because the scene is painted on the
   * screen and turns with it.
   *
   * Worth reporting rather than hiding: it is the difference between "the sensor
   * mapping is broken" and "the display is locked", and those two look identical
   * from the sofa.
   */
  displayLocked() {
    if (!this.enabled) return false;
    const sideways = Math.abs(this.gx) > 0.7;
    const portraitNow = window.innerHeight >= window.innerWidth;
    return sideways && portraitNow;
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
      locked: this.displayLocked(),
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, z: this.gz },
      vector: this.vector(),
    };
  }
}
