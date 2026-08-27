export class GravitySensor {
  constructor() {
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
    this.enabled = false;
    this.available = 'DeviceMotionEvent' in window;
    this._bound = (e) => this._onMotion(e);
    this._last = null;
  }

  async start() {
    if (!this.available) return false;
    try {
      const Ctor = window.DeviceMotionEvent;
      if (typeof Ctor.requestPermission === 'function') {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') return false;
      }
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
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;

    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    const tau = 0.24;
    const alpha = 1 - Math.exp(-dt / tau);

    /*
     * DeviceMotion x/y axes already rotate with the physical screen on iOS/iPadOS.
     * Applying screen.orientation.angle here rotates them a second time (on iPad,
     * portrait commonly reports a non-zero orientation angle), which made physical
     * down become screen-right. accelerationIncludingGravity points opposite the
     * direction a free droplet should fall, so negate x and y directly.
     *
     * Canvas coordinates use +x right and +y down:
     *   upright device   -> (0, +1)
     *   right edge down  -> (+1, 0)
     *   left edge down   -> (-1, 0)
     */
    const z = Number.isFinite(a.z) ? a.z : 0;
    const mag = Math.max(0.001, Math.hypot(a.x, a.y, z));
    const tx = -a.x / mag;
    const ty = -a.y / mag;
    const tz = -z / mag;

    this.gx += (tx - this.gx) * alpha;
    this.gy += (ty - this.gy) * alpha;
    this.gz += (tz - this.gz) * alpha;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    const plane = Math.min(1, Math.hypot(this.gx, this.gy));
    // Nearly flat glass: gravity is mostly normal to the screen, so water should
    // pool/pin rather than inventing a lateral direction from sensor noise.
    if (plane < 0.06) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / plane, y: this.gy / plane, plane };
  }
}
