// flows.js — the bulk water: beads that sit, beads that break away, and the
// rivulets they become. A head is the front of a connected body of water, not a
// sprite: it carries mass, it owns cells in the pane's flow map, and it merges
// with anything it reaches. Nothing here draws.
//
// The film in surface.js and the heads here are the two halves of one hybrid.
// The field carries everything thin — creep, dewetting, residue, wet memory —
// and heads carry the thick fast water, which is far cheaper to move as an
// object than as a grid. They exchange mass in both directions and the total is
// conserved.

import { MM, NONE } from './surface.js?v=20260830b';

// A sessile drop on glass is a spherical cap, so its volume goes as the cube of
// its base radius, not the square. Getting that wrong makes every mass-derived
// quantity depend on the grid resolution.
const CAP = 0.52;                   // cap volume / (pi * r^3) at ~80 degrees

// Sizes in millimetres. Water on a vertical pane cannot be held as a bead much
// past the capillary length, about 2.7 mm, so anything bigger has already
// become a rivulet; and a bead of about a millimetre across is where gravity
// starts to beat the contact line.
// The capillary length of water is about 2.7 mm, and contact-angle hysteresis
// on glass is substantial, so a bead well over two millimetres across still
// sits where it landed. Set this too low and every drop breaks away the moment
// it forms and streaks off the pane: the standing population of pinned beads —
// which is most of what rain on a window actually looks like — never builds up
// at all, and the glass reads as almost dry in a downpour.
const MAX_RADIUS_MM = 2.6;
const DEPIN_RADIUS_MM = 1.15;
const NUCLEATE_RADIUS_MM = 0.30;
const MIN_RADIUS_MM = 0.22;
const COLLECT_MAX_MM = 5.0;

// The drive is gravity, in mm/s^2, and it is the real number. Writing a smaller
// one here to stand in for viscosity is what made every drop crawl: the losses
// belong in the drag and in the contact-line resistance, both of which depend
// on the drop, and a blanket reduction cannot tell a bead from a rivulet.
const ACC_MM = 9810;
// Everything sideways is a *fraction* of that, so the balance between falling
// and being pulled sideways is fixed however fast the water ends up running.
const ATTRACT = 0.42;               // capillary bridging, short range only
const STEER = 0.26;                 // preference for running down wet glass
const TEXTURE = 0.067;              // the pane's own stable unevenness
const WET_SENSE_MM = 9;             // wetness felt this far to either side
// Terminal speed is v = acc * net * vol^0.4 / this, which puts a 2.4 mm drop
// near 190 mm/s and a 3.8 mm one near 390 — the range a drop on a vertical
// window actually runs at.
const DRAG_BASE = 60;

const PIN_HYSTERESIS = 0.55;        // a moving contact line resists less than a stuck one
const MAX_HEADS = 260;              // a performance budget, never a metering valve
const COLLECT_RATE = 3.0;           // how fast a head drains the film it sits on
// What a running drop leaves behind, per cell of travel. A trail about a
// millimetre wide and a fiftieth of a millimetre thick costs roughly one drop's
// worth of water per hundred millimetres, so this is small — and it has to be,
// because it is charged per cell and a drop at full speed covers fifteen cells
// in a frame. Set it by how it looks rather than by that arithmetic and the
// head bleeds out in a few frames, never reaches its terminal speed, and the
// whole pane goes back to crawling.
const TRAIL_RATE = 0.012;           // residual film per cell of travel
const TRAIL_MAX_SHARE = 0.0022;     // ...and never more than this much of the head
const TRAIL_WET_MIN = 0.45;
const BRIDGE_DAMP = 9;              // how fast a merged body stops wobbling

export function radiusForMass(mass) {
  return Math.cbrt(Math.max(0, mass) / (Math.PI * CAP));
}

export function massForRadius(r) {
  return Math.PI * CAP * r * r * r;
}

export class FlowSystem {
  constructor(surface) {
    this.surface = surface;
    this.heads = [];
    this.nextId = 1;
    this.parent = [0];
    this.scanCursor = 0;
    this.merges = 0;
    this.liveRoots = new Set();
    this.setScale(3);
  }

  setScale(cellPx) {
    const px = Math.max(0.5, cellPx);
    const cellMm = px / MM;
    this.cellPx = px;
    this.cellMm = cellMm;
    const cells = (mm) => mm / cellMm;
    this.maxMass = massForRadius(cells(MAX_RADIUS_MM));
    this.nucleateMass = massForRadius(cells(NUCLEATE_RADIUS_MM));
    this.minMass = massForRadius(cells(MIN_RADIUS_MM));
    this.collectMax = cells(COLLECT_MAX_MM);
    // Drive grows as r^3 and contact-line resistance as r, so the size at which
    // a bead breaks away falls out of this one number instead of being a
    // separate threshold that can drift away from the sizes around it.
    this.pinBase = Math.PI * CAP * cells(DEPIN_RADIUS_MM) ** 2;
    this.acc = cells(ACC_MM);
    this.attract = this.acc * ATTRACT;
    this.steer = this.acc * STEER;
    this.texture = this.acc * TEXTURE;
    this.wetSense = cells(WET_SENSE_MM);
    this.volumeUnit = cellMm * cellMm * cellMm;   // mm^3 per unit of mass
  }

  reset() {
    this.heads.length = 0;
    this.parent = [0];
    this.nextId = 1;
    this.merges = 0;
  }

  // --- union-find over connected bodies -------------------------------------

  _newFlowId() {
    const id = this.nextId;
    this.nextId += 1;
    this.parent[id] = id;
    return id;
  }

  find(id) {
    if (id <= 0) return 0;
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[id] !== root) {
      const next = this.parent[id];
      this.parent[id] = root;
      id = next;
    }
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (!ra || !rb || ra === rb) return ra || rb;
    this.parent[rb] = ra;
    return ra;
  }

  // --- main step ------------------------------------------------------------

  update(dt, gravity) {
    this.liveRoots.clear();
    for (const h of this.heads) this.liveRoots.add(this.find(h.id));
    this._nucleate();
    this._bridge(dt);
    for (const head of this.heads) this._step(head, dt, gravity);
    this._merge(dt);
    this.heads = this.heads.filter((h) => {
      if (h.gone) return false;
      if (h.mass >= this.minMass) return true;
      // A head that dwindles away gives its water back into its own channel,
      // never as loose water on fresh glass — loose water simply beads again.
      this._shed(h, Math.max(1, radiusForMass(h.mass)), h.mass);
      return false;
    });
  }

  /**
   * New beads form where the film has gathered past the thickness at which it
   * is stable, and nowhere else. Water only gets onto this pane by falling on
   * it, so thickness is the evidence: a dry patch cannot produce a drop.
   */
  _nucleate() {
    if (this.heads.length >= MAX_HEADS) return;
    const s = this.surface;
    const { cols, rows, h, wet, pin } = s;
    const total = cols * rows;
    const budget = Math.min(total, 3400);
    let made = 0;

    for (let n = 0; n < budget && made < 3; n += 1) {
      const i = (this.scanCursor + n * 37) % total;
      const p = pin[i];
      // Cubing spreads the gate widely across the pane, so beads appear where
      // the glass happens to favour them instead of at even intervals wherever
      // water happens to lie — which reads as a comb.
      if (h[i] < s.beadFilm * p * p * p) continue;
      // Water inside a body that is still running belongs to that body.
      const owner = s.flowId[i];
      if (owner > 0 && this.liveRoots.has(this.find(owner))) continue;

      // Walk uphill to the top of the local gathering.
      let x = i % cols;
      let y = (i / cols) | 0;
      for (let climb = 0; climb < 5; climb += 1) {
        let bx = x;
        let by = y;
        let best = h[y * cols + x];
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (!s.inside(nx, ny)) continue;
            const v = h[ny * cols + nx];
            if (v > best) { best = v; bx = nx; by = ny; }
          }
        }
        if (bx === x && by === y) break;
        x = bx;
        y = by;
      }

      let taken = false;
      for (const head of this.heads) {
        const rr = radiusForMass(head.mass) * 2.4 + 3;
        if ((head.x - x) ** 2 + (head.y - y) ** 2 < rr * rr) { taken = true; break; }
      }
      if (taken) continue;

      // A bead's mass comes out of the patch of film it clears, so a thinner
      // film has to clear a wider patch. Fixing this radius means that below
      // some thickness no bead can form at all however much water is lying
      // about — and draining wider than it needs eats the catchment the newborn
      // will want in order to grow.
      const share = 0.85;
      const depth = Math.max(1e-4, h[y * cols + x]);
      const rDrain = Math.min(8, Math.max(1.6, Math.sqrt(3 * this.nucleateMass / (Math.PI * depth * share))));
      const mass = this._drain(x, y, rDrain, share);
      if (mass < this.nucleateMass) {
        s.deposit(x, y, rDrain, mass);
        continue;
      }
      this.heads.push({
        id: this._newFlowId(),
        x, y, mass,
        vx: 0, vy: 0,
        pinned: true,
        lastX: x,
        lastY: y,
        wobble: 0,
        wobbleT: 0,
        wobbleX: 1,
        wobbleY: 0,
        gone: false,
      });
      made += 1;
      void rows;
    }
    this.scanCursor = (this.scanCursor + budget) % total;
  }

  /** Take up to `share` of the water within `radius`, and return how much. */
  _drain(px, py, radius, share, biasX = 0, biasY = 0) {
    const s = this.surface;
    const { cols, h } = s;
    const r = Math.max(1, radius);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(s.rows - 1, Math.ceil(py + r));
    let got = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - px;
        const dy = y - py;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = y * cols + x;
        if (h[i] <= 0) continue;
        const along = d > 0.001 ? (dx * biasX + dy * biasY) / d : 0;
        const reach = (1 - d / r) * (1 + 0.5 * along);
        if (reach <= 0) continue;
        const take = Math.min(h[i], h[i] * share * reach);
        h[i] -= take;
        got += take;
      }
    }
    return got;
  }

  _step(head, dt, gravity) {
    const s = this.surface;
    const { wet, pin, flowId } = s;
    if (head.wobble > 0) {
      head.wobble = Math.max(0, head.wobble - BRIDGE_DAMP * dt * head.wobble);
      head.wobbleT += dt;
    }
    const r = radiusForMass(head.mass);
    const speed = Math.hypot(head.vx, head.vy);
    const dirX = speed > 0.01 ? head.vx / speed : gravity.x;
    const dirY = speed > 0.01 ? head.vy / speed : gravity.y;

    // --- collect: the head drinks the film around and ahead of it
    const moving = speed > 1;
    const collectRadius = Math.min(this.collectMax, r * (moving ? 1.6 : 1.15) + 1.8);
    const share = Math.min(0.85, COLLECT_RATE * dt * (moving ? 1.4 : 1));
    head.mass += this._drain(head.x, head.y, collectRadius, share, dirX, dirY);
    // Past the size the pane can hold as a bead, the surplus becomes rivulet:
    // it goes into the body behind the head, claimed by this flow.
    if (head.mass > this.maxMass) {
      const excess = head.mass - this.maxMass;
      head.mass = this.maxMass;
      this._shed(head, Math.max(1, r), excess);
    }

    // --- standing in someone else's body joins the two
    const i = s.index(head.x, head.y);
    const here = flowId[i];
    if (here > 0) {
      const mine = this.find(head.id);
      const theirs = this.find(here);
      if (theirs !== mine) { this.union(mine, theirs); this.merges += 1; }
    }

    // --- contact-angle hysteresis: two thresholds, not one
    const resist = this.pinBase * r * pin[i] * (1 - 0.45 * wet[i]);
    const drive = gravity.plane * head.mass;
    if (head.pinned) {
      if (drive > resist) head.pinned = false;
    } else if (drive < resist * PIN_HYSTERESIS && speed < 1.5) {
      head.pinned = true;
      head.vx = 0;
      head.vy = 0;
    }
    if (head.pinned) {
      head.vx *= 0.2;
      head.vy *= 0.2;
      return;
    }

    // --- motion. The contact line keeps resisting while the drop moves, so a
    // drop only just past its threshold creeps and a heavy one runs: that is
    // where "terminal speed depends on mass" actually comes from, rather than
    // from a drag curve alone.
    const net = Math.max(0, drive - resist * PIN_HYSTERESIS) / head.mass;
    let ax = gravity.x * this.acc * net;
    let ay = gravity.y * this.acc * net;

    // Wet glass has a lower contact angle, so a flow meets less resistance on
    // the side that is already wet and veers that way. This is the only thing
    // that acts at a few millimetres — surface tension does not reach that far
    // — and it is what makes neighbouring rivulets converge. Being a
    // difference it is exactly zero on even glass, so water still falls straight.
    const sense = (reach) => {
      const bx = -reach * dirX * 0.4;
      const by = -reach * dirY * 0.4;
      const lx = -reach * dirY;
      const ly = reach * dirX;
      return wet[s.index(head.x + bx + lx, head.y + by + ly)]
           - wet[s.index(head.x + bx - lx, head.y + by - ly)];
    };
    const steer = (sense(1.5 + r) + 0.8 * sense(this.wetSense)) * this.steer * gravity.plane;
    // the pane's own unevenness bends the path; no random wandering
    const bend = (pin[i] - 1) * this.texture * gravity.plane;
    ax += -dirY * (steer + bend);
    ay += dirX * (steer + bend);

    // Drag, integrated exactly rather than as v -= v * drag * dt. Water on glass
    // is heavily damped: drag times a sixtieth of a second is well over a half,
    // and at that size the explicit step settles at barely a third of the true
    // terminal speed — which is precisely the difference between water running
    // down a window and something gelatinous creeping down it. The closed form
    // of dv/dt = a - drag*v is right at any step size and costs one exp.
    const vol = Math.max(0.02, head.mass * this.volumeUnit);
    const drag = DRAG_BASE / Math.pow(vol, 0.4);
    const decay = Math.exp(-drag * dt);
    head.vx = head.vx * decay + (ax / drag) * (1 - decay);
    head.vy = head.vy * decay + (ay / drag) * (1 - decay);

    const px = head.x;
    const py = head.y;
    head.x += head.vx * dt;
    head.y += head.vy * dt;
    // Where it was at the start of the frame. A drop at full speed crosses more
    // than its own width in a sixtieth of a second, so the optics have to draw
    // the segment it swept rather than a disc at the far end.
    head.lastX = px;
    head.lastY = py;

    if (head.x < 0 || head.y < 0 || head.x > s.cols - 1 || head.y > s.rows - 1) {
      // off the edge of the pane: this water is gone
      s.drained += head.mass;
      head.mass = 0;
      head.gone = true;
      return;
    }

    this._layTrail(head, px, py, r);
  }

  /** Put water down at the head and claim it for this flow. */
  _shed(head, radius, amount) {
    if (amount <= 0) return;
    const s = this.surface;
    const { cols, flowId } = s;
    s.deposit(head.x, head.y, radius, amount);
    const root = this.find(head.id);
    const r = Math.max(1, radius);
    const x0 = Math.max(0, Math.floor(head.x - r));
    const x1 = Math.min(cols - 1, Math.ceil(head.x + r));
    const y0 = Math.max(0, Math.floor(head.y - r));
    const y1 = Math.min(s.rows - 1, Math.ceil(head.y + r));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if ((x - head.x) ** 2 + (y - head.y) ** 2 > r * r) continue;
        const i = y * cols + x;
        const owner = flowId[i];
        if (owner > 0 && this.find(owner) !== root) { this.union(root, owner); this.merges += 1; }
        flowId[i] = root;
      }
    }
  }

  /**
   * The body the head leaves behind: real water, wet glass, ownership. A big
   * head drags a broad obviously wet channel and a small one leaves a thread,
   * so both the width and how wet it is left follow the head's mass — identical
   * trails are the sign that a floor has swallowed the whole range.
   */
  _layTrail(head, px, py, r) {
    const s = this.surface;
    const { cols, h, wet, flowId } = s;
    const dist = Math.hypot(head.x - px, head.y - py);
    if (dist < 0.05) return;
    const root = this.find(head.id);
    const load = Math.min(1, head.mass / this.maxMass);
    const width = Math.max(1.1, r * 0.85 * (0.7 + 0.6 * load));
    const strength = TRAIL_WET_MIN + (1 - TRAIL_WET_MIN) * load;
    const steps = Math.max(1, Math.ceil(dist));
    const perStep = TRAIL_RATE * width * (dist / steps);

    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      const cx = px + (head.x - px) * t;
      const cy = py + (head.y - py) * t;
      const give = Math.min(head.mass * TRAIL_MAX_SHARE, perStep);
      let weight = 0;
      const x0 = Math.max(0, Math.floor(cx - width));
      const x1 = Math.min(cols - 1, Math.ceil(cx + width));
      const y0 = Math.max(0, Math.floor(cy - width));
      const y1 = Math.min(s.rows - 1, Math.ceil(cy + width));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x - cx, y - cy) / width;
          if (d > 1) continue;
          weight += 1 - d;
        }
      }
      if (weight <= 0) continue;
      head.mass -= give;              // only once we know where it is going
      const scale = give / weight;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x - cx, y - cy) / width;
          if (d > 1) continue;
          const i = y * cols + x;
          h[i] += (1 - d) * scale;
          const v = strength * (1 - 0.3 * d);
          if (wet[i] < v) wet[i] = v;
          const owner = flowId[i];
          if (owner > 0 && this.find(owner) !== root) { this.union(root, owner); this.merges += 1; }
          flowId[i] = root;
        }
      }
    }
  }

  /**
   * Capillary bridging. Two bodies of water that come close do not wait until
   * their outlines overlap: a neck forms across the gap and pulls them
   * together. Once bridged they are one hydraulic body, and from then on the
   * pull between them is much stronger and reaches much further — which is what
   * stops two rivulets running side by side to the bottom of the pane.
   */
  _bridge(dt) {
    const heads = this.heads;
    for (let a = 0; a < heads.length; a += 1) {
      const A = heads[a];
      for (let b = a + 1; b < heads.length; b += 1) {
        const B = heads[b];
        const ra = radiusForMass(A.mass);
        const rb = radiusForMass(B.mass);
        const joined = this.find(A.id) === this.find(B.id);
        // Short range on purpose: a long reach drags every new bead sideways
        // the moment it forms, which is both unphysical and the fastest way to
        // stop water falling straight down.
        const reach = joined ? (ra + rb) * 5 + 12 : (ra + rb) * 2.6 + 4;
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.001 || d > reach) continue;
        dx /= d;
        dy /= d;
        const pull = this.attract * (joined ? 2 : 1) * (1 - d / reach) * dt;
        const total = A.mass + B.mass;
        A.vx += dx * pull * (B.mass / total);
        A.vy += dy * pull * (B.mass / total);
        B.vx -= dx * pull * (A.mass / total);
        B.vy -= dy * pull * (A.mass / total);
        // A neck has formed: they are one body now even though they are still
        // drawn as two, which is exactly what a merging pair looks like.
        if (!joined && d < (ra + rb) * 1.9) {
          this.union(this.find(A.id), this.find(B.id));
          this.merges += 1;
          A.pinned = false;
          B.pinned = false;
        }
      }
    }
  }

  /** Bridged heads that have closed become one, and the new body rings a little. */
  _merge(dt) {
    const heads = this.heads;
    for (let a = 0; a < heads.length; a += 1) {
      const A = heads[a];
      if (A.mass <= 0) continue;
      for (let b = a + 1; b < heads.length; b += 1) {
        const B = heads[b];
        if (B.mass <= 0) continue;
        const ra = radiusForMass(A.mass);
        const rb = radiusForMass(B.mass);
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        const joined = this.find(A.id) === this.find(B.id);
        const touching = d < (ra + rb) * (joined ? 1.6 : 1.15);
        const big = A.mass > B.mass * 1.6 ? A : B.mass > A.mass * 1.6 ? B : null;
        const captures = big && d < radiusForMass(big.mass) * 2.6 + 3;
        if (!touching && !captures) continue;

        const keep = A.mass >= B.mass ? A : B;
        const gone = keep === A ? B : A;
        const mass = A.mass + B.mass;
        const ux = d > 0.001 ? (B.x - A.x) / d : 1;
        const uy = d > 0.001 ? (B.y - A.y) / d : 0;
        keep.vx = (A.vx * A.mass + B.vx * B.mass) / mass;
        keep.vy = (A.vy * A.mass + B.vy * B.mass) / mass;
        keep.x = (A.x * A.mass + B.x * B.mass) / mass;
        keep.y = (A.y * A.mass + B.y * B.mass) / mass;
        keep.mass = mass;
        keep.pinned = keep.pinned && gone.pinned;
        // The combined drop does not arrive as a circle. It rings along the
        // line the two came together on and the ringing dies away.
        keep.wobble = Math.min(1, keep.wobble + 0.75 * Math.min(A.mass, B.mass) / mass * 2);
        keep.wobbleX = ux;
        keep.wobbleY = uy;
        keep.wobbleT = 0;
        this.union(this.find(keep.id), this.find(gone.id));
        this.merges += 1;
        gone.mass = 0;
        gone.gone = true;
      }
    }
    void dt;
    this.heads = heads.filter((h) => !h.gone);
  }

  /** Mass held by the moving water, for conservation checks. */
  totalMass() {
    let sum = 0;
    for (const h of this.heads) sum += h.mass;
    return sum;
  }
}
