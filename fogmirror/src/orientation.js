export class GravitySensor {
  constructor() {
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
    this.enabled = false;
    this.available = 'DeviceMotionEvent' in window;
    this._bound = (e) => this._onMotion(e);
    this._last = null;

    // iOS/iPadOS devices do not all expose DeviceMotion axes with the same
    // relationship to the current CSS viewport. Instead of hard-coding a sign /
    // axis convention, calibrate "physical down" when Gravity is enabled and
    // then rotate that calibration with later screen-orientation changes.
    this._calibrated = false;
    this._calibrationRotation = 0;
    this._calibrationScreenAngle = 0;
    this._calibrationSamples = [];
  }

  async start() {
    if (!this.available) return false;
    try {
      const Ctor = window.DeviceMotionEvent;
      if (typeof Ctor.requestPermission === 'function') {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') return false;
      }
      this._resetCalibration();
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
    this._resetCalibration();
  }

  _screenAngle() {
    const raw = Number(screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    // Normalise to a signed-ish 0..359 angle; only deltas matter.
    return ((raw % 360) + 360) % 360;
  }

  _angleDelta(from, to) {
    let d = (to - from) * Math.PI / 180;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _resetCalibration() {
    this._calibrated = false;
    this._calibrationRotation = 0;
    this._calibrationScreenAngle = this._screenAngle();
    this._calibrationSamples.length = 0;
    this._last = null;
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;

    const z = Number.isFinite(a.z) ? a.z : 0;
    const mag = Math.max(0.001, Math.hypot(a.x, a.y, z));

    // accelerationIncludingGravity points opposite the direction a free drop
    // accelerates, so negate it first. These are still *sensor* coordinates.
    const rx = -a.x / mag;
    const ry = -a.y / mag;
    const rz = -z / mag;
    const planeRaw = Math.hypot(rx, ry);

    // Calibration assumes the user enables Gravity while generally holding the
    // mirror upright. Collect several samples so one hand tremor does not decide
    // the coordinate mapping. If nearly flat, wait until the device is upright
    // enough to establish a meaningful down direction.
    if (!this._calibrated && planeRaw > 0.45) {
      this._calibrationSamples.push({ x: rx, y: ry });
      if (this._calibrationSamples.length >= 10) {
        const sx = this._calibrationSamples.reduce((s, p) => s + p.x, 0);
        const sy = this._calibrationSamples.reduce((s, p) => s + p.y, 0);
        const rawAngle = Math.atan2(sy, sx);
        // CSS/canvas down is +Y => angle +pi/2.
        this._calibrationRotation = Math.PI / 2 - rawAngle;
        this._calibrationScreenAngle = this._screenAngle();
        this._calibrated = true;
      }
    }

    if (!this._calibrated) return;

    // When the browser rotates the viewport, the same hardware axes now map to
    // different CSS axes. Carry the initial calibration through that screen-angle
    // delta rather than guessing whether this particular iPad swaps x/y itself.
    const delta = this._angleDelta(this._calibrationScreenAngle, this._screenAngle());
    const rot = this._calibrationRotation + delta;
    const c = Math.cos(rot), s = Math.sin(rot);
    const tx = rx * c - ry * s;
    const ty = rx * s + ry * c;

    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    const tau = 0.20;
    const alpha = 1 - Math.exp(-dt / tau);
    this.gx += (tx - this.gx) * alpha;
    this.gy += (ty - this.gy) * alpha;
    this.gz += (rz - this.gz) * alpha;
  }

  vector() {
    if (!this.enabled || !this._calibrated) return { x: 0, y: 1, plane: 1 };
    const plane = Math.min(1, Math.hypot(this.gx, this.gy));
    if (plane < 0.06) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / plane, y: this.gy / plane, plane };
  }
}
