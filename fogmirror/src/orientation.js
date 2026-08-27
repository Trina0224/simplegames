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
    const tau = 0.22;
    const alpha = 1 - Math.exp(-dt / tau);

    // Device axes are rotated into current screen coordinates.
    let x = a.x;
    let y = a.y;
    const angle = Number(screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    if (angle === 90 || angle === -270) [x, y] = [-y, x];
    else if (angle === 180 || angle === -180) [x, y] = [-x, -y];
    else if (angle === 270 || angle === -90) [x, y] = [y, -x];

    const mag = Math.max(0.001, Math.hypot(x, y, a.z || 0));
    // Screen-space gravity: CSS/canvas +Y points down. Browser sensor Y convention
    // varies historically, so use the stable sign that makes an upright device run down.
    const tx = x / mag;
    const ty = -y / mag;
    this.gx += (tx - this.gx) * alpha;
    this.gy += (ty - this.gy) * alpha;
    this.gz += (((a.z || 0) / mag) - this.gz) * alpha;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    const plane = Math.min(1, Math.hypot(this.gx, this.gy));
    if (plane < 0.025) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / plane, y: this.gy / plane, plane };
  }
}
