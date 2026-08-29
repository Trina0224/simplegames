// gravity.js — COPIED VERBATIM from Fog Mirror's src/orientation.js.
//
// This mapping was verified on the target iPad and AGENTS.md freezes it: do not
// redesign it during Rainpane development without a real-device test showing a
// regression. Upright runs down; right edge physically down runs right; left
// edge physically down runs left; nearly flat gives weak in-plane gravity.
// In particular there is no second screen.orientation rotation — on the tested
// device DeviceMotion x/y already track the physical screen.

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

  vector() {
    if (!this.enabled) return { x: 0, y: 1, plane: 1 };
    const plane = Math.min(1, Math.hypot(this.gx, this.gy));
    if (plane < 0.06) return { x: 0, y: 0, plane: 0 };
    return { x: this.gx / plane, y: this.gy / plane, plane };
  }

  debug() {
    return {
      source: 'DeviceMotionEvent / restored 89b765f mapping',
      enabled: this.enabled,
      raw: { ...this.raw },
      filtered: { x: this.gx, y: this.gy, z: this.gz },
      vector: this.vector(),
    };
  }
}
