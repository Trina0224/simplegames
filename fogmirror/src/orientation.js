export class GravitySensor {
  constructor() {
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
    this.enabled = false;
    this.available = 'DeviceMotionEvent' in window;
    this._bound = (e) => this._onMotion(e);
    this._last = null;
    this.raw = { x: 0, y: 0, z: 0, screenAngle: 0 };
  }

  async start() {
    if (!this.available) return false;
    try {
      const Ctor = window.DeviceMotionEvent;
      if (typeof Ctor.requestPermission === 'function') {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') return false;
      }
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

    const z = Number.isFinite(a.z) ? a.z : 0;
    const mag = Math.max(0.001, Math.hypot(a.x, a.y, z));

    /*
     * WebKit documents the device-motion axes as:
     *   +x = toward the right side of the screen
     *   +y = toward the top of the screen
     *   +z = out of the screen
     *
     * accelerationIncludingGravity is proper acceleration: on a supported
     * stationary device it points opposite physical gravity. Therefore physical
     * gravity in sensor coordinates is (-a.x, -a.y, -a.z).
     *
     * Canvas/CSS uses +x right and +y DOWN. Converting the physical sensor vector
     * into Canvas coordinates flips the y axis once more:
     *
     *   canvas gx = -a.x
     *   canvas gy = +a.y
     *
     * Because WebKit defines x/y relative to the screen itself, do not rotate the
     * vector again with screen.orientation.angle; doing so double-rotates iPads.
     */
    const tx = -a.x / mag;
    const ty =  a.y / mag;
    const tz = -z / mag;

    this.raw = {
      x: a.x,
      y: a.y,
      z,
      screenAngle: Number(screen.orientation?.angle ?? window.orientation ?? 0) || 0,
    };

    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    const tau = 0.24;
    const alpha = 1 - Math.exp(-dt / tau);
    this.gx += (tx - this.gx) * alpha;
    this.gy += (ty - this.gy) * alpha;
    this.gz += (tz - this.gz) * alpha;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    const plane = Math.min(1, Math.hypot(this.gx, this.gy));
    if (plane < 0.055) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / plane, y: this.gy / plane, plane };
  }

  debug() {
    return {
      enabled: this.enabled,
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, z: this.gz },
      vector: this.vector(),
    };
  }
}
