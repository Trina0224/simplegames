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
      this.fog[i] = 0.87 + rnd() * 0.11;
      this.water[i] = 0.001 + rnd() * 0.0025;
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

  consumeWater(u, v, radius = 0.012, requested = 0.02) {
    if (requested <= 0) return 0;
    let available = 0;
    const cells = [];
    this._stamp(u, v, radius, (i, falloff) => {
      const a = this.water[i] * falloff;
      if (a > 0) {
        available += a;
        cells.push([i, falloff]);
      }
    });
    if (available <= 1e-8) return 0;
    const take = Math.min(requested, available);
    const scale = take / available;
    for (const [i, falloff] of cells) {
      const d = this.water[i] * falloff * scale;
      this.water[i] = Math.max(0, this.water[i] - d);
    }
    return take;
  }

  addWater(u, v, amount, radius = 0.010) {
    if (amount <= 0) return;
    let weight = 0;
    const cells = [];
    this._stamp(u, v, radius, (i, falloff) => {
      weight += falloff;
      cells.push([i, falloff]);
    });
    if (weight <= 0) return;
    for (const [i, falloff] of cells) {
      const share = amount * (falloff / weight);
      this.water[i] = Math.min(1, this.water[i] + share);
      this.wet[i] = Math.min(1, this.wet[i] + share * 2.4);
    }
  }

  // Physically move already-created liquid film from the wiped contact patch to
  // its downhill edge. This is deliberately mass-conserving: it does not invent
  // a droplet, it redistributes water that is already in the height map.
  squeezeWaterDownhill(u, v, gx, gy, strength = 1, contactRadius = 0.034) {
    const gm = Math.hypot(gx, gy);
    if (gm < 0.05) return 0;
    gx /= gm;
    gy /= gm;

    const take = this.consumeWater(
      u,
      v,
      contactRadius * 0.86,
      0.010 + Math.min(1.8, strength) * 0.018,
    );
    if (take <= 0) return 0;

    const edgeOffset = contactRadius * (0.82 + Math.min(1.4, strength) * 0.10);
    const ex = Math.max(0, Math.min(1, u + gx * edgeOffset));
    const ey = Math.max(0, Math.min(1, v + gy * edgeOffset));
    this.addWater(ex, ey, take * 0.88, contactRadius * 0.24);

    // A small remainder stays as smeared film within the touched region.
    this.addWater(u, v, take * 0.12, contactRadius * 0.34);
    return take;
  }

  depositTrail(u, v, amount, radius = 0.006) {
    this._stamp(u, v, radius, (i, falloff) => {
      const a = amount * falloff;
      this.wet[i] = Math.min(1, this.wet[i] + a * 0.72);
      this.water[i] = Math.min(1, this.water[i] + a * 0.025);
      this.fog[i] = Math.max(0, this.fog[i] - a * 0.52);
    });
  }

  wipe(u, v, radius, speed = 0, dx = 0, dy = 0) {
    const broad = Math.min(1.55, 1 + speed * 0.35);
    this._stamp(u, v, radius * broad, (i, falloff, px, py) => {
      const clear = falloff * Math.min(1, 0.72 + speed * 0.20);
      const removedFog = this.fog[i] * clear;
      this.fog[i] = Math.max(0.012, this.fog[i] - removedFog * 0.985);
      this.wet[i] = Math.min(1, this.wet[i] + removedFog * 0.28 + falloff * 0.024);

      // Microscopic condensation becomes a thin liquid film under the fingertip.
      this.water[i] = Math.min(1, this.water[i] + removedFog * 0.070);

      // Stroke-direction shear still creates a mild leading ridge, but gravity-down
      // transport is handled separately by squeezeWaterDownhill().
      if (falloff < 0.50 && falloff > 0.08) {
        const directional = Math.max(0, px * dx + py * dy);
        const edgeGain = 0.020 + directional * Math.min(2.0, speed) * 0.025;
        this.water[i] = Math.min(1, this.water[i] + removedFog * edgeGain);
      }
    });
  }

  update(dt) {
    dt = Math.min(0.05, Math.max(0, dt));
    const n = this.fog.length;
    const natural = 0.004;
    const steamRate = this.refogging > 0 ? 0.55 * this.refogging : 0;
    const targetBase = this.refogging > 0 ? 0.95 : 0.86;

    for (let i = 0; i < n; i++) {
      const memory = this.wet[i];
      const target = Math.min(0.995, targetBase + (this.noise[i] - 0.5) * 0.075 + memory * 0.018);
      const rate = natural + steamRate;
      if (this.fog[i] < target) {
        this.fog[i] += (target - this.fog[i]) * (1 - Math.exp(-rate * dt * 8));
      }

      if (this.refogging > 0 || memory > 0.12) {
        const condense = (0.000010 + memory * 0.000030) * dt * (this.refogging > 0 ? 3 : 1);
        this.water[i] = Math.min(1, this.water[i] + condense);
      }

      this.wet[i] *= Math.exp(-dt / 55);
      this.water[i] *= Math.exp(-dt / 100);
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
