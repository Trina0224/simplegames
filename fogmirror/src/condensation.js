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
      // Visible fog is millions of microscopic beads. Only a minute fraction has
      // coalesced into mobile liquid at startup, so the liquid reservoir begins tiny.
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

  // Remove liquid from a small neighbourhood and return the amount actually taken.
  // Visible droplets must grow from this reservoir; they are never allowed to gain
  // mass for free.
  consumeWater(u, v, radius = 0.012, requested = 0.02) {
    if (requested <= 0) return 0;
    let available = 0;
    const cells = [];
    this._stamp(u, v, radius, (i, falloff) => {
      const a = this.water[i] * falloff;
      if (a > 0) { available += a; cells.push([i, falloff]); }
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

  depositTrail(u, v, amount, radius = 0.006) {
    this._stamp(u, v, radius, (i, falloff) => {
      const a = amount * falloff;
      this.wet[i] = Math.min(1, this.wet[i] + a * 0.72);
      // A moving drop leaves only a thin film, not another full droplet worth of water.
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
      this.wet[i] = Math.min(1, this.wet[i] + removedFog * 0.20 + falloff * 0.018);

      // Only a small portion of microscopic condensation becomes pooled liquid.
      // Most is smeared into a molecular/thin-film wet layer.
      this.water[i] = Math.min(1, this.water[i] + removedFog * 0.018);

      // Moisture accumulates preferentially at the pushed edge of the stroke.
      if (falloff < 0.46 && falloff > 0.10) {
        const directional = Math.max(0, px * dx + py * dy);
        this.water[i] = Math.min(1, this.water[i] + removedFog * (0.018 + directional * speed * 0.016));
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
      if (this.fog[i] < target) this.fog[i] += (target - this.fog[i]) * (1 - Math.exp(-rate * dt * 8));

      // Re-condensation very slowly contributes liquid, and does so preferentially
      // on an already wet surface. This is intentionally tiny: thousands of fog
      // beads must coalesce before a macroscopic drop exists.
      if (this.refogging > 0 || memory > 0.12) {
        const condense = (0.000004 + memory * 0.000010) * dt * (this.refogging > 0 ? 3 : 1);
        this.water[i] = Math.min(1, this.water[i] + condense);
      }

      this.wet[i] *= Math.exp(-dt / 55);
      this.water[i] *= Math.exp(-dt / 85);
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
