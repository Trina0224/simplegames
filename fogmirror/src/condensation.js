// condensation.js — the glass surface itself: fog, liquid water, wetness memory.
// Everything here is a field on a coarse grid. No drawing, no drops, no camera.
//
// Units: one cell is the length unit. `water` is a height, so a cell's water
// mass is just its height; a body of water's mass is the sum over its cells.

export const NONE = 0;

// Film thicknesses, in millimetres. One unit of `water` height is one cell
// length deep, so every one of these has to be divided by the cell size to
// become a height — exactly as drop sizes are (see droplets.js).
//
// These set the *water budget* of the whole toy, and getting the budget wrong
// is not a look, it is a factual error: a fully fogged pane carries a few
// microns of condensation, and wiping a hand's width of it yields a couple of
// drops. This used to hand out about thirty times that, so one scribble put two
// hundred drops' worth of water on the glass and the mirror then spent a minute
// working through it. That is the real reason water kept appearing.
const FOG_FILM_MM = 0.045;     // liquid equivalent of fully fogged glass
const BEAD_FILM_MM = 0.10714;   // thick enough that the film breaks up into beads
const ADHERED_MM = 0.00517;   // bound to the glass by adhesion, cannot be gathered
// These two are not part of that budget: they are set by the balance between
// gravity and surface tension, so they are drop-scale, not film-scale.
const SAG_HEIGHT = 0.25;       // film deep enough to creep downhill on its own
const POOL_HEIGHT = 0.9;       // deep enough to level like a pool rather than bead
const MM = 6.2;                // CSS pixels per millimetre
// A finger that has wiped a steamed mirror is wet: this much of what each
// stroke sample mobilises leaves with it and never comes back.
const CARRIED_OFF = 0.09;
// How much of the haze's recovery rate the *water* behind it recovers at.
// One is a perpetual motion machine; see §5c.
const AMBIENT_SUPPLY = 0.06;

export class Surface {
  constructor(cols, rows) {
    this.setScale(3);
    this.resize(cols, rows);
  }

  /** Fix the physical scale, so a micron of film is a micron on any device. */
  setScale(cellPx) {
    const cellMm = Math.max(0.02, cellPx / MM);
    this.cellMm = cellMm;
    const was = this.fogYield || 0;
    this.fogYield = FOG_FILM_MM / cellMm;
    this.beadFilm = BEAD_FILM_MM / cellMm;
    this.adhered = ADHERED_MM / cellMm;
    // A height unit is a cell deep, so changing the cell size changes what a
    // given height *means*. The charge already in the fog has to move with it.
    if (was > 0 && this.humid) {
      const k = this.fogYield / was;
      for (let i = 0; i < this.humid.length; i += 1) this.humid[i] *= k;
    }
  }

  resize(cols, rows) {
    const n = cols * rows;
    const old = this.cols ? { cols: this.cols, rows: this.rows, fog: this.fog, humid: this.humid, water: this.water, wet: this.wet } : null;
    this.cols = cols;
    this.rows = rows;
    this.fog = new Float32Array(n);
    this.humid = new Float32Array(n);
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
    this._chargeFog();
  }

  /**
   * Start over: no liquid, no wetness memory, no tracks, and an even sheet of
   * fresh condensation. This is not the Steam button — steam adds to whatever
   * is already on the glass, keeps every drop and streak, and leaves the
   * patchiness where it was. This puts the mirror back to how it looked before
   * anyone touched it.
   */
  refresh() {
    this.water.fill(0);
    this.wet.fill(0);
    this.flowId.fill(NONE);
    this._seedFog();
    // Thick and even — only a trace of the unevenness a mirror always has.
    for (let i = 0; i < this.fog.length; i += 1) this.fog[i] = 0.93 + 0.07 * this.fog[i];
    this._chargeFog();
  }

  /** Give the fog the liquid it stands for — a freshly steamed pane is loaded. */
  _chargeFog() {
    for (let i = 0; i < this.fog.length; i += 1) this.humid[i] = this.fog[i] * this.fogYield;
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
        this.humid[d] = old.humid[s];
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
      const add = amount * patch * affinity;
      fog[i] = Math.min(1, fog[i] + add);
      // Steam is the one thing that actually brings water to the glass, so it
      // is the one thing that recharges what a finger or a drop can harvest.
      this.humid[i] = Math.min(this.fogYield, this.humid[i] + add * this.fogYield);
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
      // ...and the water it stands for arrives far more slowly than the haze
      // does. See §5c: the haze is a scattering effect and recovers in seconds
      // on wet glass, but the liquid behind it is real water out of the air,
      // and at the haze's rate it is an unlimited supply that never stops
      // feeding drops.
      const cap = fog[i] * this.fogYield;
      if (this.humid[i] < cap) {
        this.humid[i] += (cap - this.humid[i]) * rate * affinity * AMBIENT_SUPPLY;
      } else {
        this.humid[i] = cap;
      }
      // wetness fades much more slowly than fog returns
      wet[i] -= wet[i] * 0.02 * dt;
      // A little water is always evaporating — as a fraction of what is there,
      // not as a fixed amount per cell. A fixed amount makes the total loss
      // proportional to the wetted *area*, so a single wipe covering thousands
      // of cells boils itself dry in seconds and no drop can ever feed.
      if (water[i] > 0) {
        // Water lying in the track a flow has already run down is not free
        // water: the flow drained the channel, and what is left is a bound
        // residual film held by contact-angle hysteresis. It dries in place —
        // it does not gather itself into a second drop, and a third, down the
        // same line. That procession is the least real thing this can do.
        const track = this.flowId[i] !== NONE ? 3.5 : 1;
        water[i] -= water[i] * 0.022 * track * dt;
        if (water[i] < 1e-4) water[i] = 0;
      }
      // The glass forgets a track once it has dried and re-fogged over.
      if (this.flowId[i] !== NONE && wet[i] < 0.2) this.flowId[i] = NONE;
    }

    // --- coarsening: a thin film on glass does not sit there evenly, it breaks
    // up and gathers into beads, because surface tension makes a flat film
    // unstable. Diffusion alone does the opposite — it smooths the film out —
    // so with only diffusion the water spreads into a sheet too thin to ever
    // bead, and nothing further can happen. Water therefore moves towards its
    // thickest neighbour, which is what makes a wiped mirror pull itself into
    // drops. Transfers are explicit, so this conserves water exactly.
    // Not all of it can gather, though. Glass holds water: adhesion and the
    // roughness of a real mirror pin a thin residue that surface tension cannot
    // pull along, so a wiped pane never gathers itself completely into beads —
    // it keeps a faint damp haze that only evaporation removes. A perfectly
    // smooth surface would be the case where the whole film beads up. How much
    // is held follows the same heterogeneity field that decides where drops pin.
    scratch.set(water);
    const gather = Math.min(0.3, 1.4 * dt);
    const level = Math.min(0.18, 1.2 * dt);
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        const i = y * cols + x;
        const h = scratch[i];
        // A residual film in a flow's own track is pinned, not free to gather.
        if (h < 0.65 * this.beadFilm && this.flowId[i] !== NONE) continue;
        const bound = this.adhered * this.heterogeneity[i];
        const free = h - bound;
        if (free <= 0) continue;
        let best = -1;
        let bi = -1;
        for (let n = 0; n < 4; n += 1) {
          const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - cols : i + cols;
          if (scratch[j] > best) { best = scratch[j]; bi = j; }
        }
        if (h > POOL_HEIGHT) {
          // A real pool does level out; only the thin film coarsens.
          const avg = (scratch[i - 1] + scratch[i + 1] + scratch[i - cols] + scratch[i + cols]) * 0.25;
          water[i] += (avg - h) * level;
        } else if (best > h) {
          // only the water above what the glass holds is free to move
          const move = Math.min(free * 0.3, gather * (best - h) * free * 2.2);
          water[i] -= move;
          water[bi] += move;
        }
      }
    }

    // --- sag: a thick film creeps downhill even with no drop leading it
    if (gravity && gravity.plane > 0.05) {
      const gx = gravity.x;
      const gy = gravity.y;
      const step = Math.min(0.3, 1.3 * dt * gravity.plane);
      scratch.set(water);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const i = y * cols + x;
          const h = scratch[i];
          if (h < SAG_HEIGHT) continue;
          const nx = x + (gx > 0.35 ? 1 : gx < -0.35 ? -1 : 0);
          const ny = y + (gy > 0.35 ? 1 : gy < -0.35 ? -1 : 0);
          if ((nx === x && ny === y) || !this.inside(nx, ny)) continue;
          const move = (h - SAG_HEIGHT) * step;
          water[i] -= move;
          const j = ny * cols + nx;
          water[j] += move;
          // Water creeping out of a flow's track takes the track with it. If it
          // does not, every rivulet quietly leaks unowned water onto the glass
          // just ahead of itself, and that water beads — which is a queue of
          // drops coming down the same line and never stopping.
          if (this.flowId[i] !== NONE && this.flowId[j] === NONE) this.flowId[j] = this.flowId[i];
          // Water running over dry glass wets it; the next drop down this line
          // will find it easier going.
          if (wet[j] < 0.5) wet[j] = Math.min(0.5, wet[j] + move * 2.5);
        }
      }
    }
  }

  /**
   * A finger is a displacement, not an eraser. Returns how much liquid the
   * stroke sample mobilised, so the caller can see water is conserved: what it
   * mobilises is deposited around the contact patch, apart from the small share
   * that leaves on the finger itself.
   *
   * `dirX, dirY` is the direction the finger is travelling, if known: water is
   * pushed out to the sides of the *track*, which is not the same as the sides
   * of the gravity vector once you draw anything but a horizontal line.
   */
  wipe(px, py, radius, gravity, speed, dirX = 0, dirY = 0) {
    const { cols, rows, fog, water, wet, heterogeneity } = this;
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
        // A fingertip is not a soft brush. Almost all of the contact patch is
        // pressed flat against the glass and only the rim tapers off, so the
        // track a finger leaves has a definite edge.
        const t = Math.sqrt(d2) / r;
        const contact = 1 - t * t * t;
        const i = y * cols + x;

        // 1. the fine mist goes
        const clear = 0.94 * contact;
        fog[i] -= fog[i] * clear;

        // 2. and the water that mist was holding comes with it
        const took = this.humid[i] * clear;
        this.humid[i] -= took;
        collected += took;

        // 3. and the free water goes with it. A finger is a squeegee: it takes
        // everything but the film adhesion binds to the glass, so the track
        // behind it is clear, not a wet band. Leaving half the water where the
        // finger went made the whole length of a stroke go on beading.
        const bound = Math.min(water[i], this.adhered * heterogeneity[i]);
        const mobile = (water[i] - bound) * contact;
        water[i] -= mobile;
        collected += mobile;

        // 4. the glass stays wetted — but only just. Wetness is what the optics
        // read as a film (see PHYSICS.md §12a), and a squeegeed track has had
        // its film taken away: it is clear glass that happens to wet easily,
        // not a band of water. A rivulet's track, which really does carry a
        // film, is left far wetter than this.
        wet[i] = Math.min(1, Math.max(wet[i], 0.3 * contact + 0.14));
      }
    }

    if (collected <= 0) return 0;

    // All of it goes to the rim of the contact patch: the gravity-down edge
    // takes most, the sides of the track take the rest, and nothing at all is
    // put back in the middle. Water does not stay where a finger has just been.
    // A little leaves on the finger — a finger that has wiped a steamed mirror
    // is wet, and that water is off the glass for good.
    const g = gravity && gravity.plane > 0.08 ? gravity : null;
    const fast = Math.min(1, speed / 320);
    const carried = CARRIED_OFF;
    const spread = collected * (1 - carried);
    const downShare = g ? 0.68 + 0.14 * fast : 0.34;
    const sideShare = 1 - downShare;
    // Sideways means either side of the track, not either side of gravity —
    // they are only the same thing while you are drawing a horizontal line.
    let sx = -dirY;
    let sy = dirX;
    if (sx * sx + sy * sy < 0.01) { sx = g ? -g.y : 1; sy = g ? g.x : 0; }

    if (g) {
      this._deposit(px + g.x * r * 0.95, py + g.y * r * 0.95, r * 0.7, spread * downShare);
    } else {
      this._deposit(px, py + r * 0.9, r * 0.7, spread * downShare * 0.5);
      this._deposit(px, py - r * 0.9, r * 0.7, spread * downShare * 0.5);
    }
    this._deposit(px + sx * r * 0.9, py + sy * r * 0.9, r * 0.6, spread * sideShare * 0.5);
    this._deposit(px - sx * r * 0.9, py - sy * r * 0.9, r * 0.6, spread * sideShare * 0.5);
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
