// droplets.js — the active water. A visible drop is the head of a connected
// body of water, not an independent particle: it takes its mass from the
// surface, leaves some of it behind as a trail, and merges with anything it
// runs into. Nothing here draws.

const MIN_HEAD_MASS = 3.4;      // below this a head dissolves back into the film
const NUCLEATE_MASS = 4.2;      // a new head must be able to start this heavy
const MAX_HEADS = 40;
const MAX_MASS = 240;           // a drop this size sheds as fast as it collects
const HEIGHT = 0.62;            // mean height of a head, for mass <-> radius
const GRAVITY_ACC = 46;         // cells per second squared at full tilt
// Terminal speed rises with mass, but only as its fourth root: a fat drop is
// visibly faster than a bead without becoming a bullet.
const DRAG = 3.0;
const PIN_BASE = 5.6;           // resistance per unit of contact radius
const PIN_HYSTERESIS = 0.55;    // a moving drop stops less easily than it starts
// A rivulet leaves a thin trail relative to what it carries. Too generous here
// and a small head bleeds out before it can pick up speed, which kills the
// whole bead -> creep -> grow sequence.
const TRAIL_RATE = 0.12;        // residual water per cell of travel, scaled by radius
const TRAIL_MAX_SHARE = 0.03;   // ...and never more than this much of the head per cell
const COLLECT_RATE = 3.4;       // how fast a head drains the film it sits on

export function radiusForMass(mass) {
  return Math.sqrt(Math.max(0, mass) / (Math.PI * HEIGHT));
}

export class FlowSystem {
  constructor(surface) {
    this.surface = surface;
    this.heads = [];
    this.nextId = 1;
    this.parent = [0];          // union-find over flow-body ids
    this.scanCursor = 0;
    this.merges = 0;
  }

  reset() {
    this.heads.length = 0;
    this.parent = [0];
    this.nextId = 1;
    this.merges = 0;
  }

  // --- union-find over connected water bodies -----------------------------

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

  // --- main step ----------------------------------------------------------

  update(dt, gravity) {
    const s = this.surface;
    this._nucleate(gravity);
    this._attract(dt);
    for (const head of this.heads) this._step(head, dt, gravity);
    this._mergeHeads();
    this.heads = this.heads.filter((h) => {
      if (h.mass >= MIN_HEAD_MASS) return true;
      // A head that shrinks away gives its water back rather than vanishing.
      s._deposit(h.x, h.y, Math.max(1.2, radiusForMass(h.mass)), h.mass);
      return false;
    });
  }

  /**
   * New heads only form where water has actually gathered, and never within
   * reach of a bigger neighbour — that one should be drinking it instead.
   */
  _nucleate(gravity) {
    if (this.heads.length >= MAX_HEADS) return;
    const s = this.surface;
    const { cols, rows, water, wet } = s;
    const total = cols * rows;
    const budget = Math.min(total, 2600);
    let made = 0;

    for (let n = 0; n < budget && made < 2; n += 1) {
      const i = (this.scanCursor + n * 37) % total;
      // Water only ever gets onto the glass by being wiped there, deposited by
      // a trail, or run down from one of those — so water itself is the
      // evidence of disturbance. Untouched fog has none and cannot bead.
      // The gate follows the surface's own texture, so beads appear where the
      // glass favours them rather than in an evenly spaced row along a stroke.
      if (water[i] < 0.30 * s.heterogeneity[i]) continue;
      if (wet[i] < 0.08 && water[i] < 0.5) continue;

      // Walk uphill to the top of the local gathering. A wiped ridge is broad
      // and smooth, so testing whether one cell beats its 24 neighbours is far
      // too brittle — on a sagging film there is often no such cell at all.
      let x = i % cols;
      let y = (i / cols) | 0;
      for (let climb = 0; climb < 5; climb += 1) {
        let bx = x;
        let by = y;
        let best = water[y * cols + x];
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (!s.inside(nx, ny)) continue;
            const h = water[ny * cols + nx];
            if (h > best) { best = h; bx = nx; by = ny; }
          }
        }
        if (bx === x && by === y) break;
        x = bx;
        y = by;
      }

      // A collector already within reach should be drinking this, not a rival.
      let taken = false;
      for (const head of this.heads) {
        const rr = radiusForMass(head.mass) * 4 + 7;
        if ((head.x - x) ** 2 + (head.y - y) ** 2 < rr * rr) { taken = true; break; }
      }
      if (taken) continue;

      const mass = this._drain(x, y, 4.2, 1);
      if (mass < NUCLEATE_MASS) {
        s._deposit(x, y, 4.2, mass);   // not enough gathered yet: put it back
        continue;
      }
      this.heads.push({
        id: this._newFlowId(),
        x, y,
        mass,
        vx: 0,
        vy: 0,
        pinned: true,
        age: 0,
      });
      made += 1;
      void gravity;
      void rows;
    }
    this.scanCursor = (this.scanCursor + budget) % total;
  }

  /** Take up to `share` of the water within `radius`, and return how much. */
  _drain(px, py, radius, share, biasX = 0, biasY = 0) {
    const s = this.surface;
    const { cols, rows, water } = s;
    const r = Math.max(1, radius);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(cols - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(rows - 1, Math.ceil(py + r));
    let got = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - px;
        const dy = y - py;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = y * cols + x;
        if (water[i] <= 0) continue;
        // water ahead of a moving head is easier to reach than water behind it
        const along = d > 0.001 ? (dx * biasX + dy * biasY) / d : 0;
        const reach = (1 - d / r) * (1 + 0.5 * along);
        if (reach <= 0) continue;
        const take = Math.min(water[i], water[i] * share * reach);
        water[i] -= take;
        got += take;
      }
    }
    void rows;
    return got;
  }

  _step(head, dt, gravity) {
    const s = this.surface;
    const { cols, water, wet, heterogeneity, flowId } = s;
    head.age += dt;
    const r = radiusForMass(head.mass);
    const speed = Math.hypot(head.vx, head.vy);
    const dirX = speed > 0.01 ? head.vx / speed : gravity.x;
    const dirY = speed > 0.01 ? head.vy / speed : gravity.y;

    // --- collect: the head drinks the film around and ahead of it. The reach
    // grows with the drop but far more slowly than the drop does, or a big head
    // would vacuum the whole pane.
    const moving = speed > 1;
    if (head.mass < MAX_MASS) {
      const collectRadius = Math.min(14, r * (moving ? 1.5 : 1.1) + 2.2);
      const share = Math.min(0.85, COLLECT_RATE * dt * (moving ? 1.4 : 1));
      head.mass = Math.min(MAX_MASS, head.mass + this._drain(head.x, head.y, collectRadius, share, dirX, dirY));
    }

    // --- head-body merge: standing in someone else's body joins the two
    const here = flowId[s.index(head.x, head.y)];
    if (here > 0) {
      const mine = this.find(head.id);
      const theirs = this.find(here);
      if (theirs !== mine) { this.union(mine, theirs); this.merges += 1; }
    }

    // --- pinning, with separate start and stop thresholds
    const i = s.index(head.x, head.y);
    const wetness = wet[i];
    const het = heterogeneity[i];
    const drive = gravity.plane * head.mass;
    const base = PIN_BASE * r * het * (1 - 0.55 * wetness);
    if (head.pinned) {
      if (drive > base) head.pinned = false;
    } else if (drive < base * PIN_HYSTERESIS && speed < 2) {
      head.pinned = true;
      head.vx = 0;
      head.vy = 0;
    }

    if (head.pinned) {
      head.vx *= 0.2;
      head.vy *= 0.2;
      return;
    }

    // --- motion: gravity, mass-dependent drag, a weak pull along wet glass
    const acc = GRAVITY_ACC * gravity.plane;
    head.vx += gravity.x * acc * dt;
    head.vy += gravity.y * acc * dt;

    const ahead = 2 + r;
    const wl = wet[s.index(head.x - ahead * dirY - ahead * dirX * 0.4, head.y + ahead * dirX - ahead * dirY * 0.4)];
    const wr = wet[s.index(head.x + ahead * dirY - ahead * dirX * 0.4, head.y - ahead * dirX - ahead * dirY * 0.4)];
    const steer = (wr - wl) * 26 * gravity.plane;
    head.vx += -dirY * steer * dt;
    head.vy += dirX * steer * dt;
    // stable surface texture nudges the path; no random wandering
    head.vx += (het - 1) * 14 * dt * -dirY;
    head.vy += (het - 1) * 14 * dt * dirX;

    const drag = DRAG / Math.pow(Math.max(1, head.mass), 0.25);
    head.vx -= head.vx * drag * dt;
    head.vy -= head.vy * drag * dt;

    const px = head.x;
    const py = head.y;
    head.x += head.vx * dt;
    head.y += head.vy * dt;

    if (head.x < 1 || head.y < 1 || head.x > s.cols - 2 || head.y > s.rows - 2) {
      head.x = Math.max(1, Math.min(s.cols - 2, head.x));
      head.y = Math.max(1, Math.min(s.rows - 2, head.y));
      head.mass *= 0.5;   // runs off the edge of the glass
    }

    this._layTrail(head, px, py, r);
    void cols;
    void water;
  }

  /** The body the head leaves behind: real water, wetness, cleared fog, ownership. */
  _layTrail(head, px, py, r) {
    const s = this.surface;
    const { cols, water, wet, fog, flowId } = s;
    const dist = Math.hypot(head.x - px, head.y - py);
    if (dist < 0.05) return;
    const root = this.find(head.id);
    const width = Math.max(0.9, r * 0.62);
    const steps = Math.max(1, Math.ceil(dist));
    const perStep = TRAIL_RATE * width * (dist / steps);

    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      const cx = px + (head.x - px) * t;
      const cy = py + (head.y - py) * t;
      const give = Math.min(head.mass * TRAIL_MAX_SHARE, perStep);
      head.mass -= give;
      let weight = 0;
      const x0 = Math.max(0, Math.floor(cx - width));
      const x1 = Math.min(s.cols - 1, Math.ceil(cx + width));
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
      const scale = give / weight;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x - cx, y - cy) / width;
          if (d > 1) continue;
          const i = y * cols + x;
          water[i] += (1 - d) * scale;
          wet[i] = Math.min(1, Math.max(wet[i], 0.85 - 0.3 * d));
          fog[i] *= 0.42 + 0.45 * d;
          const owner = flowId[i];
          if (owner > 0 && this.find(owner) !== root) { this.union(root, owner); this.merges += 1; }
          flowId[i] = root;
        }
      }
    }
  }

  /**
   * Two rivulets running a few millimetres apart do not stay parallel: their
   * wet halos touch, surface tension bridges them, and they pull together.
   * Without this, nearby flows run to the bottom of the glass side by side,
   * which is the single most obvious way a simulation like this looks fake.
   */
  _attract(dt) {
    const heads = this.heads;
    for (let a = 0; a < heads.length; a += 1) {
      const A = heads[a];
      for (let b = a + 1; b < heads.length; b += 1) {
        const B = heads[b];
        const ra = radiusForMass(A.mass);
        const rb = radiusForMass(B.mass);
        const reach = (ra + rb) * 2.8 + 5;
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.001 || d > reach) continue;
        dx /= d;
        dy /= d;
        // Closer pairs pull harder, and the lighter one moves further.
        const pull = 26 * (1 - d / reach) * dt;
        const total = A.mass + B.mass;
        A.vx += dx * pull * (B.mass / total);
        A.vy += dy * pull * (B.mass / total);
        B.vx -= dx * pull * (A.mass / total);
        B.vy -= dy * pull * (A.mass / total);
        // A bridged pair is no longer held by its dry contact line.
        if (d < reach * 0.55) { A.pinned = false; B.pinned = false; }
      }
    }
  }

  /** Heads that touch, or that a much larger neighbour can reach, become one. */
  _mergeHeads() {
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
        const touching = d < ra + rb;
        // a dominant collector reaches further than it touches
        const big = A.mass > B.mass * 2.5 ? A : B.mass > A.mass * 2.5 ? B : null;
        const captures = big && d < radiusForMass(big.mass) * 2.6 + 3;
        if (!touching && !captures) continue;

        // the survivor is the heavier one; ties go to whichever is further downstream
        const keep = A.mass >= B.mass ? A : B;
        const gone = keep === A ? B : A;
        const mass = A.mass + B.mass;
        keep.vx = (A.vx * A.mass + B.vx * B.mass) / mass;
        keep.vy = (A.vy * A.mass + B.vy * B.mass) / mass;
        keep.x = (A.x * A.mass + B.x * B.mass) / mass;
        keep.y = (A.y * A.mass + B.y * B.mass) / mass;
        keep.mass = mass;
        keep.pinned = keep.pinned && gone.pinned;
        this.union(this.find(keep.id), this.find(gone.id));
        this.merges += 1;
        gone.mass = 0;
      }
    }
    this.heads = heads.filter((h) => h.mass > 0);
  }

  /** Mass held by the moving water, for conservation checks. */
  totalMass() {
    let sum = 0;
    for (const h of this.heads) sum += h.mass;
    return sum;
  }
}
