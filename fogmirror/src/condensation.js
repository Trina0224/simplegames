// condensation.js — the glass surface itself: fog, liquid water, wetness memory.
// Everything here is a field on a coarse grid. No drawing, no drops, no camera.
//
// Units: one cell is the length unit. `water` is a height, so a cell's water
// mass is just its height; a body of water's mass is the sum over its cells.

export const NONE = 0;

export class Surface {
  constructor(cols, rows) {
    this.resize(cols, rows);
  }

  resize(cols, rows) {
    const n = cols * rows;
    const old = this.cols ? { cols: this.cols, rows: this.rows, fog: this.fog, water: this.water, wet: this.wet } : null;
    this.cols = cols;
    this.rows = rows;
    this.fog = new Float32Array(n);
    this.water = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.flowId = new Int32Array(n);
    this.scratch = new Float32Array(n);
    this.heterogeneity = new Float32Array(n);
    this._buildHeterogeneity();
    if (old) this._resample(old);
    else this.reset();
  }

  reset() {
    this.water.fill(0);
    this.wet.fill(0);
    this.flowId.fill(NONE);
    this._seedFog();
  }

  /** Fog is never uniform on a real mirror; seed it with a few octaves of noise. */
  _seedFog() {
    const { cols, rows, fog } = this;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const n =
          0.55 * valueNoise(x * 0.035, y * 0.035, 11) +
          0.3 * valueNoise(x * 0.09, y * 0.09, 23) +
          0.15 * valueNoise(x * 0.24, y * 0.24, 37);
        fog[y * cols + x] = 0.72 + 0.26 * (n - 0.5);
      }
    }
  }

  /** A stable per-session field: some patches of glass simply hold drops better. */
  _buildHeterogeneity() {
    const { cols, rows, heterogeneity } = this;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const n = 0.6 * valueNoise(x * 0.06, y * 0.06, 71) + 0.4 * valueNoise(x * 0.17, y * 0.17, 91);
        heterogeneity[y * cols + x] = 0.82 + 0.36 * n;
      }
    }
  }

  _resample(old) {
    const { cols, rows } = this;
    for (let y = 0; y < rows; y += 1) {
      const sy = Math.min(old.rows - 1, Math.floor((y / rows) * old.rows));
      for (let x = 0; x < cols; x += 1) {
        const sx = Math.min(old.cols - 1, Math.floor((x / cols) * old.cols));
        const s = sy * old.cols + sx;
        const d = y * cols + x;
        this.fog[d] = old.fog[s];
        this.water[d] = old.water[s];
        this.wet[d] = old.wet[s];
      }
    }
  }

  index(x, y) {
    const cx = Math.max(0, Math.min(this.cols - 1, x | 0));
    const cy = Math.max(0, Math.min(this.rows - 1, y | 0));
    return cy * this.cols + cx;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** Steam: more fine condensation, and it must not erase liquid or wetness. */
  steam(amount) {
    const { fog, wet, cols, rows } = this;
    for (let i = 0; i < fog.length; i += 1) {
      const x = i % cols;
      const y = (i / cols) | 0;
      const patch = 0.75 + 0.5 * valueNoise(x * 0.05 + 3.1, y * 0.05 + 7.7, 53);
      // Wet glass takes condensation slightly more readily than dry glass.
      const affinity = 1 + 0.35 * wet[i];
      fog[i] = Math.min(1, fog[i] + amount * patch * affinity);
    }
    void rows;
  }

  /**
   * Per-frame surface behaviour: slow re-condensation, film levelling, a gentle
   * downhill sag of thick film, and the slow fading of wetness memory.
   */
  tick(dt, gravity) {
    const { fog, water, wet, cols, rows, scratch } = this;
    const n = fog.length;

    // --- re-condensation: slow, so a finger drawing survives a while
    const rate = 0.016 * dt;
    for (let i = 0; i < n; i += 1) {
      const affinity = 1 + 4.5 * wet[i];
      const target = 1;
      fog[i] += (target - fog[i]) * rate * affinity;
      if (fog[i] > 1) fog[i] = 1;
      // wetness fades much more slowly than fog returns
      wet[i] -= wet[i] * 0.02 * dt;
      // A little water is always evaporating — as a fraction of what is there,
      // not as a fixed amount per cell. A fixed amount makes the total loss
      // proportional to the wetted *area*, so a single wipe covering thousands
      // of cells boils itself dry in seconds and no drop can ever feed.
      if (water[i] > 0) {
        water[i] -= water[i] * 0.022 * dt;
        if (water[i] < 1e-4) water[i] = 0;
      }
    }

    // --- coarsening: a thin film on glass does not sit there evenly, it breaks
    // up and gathers into beads, because surface tension makes a flat film
    // unstable. Diffusion alone does the opposite — it smooths the film out —
    // so with only diffusion the water spreads into a sheet too thin to ever
    // bead, and nothing further can happen. Water therefore moves towards its
    // thickest neighbour, which is what makes a wiped mirror pull itself into
    // drops. Transfers are explicit, so this conserves water exactly.
    scratch.set(water);
    const gather = Math.min(0.3, 1.4 * dt);
    const level = Math.min(0.18, 1.2 * dt);
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        const i = y * cols + x;
        const h = scratch[i];
        if (h < 0.004) continue;
        let best = -1;
        let bi = -1;
        for (let n = 0; n < 4; n += 1) {
          const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - cols : i + cols;
          if (scratch[j] > best) { best = scratch[j]; bi = j; }
        }
        if (h > 0.9) {
          // A real pool does level out; only the thin film coarsens.
          const avg = (scratch[i - 1] + scratch[i + 1] + scratch[i - cols] + scratch[i + cols]) * 0.25;
          water[i] += (avg - h) * level;
        } else if (best > h) {
          const move = Math.min(h * 0.3, gather * (best - h) * h * 2.2);
          water[i] -= move;
          water[bi] += move;
        }
      }
    }

    // --- sag: a thick film creeps downhill even with no drop leading it
    if (gravity && gravity.plane > 0.05) {
      const gx = gravity.x;
      const gy = gravity.y;
      const step = Math.min(0.24, 0.8 * dt * gravity.plane);
      scratch.set(water);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const i = y * cols + x;
          const h = scratch[i];
          if (h < 0.25) continue;
          const nx = x + (gx > 0.35 ? 1 : gx < -0.35 ? -1 : 0);
          const ny = y + (gy > 0.35 ? 1 : gy < -0.35 ? -1 : 0);
          if ((nx === x && ny === y) || !this.inside(nx, ny)) continue;
          const move = (h - 0.25) * step;
          water[i] -= move;
          const j = ny * cols + nx;
          water[j] += move;
          // Water running over dry glass wets it; the next drop down this line
          // will find it easier going.
          if (wet[j] < 0.5) wet[j] = Math.min(0.5, wet[j] + move * 2.5);
        }
      }
    }
  }

  /**
   * A finger is a displacement, not an eraser. Returns how much liquid the
   * stroke sample mobilised, so the caller can see water is conserved.
   */
  wipe(px, py, radius, gravity, speed) {
    const { cols, rows, fog, water, wet } = this;
    const r = Math.max(1.5, radius);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(rows - 1, Math.ceil(py + r));
    let collected = 0;

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / r;
        const i = y * cols + x;

        // 1. the fine mist goes
        const removedFog = fog[i] * 0.82 * falloff;
        fog[i] -= removedFog;

        // 2. a little of it was already liquid, and the finger gathers that.
        // Most condensation is far too fine to become free water at all — turn
        // much of it into liquid and the glass never stops producing drops.
        collected += removedFog * 0.26;

        // 3. so is most of the free water already sitting there
        const mobile = water[i] * (0.55 + 0.35 * falloff);
        water[i] -= mobile;
        collected += mobile;

        // 4. the glass stays wet
        wet[i] = Math.min(1, Math.max(wet[i], 0.55 * falloff + 0.25));
      }
    }

    if (collected <= 0) return 0;

    // Most of it is pushed to the gravity-down edge of the contact patch; the
    // rest is left as a thinner ridge either side and a damp film in the middle.
    const g = gravity && gravity.plane > 0.08 ? gravity : null;
    const fast = Math.min(1, speed / 320);
    const downShare = g ? 0.62 + 0.16 * fast : 0.3;
    const sideShare = (1 - downShare) * 0.6;
    const filmShare = 1 - downShare - sideShare;

    if (g) {
      this._deposit(px + g.x * r * 0.95, py + g.y * r * 0.95, r * 0.7, collected * downShare);
      this._deposit(px - g.y * r * 0.85, py + g.x * r * 0.85, r * 0.6, collected * sideShare * 0.5);
      this._deposit(px + g.y * r * 0.85, py - g.x * r * 0.85, r * 0.6, collected * sideShare * 0.5);
    } else {
      this._deposit(px, py + r * 0.9, r * 0.7, collected * downShare * 0.5);
      this._deposit(px, py - r * 0.9, r * 0.7, collected * downShare * 0.5);
      this._deposit(px - r * 0.9, py, r * 0.6, collected * sideShare * 0.5);
      this._deposit(px + r * 0.9, py, r * 0.6, collected * sideShare * 0.5);
    }
    this._deposit(px, py, r * 0.9, collected * filmShare);
    return collected;
  }

  /** Lay `amount` of water down as a soft blob. */
  _deposit(px, py, radius, amount) {
    if (amount <= 0) return;
    const { cols, rows, water } = this;
    const r = Math.max(1, radius);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(rows - 1, Math.ceil(py + r));
    let weight = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - px) / r;
        const dy = (y - py) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        weight += 1 - d2;
      }
    }
    if (weight <= 0) { water[this.index(px, py)] += amount; return; }
    const scale = amount / weight;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - px) / r;
        const dy = (y - py) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        water[y * cols + x] += (1 - d2) * scale;
      }
    }
  }

  /** Total liquid on the glass — used by the tests to check conservation. */
  totalWater() {
    let sum = 0;
    for (let i = 0; i < this.water.length; i += 1) sum += this.water[i];
    return sum;
  }
}

// Cheap deterministic value noise; enough for fog patchiness and heterogeneity.
function hash(x, y, seed) {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
