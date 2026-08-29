// surface.js — the pane itself, as a continuum. Thickness, wetted memory,
// contact-line heterogeneity and flow ownership, all on one coarse grid.
// Nothing here draws, and nothing here knows about rain.
//
// Units: one cell is the length unit, so `h` is a thickness measured in cell
// depths and a region's mass is just the sum of `h` over its cells. Every
// physical quantity below is therefore declared in millimetres and divided by
// the cell size — a pane holds the same real film whatever the grid resolution
// or the device happens to be.

export const NONE = 0;

// CSS pixels per millimetre of glass: the one number that says how magnified
// the pane is. The screen is not a window at life size — at life size a two
// millimetre raindrop is six pixels across and there is nothing to look at. It
// is a close-up of a patch of glass about the size of a playing card, and every
// physical quantity in this project stays in millimetres and is divided by the
// cell size, so this is the only place the magnification lives.
export const MM = 15;

// Film thicknesses, in millimetres.
//
// HOLD is the one that decides whether the pane runs or sits: below it the
// contact line pins the film against gravity, above it the excess creeps
// downhill. BEAD is where a film becomes unstable and gathers itself into
// drops. BOUND is what adhesion keeps hold of and surface tension cannot drag
// anywhere — a pane never dries itself into clean glass, it stays faintly damp.
// POOL is drop-scale: deep water levels out like a puddle instead of beading.
const HOLD_MM = 0.085;
const BEAD_MM = 0.030;
const BOUND_MM = 0.004;
const POOL_MM = 0.40;

const CREEP = 5.5;                  // how eagerly film above HOLD moves downhill
const GATHER = 1.6;                 // dewetting: film moves to its thickest neighbour
const LEVEL = 1.3;                  // pooled water flattens
const DRY = 0.006;                  // evaporation, as a fraction per second
const WET_FADE = 0.05;              // wetted memory fades this fast

export class Surface {
  constructor(cols, rows) {
    this.setScale(3);
    this.drained = 0;               // water that has run off the pane, for the audit
    this.evaporated = 0;            // ...and the little that dried, likewise
    this.resize(cols, rows);
  }

  /** Fix the physical scale. A millimetre is a millimetre on any device. */
  setScale(cellPx) {
    const cellMm = Math.max(0.02, cellPx / MM);
    this.cellMm = cellMm;
    this.holdFilm = HOLD_MM / cellMm;
    this.beadFilm = BEAD_MM / cellMm;
    this.bound = BOUND_MM / cellMm;
    this.pool = POOL_MM / cellMm;
  }

  resize(cols, rows) {
    const n = cols * rows;
    const old = this.cols ? { cols: this.cols, rows: this.rows, h: this.h, wet: this.wet } : null;
    this.cols = cols;
    this.rows = rows;
    this.h = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.flowId = new Int32Array(n);
    this.scratch = new Float32Array(n);
    this.pin = new Float32Array(n);
    this._buildPinning();
    if (old) this._resample(old);
  }

  reset() {
    this.h.fill(0);
    this.wet.fill(0);
    this.flowId.fill(NONE);
    this.drained = 0;
    this.evaporated = 0;
  }

  /**
   * The pane's own contact-line resistance, stable for the session. Real glass
   * is not uniform: some patches hold a drop where the next one lets it go, and
   * that is what stops runoff from looking like a ruled diagram.
   */
  _buildPinning() {
    const { cols, rows, pin } = this;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const n = 0.62 * valueNoise(x * 0.055, y * 0.055, 41) + 0.38 * valueNoise(x * 0.19, y * 0.19, 97);
        pin[y * cols + x] = 0.76 + 0.48 * n;
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
        this.h[d] = old.h[s];
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

  // --- per-frame evolution --------------------------------------------------

  tick(dt, gravity) {
    this._creep(dt, gravity);
    this._capillary(dt);
    this._age(dt);
  }

  /**
   * Gravity-driven creep of the film. This is contact-angle hysteresis written
   * as a field: below the holding thickness the contact line pins the water and
   * nothing moves at all, and only the excess above it travels. Wetted glass
   * holds less, so water follows the paths water has already taken.
   *
   * The transfer is a bilinear scatter one cell downhill rather than a step to
   * whichever neighbour is most nearly downhill. Snapping to a neighbour is
   * what turns a diagonal rivulet into a staircase, and it is visible.
   */
  _creep(dt, gravity) {
    if (!gravity || gravity.plane < 0.05) return;
    const { cols, rows, h, wet, pin, flowId, scratch } = this;
    const gx = gravity.x;
    const gy = gravity.y;
    scratch.set(h);
    const rate = CREEP * gravity.plane * dt;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const hh = scratch[i];
        if (hh <= 0) continue;
        const cap = this.holdFilm * pin[i] * (1 - 0.4 * wet[i]);
        const over = hh - cap;
        if (over <= 0) continue;
        // A thicker film is not just more water, it is faster water.
        const frac = Math.min(0.75, rate * (1 + Math.min(5, over / cap)));
        const move = over * frac;
        if (move <= 0) continue;
        h[i] -= move;
        this._scatter(x + gx, y + gy, move, flowId[i]);
      }
    }
  }

  /** Add `amount` at a fractional position, bilinearly. Off the pane, it drains. */
  _scatter(fx, fy, amount, owner) {
    const { cols, rows, h, flowId } = this;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
        if (w <= 0) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        const part = amount * w;
        if (!this.inside(x, y)) { this.drained += part; continue; }
        const j = y * cols + x;
        h[j] += part;
        // Water leaving a flow's channel takes the channel with it, or the flow
        // quietly seeds loose water just ahead of itself and that water beads.
        if (owner > 0 && flowId[j] === NONE) flowId[j] = owner;
      }
    }
    void rows;
  }

  /**
   * Surface tension, in the two opposite roles it actually plays. Deep water
   * levels out, because a puddle is flat. Thin film does the reverse: it is
   * unstable and gathers towards whatever is thickest nearby, which is what
   * makes a wetted pane resolve into separate beads instead of a even sheet.
   *
   * Adhesion holds a residue that neither term can move, so the pane keeps a
   * faint damp film rather than tidying itself into drops and clean glass.
   */
  _capillary(dt) {
    const { cols, rows, h, pin, scratch } = this;
    scratch.set(h);
    const gather = Math.min(0.3, GATHER * dt);
    const level = Math.min(0.2, LEVEL * dt);
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        const i = y * cols + x;
        const hh = scratch[i];
        const free = hh - this.bound * pin[i];
        if (free <= 0) continue;
        if (hh > this.pool) {
          // A puddle flattens. Written as four explicit downhill transfers
          // rather than a step towards the neighbour average, because an
          // average applied to only some of the cells does not conserve water —
          // it quietly invents it in some places and loses it in others.
          for (let n = 0; n < 4; n += 1) {
            const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - cols : i + cols;
            const diff = scratch[i] - scratch[j];
            if (diff <= 0) continue;
            const move = diff * level * 0.25;
            h[i] -= move;
            h[j] += move;
          }
          continue;
        }
        let best = -1;
        let bi = -1;
        for (let n = 0; n < 4; n += 1) {
          const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - cols : i + cols;
          if (scratch[j] > best) { best = scratch[j]; bi = j; }
        }
        if (best <= hh) continue;
        const move = Math.min(free * 0.3, gather * (best - hh) * free * 2.4);
        h[i] -= move;
        h[bi] += move;
      }
    }
  }

  _age(dt) {
    const { h, wet, flowId } = this;
    const fade = WET_FADE * dt;
    const dry = DRY * dt;
    for (let i = 0; i < h.length; i += 1) {
      if (h[i] > 0) {
        const off = h[i] * dry;
        h[i] -= off;
        this.evaporated += off;
        if (h[i] < 1e-5) { this.evaporated += h[i]; h[i] = 0; }
      }
      if (wet[i] > 0) {
        wet[i] -= wet[i] * fade;
        // The pane forgets a channel once the glass behind it has dried.
        if (flowId[i] !== NONE && wet[i] < 0.18) flowId[i] = NONE;
      }
    }
  }

  // --- deposition and collection -------------------------------------------

  /**
   * Lay `amount` down as a soft cap, and report exactly what each cell got so
   * the caller can take it back again. An impact is a shape that changes over a
   * few frames, and re-laying it is the only way to do that without inventing
   * or losing water.
   */
  deposit(px, py, radius, amount, out) {
    if (amount <= 0) return 0;
    const { cols, rows, h } = this;
    const r = Math.max(0.7, radius);
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
    if (weight <= 0) {
      const i = this.index(px, py);
      h[i] += amount;
      if (out) out.push(i, amount);
      return amount;
    }
    const scale = amount / weight;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - px) / r;
        const dy = (y - py) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const i = y * cols + x;
        const part = (1 - d2) * scale;
        h[i] += part;
        if (out) out.push(i, part);
      }
    }
    void rows;
    return amount;
  }

  /**
   * A ring rather than a cap: the lamella of a fresh impact is thin in the
   * middle and piled up at the rim, which is why a splash reads as a ring for
   * the first instant and not as a fat blob.
   */
  depositRim(px, py, radius, amount, out) {
    if (amount <= 0) return 0;
    const { cols, h } = this;
    const r = Math.max(0.7, radius);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(this.rows - 1, Math.ceil(py + r));
    let weight = 0;
    const shape = (d) => (d > 1 ? 0 : 0.22 + 0.78 * Math.pow(d, 2.6));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = Math.hypot(x - px, y - py) / r;
        weight += shape(d);
      }
    }
    if (weight <= 0) return this.deposit(px, py, radius, amount, out);
    const scale = amount / weight;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = Math.hypot(x - px, y - py) / r;
        const s = shape(d);
        if (s <= 0) continue;
        const i = y * cols + x;
        const part = s * scale;
        h[i] += part;
        if (out) out.push(i, part);
      }
    }
    return amount;
  }

  /** Take back what a previous deposit put down; returns how much came back. */
  retract(cells) {
    const { h } = this;
    let got = 0;
    for (let k = 0; k < cells.length; k += 2) {
      const i = cells[k];
      const want = cells[k + 1];
      const take = Math.min(h[i], want);
      h[i] -= take;
      got += take;
    }
    return got;
  }

  /** Wet a disc, at least to `level`. */
  markWet(px, py, radius, level) {
    const { cols, wet } = this;
    const r = Math.max(0.7, radius);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(this.rows - 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = Math.hypot(x - px, y - py) / r;
        if (d > 1) continue;
        const i = y * cols + x;
        const v = level * (1 - 0.45 * d);
        if (wet[i] < v) wet[i] = v;
      }
    }
  }

  /** Total water lying on the pane. */
  totalWater() {
    let sum = 0;
    for (let i = 0; i < this.h.length; i += 1) sum += this.h[i];
    return sum;
  }
}

// Cheap deterministic value noise, for the pinning field.
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
