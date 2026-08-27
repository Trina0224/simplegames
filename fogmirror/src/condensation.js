export class CondensationField {
  constructor(w = 180, h = 320) {
    this.resize(w, h);
    this.refogging = 0;
  }

  resize(w, h) {
    this.w = Math.max(48, Math.round(w));
    this.h = Math.max(48, Math.round(h));
    const n = this.w * this.h;
    this.fog = new Float32Array(n);
    this.water = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.noise = new Float32Array(n);
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return ((seed >>> 0) & 0xffff) / 0xffff;
    };
    for (let i = 0; i < n; i++) {
      this.noise[i] = rnd();
      this.fog[i] = 0.82 + rnd() * 0.16;
      this.water[i] = 0.03 + rnd() * 0.02;
      this.wet[i] = 0;
    }
  }

  idx(x, y) { return y * this.w + x; }

  steam(strength = 1) {
    this.refogging = Math.max(this.refogging, Math.min(1.5, strength));
  }

  sampleWet(u, v) {
    const x = Math.max(0, Math.min(this.w - 1, Math.floor(u * this.w)));
    const y = Math.max(0, Math.min(this.h - 1, Math.floor(v * this.h)));
    return this.wet[this.idx(x, y)];
  }

  sampleWater(u, v) {
    const x = Math.max(0, Math.min(this.w - 1, Math.floor(u * this.w)));
    const y = Math.max(0, Math.min(this.h - 1, Math.floor(v * this.h)));
    return this.water[this.idx(x, y)];
  }

  depositTrail(u, v, amount, radius = 0.012) {
    this._stamp(u, v, radius, (i, falloff) => {
      const a = amount * falloff;
      this.wet[i] = Math.min(1, this.wet[i] + a * 0.9);
      this.water[i] = Math.min(1, this.water[i] + a * 0.28);
      this.fog[i] = Math.max(0, this.fog[i] - a * 0.75);
    });
  }

  wipe(u, v, radius, speed = 0, dx = 0, dy = 0) {
    const broad = Math.min(2.0, 1 + speed * 0.9);
    this._stamp(u, v, radius * broad, (i, falloff, px, py) => {
      const clear = falloff * Math.min(1, 0.72 + speed * 0.32);
      const removed = this.fog[i] * clear;
      this.fog[i] = Math.max(0.015, this.fog[i] - removed * 0.98);
      this.wet[i] = Math.min(1, this.wet[i] + removed * 0.62 + falloff * 0.05);
      this.water[i] = Math.min(1, this.water[i] + removed * 0.18);

      // Push part of displaced moisture to the leading/side edge rather than deleting it.
      if (falloff < 0.45 && falloff > 0.12) {
        const directional = Math.max(0, (px * dx + py * dy));
        this.water[i] = Math.min(1, this.water[i] + removed * (0.22 + directional * speed * 0.2));
      }
    });
  }

  update(dt) {
    dt = Math.min(0.05, Math.max(0, dt));
    const n = this.fog.length;
    const natural = 0.006;
    const steamRate = this.refogging > 0 ? 0.55 * this.refogging : 0;
    const targetBase = this.refogging > 0 ? 0.94 : 0.83;

    for (let i = 0; i < n; i++) {
      const memory = this.wet[i];
      const target = Math.min(0.99, targetBase + (this.noise[i] - 0.5) * 0.09 + memory * 0.025);
      const rate = natural + steamRate;
      if (this.fog[i] < target) this.fog[i] += (target - this.fog[i]) * (1 - Math.exp(-rate * dt * 8));
      this.wet[i] *= Math.exp(-dt / 45);
      this.water[i] *= Math.exp(-dt / 28);
    }
    if (this.refogging > 0) this.refogging *= Math.exp(-dt / 1.35);
  }

  _stamp(u, v, radius, fn) {
    const cx = u * this.w;
    const cy = v * this.h;
    const rx = Math.max(2, radius * this.w);
    const ry = Math.max(2, radius * this.w);
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5 - cx) / rx;
        const py = (y + 0.5 - cy) / ry;
        const d = Math.hypot(px, py);
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d) * (3 - 2 * (1 - d));
        fn(this.idx(x, y), f, px, py);
      }
    }
  }
}
