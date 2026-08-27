// orientation.js — derive gravity along the glass from DeviceOrientation beta/gamma.
// DeviceMotion axis/sign handling differed across iPad orientations; beta/gamma have
// a much clearer geometric meaning and are transformed explicitly into viewport axes.

export class GravitySensor {
  constructor() {
    this.gx = 0;
    this.gy = 1;
    this.plane = 1;
    this.enabled = false;
    this.available = 'DeviceOrientationEvent' in window;
    this._bound = (e) => this._onOrientation(e);
    this._last = null;
    this.raw = { beta: null, gamma: null, screenAngle: 0 };
  }

  async start() {
    if (!this.available) return false;
    try {
      const Ctor = window.DeviceOrientationEvent;
      if (typeof Ctor.requestPermission === 'function') {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') return false;
      }
      this.stop();
      this.gx = 0;
      this.gy = 1;
      this.plane = 1;
      this._last = null;
      window.addEventListener('deviceorientation', this._bound, { passive: true });
      this.enabled = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  stop() {
    window.removeEventListener('deviceorientation', this._bound);
    this.enabled = false;
    this._last = null;
  }

  _screenAngle() {
    const a = Number(screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    return ((a % 360) + 360) % 360;
  }

  _onOrientation(e) {
    if (!Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;

    const beta = e.beta * Math.PI / 180;
    const gamma = e.gamma * Math.PI / 180;

    /*
     * Device frame: x points right, y points toward the device top, z points out
     * of the screen.  For a flat face-up device beta=gamma=0, so gravity is normal
     * to the glass and its in-plane component is zero.
     *
     * Project world gravity into the device plane, then express y in Canvas terms
     * (+Y is down):
     *
     *   gxNatural = sin(gamma)
     *   gyNatural = sin(beta) * cos(gamma)
     *
     * Sanity checks before viewport rotation:
     *   portrait upright (beta≈+90, gamma≈0) -> (0,+1)
     *   right edge physically down (gamma≈+90) -> (+1,0)
     *   left edge physically down  (gamma≈-90) -> (-1,0)
     */
    let x = Math.sin(gamma);
    let y = Math.sin(beta) * Math.cos(gamma);

    // beta/gamma are defined in the device's natural screen orientation. Rotate
    // that vector into the browser's current viewport coordinates.
    const angle = this._screenAngle();
    if (angle === 90) [x, y] = [-y, x];
    else if (angle === 180) [x, y] = [-x, -y];
    else if (angle === 270) [x, y] = [y, -x];

    const targetPlane = Math.min(1, Math.hypot(x, y));

    this.raw = { beta: e.beta, gamma: e.gamma, screenAngle: angle };

    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    const tau = 0.18;
    const alpha = 1 - Math.exp(-dt / tau);

    this.gx += (x - this.gx) * alpha;
    this.gy += (y - this.gy) * alpha;
    this.plane += (targetPlane - this.plane) * alpha;
  }

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    const magnitude = Math.hypot(this.gx, this.gy);
    const plane = Math.max(0, Math.min(1, this.plane));
    if (plane < 0.055 || magnitude < 0.02) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / magnitude, y: this.gy / magnitude, plane };
  }

  debug() {
    return {
      source: 'DeviceOrientationEvent',
      enabled: this.enabled,
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, plane: this.plane },
      vector: this.vector(),
    };
  }
}
