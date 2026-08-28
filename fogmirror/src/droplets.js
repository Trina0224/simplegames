// droplets.js — the active water. A visible drop is the head of a connected
// body of water, not an independent particle: it takes its mass from the
// surface, leaves some of it behind as a trail, and merges with anything it
// runs into. Nothing here draws.
//
// Sizes are defined in CSS pixels, not simulation cells, because the physics is
// physical: water's capillary length is about 2.7 mm, and a drop much larger
// than that cannot be held on vertical glass by surface tension — it sheds into
// a rivulet or falls off. A CSS pixel is close to 0.16 mm on both a phone and a
// tablet, so px is a usable stand-in for millimetres, and the same drop is the
// same real size whatever the grid resolution happens to be.

const MM = 6.2;                     // CSS pixels per millimetre, near enough
// Sizes checked against a real steamed mirror: a haze of beads well under a
// millimetre, a scattering at one to two, and the two-millimetre ones are the
// few that leave a streak. Anything larger has already run off.
const MAX_RADIUS_PX = 1.15 * MM;    // ~2.3 mm across, plus a little render bloom
const NUCLEATE_RADIUS_PX = 0.26 * MM;
const MIN_RADIUS_PX = 0.2 * MM;
// A bead drains the film around it and then stops growing, so if the size it
// must reach to move is larger than its catchment can supply, it sits at
// ninety-odd percent of the threshold for ever — and drying glass raises the
// threshold faster than it can close the gap. Everything downstream of moving
// (sweeping up water, growing, merging, leaving a tail) then never happens.
const DEPIN_RADIUS_PX = 0.5 * MM;   // ~1 mm across is where a drop starts to slide
const COLLECT_MAX_PX = 5 * MM;
const MAX_HEADS = 12;
const HEIGHT = 0.62;                // mean height of a head, for mass <-> radius
const ACC_PX = 100;                 // gravity drive, CSS px per second squared
// Everything sideways must be a fraction of gravity, and must be scaled by cell
// size exactly as gravity is. These were raw cell-unit numbers: on a tablet the
// attraction between drops came out at more than twice the gravity drive, so a
// new bead was dragged sideways instead of falling. Water goes down.
const ATTRACT_PX = 46;              // capillary bridging, but only at close range
const STEER_PX = 26;                // preference for running down existing wet glass
const WET_SENSE_PX = 52;            // ...felt this far to either side, ~8 mm
const TEXTURE_PX = 7;               // the glass's own stable unevenness
const DRAG_PX = 6;                  // terminal speed rises with mass^0.4
const PIN_HYSTERESIS = 0.55;        // a moving drop stops less easily than it starts
// A drop running down a mirror leaves a thin wet streak and reaches the bottom.
// Bleeding much into the trail is what makes a drop stall after a few
// millimetres — and worse, the water it drops re-beads behind it, so one wipe
// turns into an endless procession of new drops.
const TRAIL_RATE = 0.045;           // residual water per cell of travel, scaled by radius
const TRAIL_MAX_SHARE = 0.008;      // ...and never more than this much of the head per cell
const COLLECT_RATE = 3.4;           // how fast a head drains the film it sits on
// Water must actually be put back on a used track before it can bead there
// again — this many times the film thickness that beads on fresh glass. The
// residual film a flow leaves is nowhere near that deep.
const TRACK_REBEAD = 3.5;
const TRAIL_WET_MIN = 0.42;         // wetness a barely-moving drop leaves behind

export function radiusForMass(mass) {
  return Math.sqrt(Math.max(0, mass) / (Math.PI * HEIGHT));
}

export class FlowSystem {
  constructor(surface) {
    this.surface = surface;
    this.setScale(3);
    this.heads = [];
    this.nextId = 1;
    this.parent = [0];          // union-find over flow-body ids
    this.scanCursor = 0;
    this.merges = 0;
    this.liveRoots = new Set();
  }

  /**
   * Fix the physical scale. Everything that has a real size is derived here, so
   * a drop is the same few millimetres across on a phone and on a tablet even
   * though a simulation cell is nearly twice as long on one of them.
   */
  setScale(cellPx) {
    const px = Math.max(0.5, cellPx);
    this.cellPx = px;
    const massFor = (radiusPx) => Math.PI * HEIGHT * (radiusPx / px) ** 2;
    this.maxMass = massFor(MAX_RADIUS_PX);
    this.nucleateMass = massFor(NUCLEATE_RADIUS_PX);
    this.minMass = massFor(MIN_RADIUS_PX);
    this.collectMax = COLLECT_MAX_PX / px;
    // Drive grows with mass, resistance with the contact radius, so the size at
    // which a drop breaks away falls out of this one number.
    this.pinBase = Math.PI * HEIGHT * DEPIN_RADIUS_PX / px;
    this.acc = ACC_PX / px;
    this.attract = ATTRACT_PX / px;
    this.steer = STEER_PX / px;
    this.wetSense = WET_SENSE_PX / px;
    this.texture = TEXTURE_PX / px;
    this.drag = DRAG_PX / Math.sqrt(px);
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
    this.liveRoots.clear();
    for (const h of this.heads) this.liveRoots.add(this.find(h.id));
    this._nucleate(gravity);
    this._attract(dt);
    for (const head of this.heads) this._step(head, dt, gravity);
    this._mergeHeads();
    this.heads = this.heads.filter((h) => {
      if (h.mass >= this.minMass) return true;
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
      // Squaring the surface term spreads the gate much further apart across
      // the glass, so beads appear where it happens to favour them instead of
      // at even intervals along a stroke, which reads as a comb.
      const het = s.heterogeneity[i];
      const gate = s.beadFilm * het * het * het;
      if (water[i] < gate) continue;
      if (wet[i] < 0.08 && water[i] < 0.8 * s.beadFilm) continue;
      // Water lying in a trail belongs to that flow, not to a rival bead.
      // Once the flow has gone the track is drained glass carrying a bound
      // residual film, so it still cannot bead: only water actively put back
      // there — a fresh wipe, or a flow arriving from above — can start a new
      // drop. Without this the same column sheds one drop after another for
      // as long as the water lasts, which is what a mirror never does.
      const owner = s.flowId[i];
      if (owner > 0) {
        if (this.liveRoots.has(this.find(owner))) continue;
        if (water[i] < TRACK_REBEAD * s.beadFilm * het) continue;
      }

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
        const rr = radiusForMass(head.mass) * 3 + 6;
        if ((head.x - x) ** 2 + (head.y - y) ** 2 < rr * rr) { taken = true; break; }
      }
      if (taken) continue;

      // A bead's mass comes out of the patch of film it clears, so a thinner
      // film has to dewet over a wider patch to make the same bead. A fixed
      // radius means that below some thickness no bead can form at all, however
      // much water is lying about — the starvation trap of §5a, at birth this
      // time instead of at growth. So the radius is solved for: just wide
      // enough to supply one, and no wider, because draining further than that
      // eats the catchment the newborn needs in order to grow and move.
      const share = 0.85;
      const h = Math.max(1e-4, water[y * cols + x]);
      const rDrain = Math.min(7, Math.max(2, Math.sqrt(3 * this.nucleateMass / (Math.PI * h * share))));
      const mass = this._drain(x, y, rDrain, share);
      if (mass < this.nucleateMass) {
        s._deposit(x, y, rDrain, mass);   // not enough gathered yet: put it back
        continue;
      }
      this.heads.push({
        id: this._newFlowId(),
        x, y,
        mass,
        // A bead that gathered more starts heavier and leaves sooner, so a
        // wiped edge sheds its drops over a while instead of all at once.
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
    const collectRadius = Math.min(this.collectMax, r * (moving ? 1.5 : 1.1) + 2.2);
    const share = Math.min(0.85, COLLECT_RATE * dt * (moving ? 1.4 : 1));
    head.mass += this._drain(head.x, head.y, collectRadius, share, dirX, dirY);
    // Past the size glass can hold, a drop does not keep swelling: it runs and
    // sheds, which is what turns a fat drop into a rivulet.
    if (head.mass > this.maxMass) {
      const excess = head.mass - this.maxMass;
      head.mass = this.maxMass;
      s._deposit(head.x, head.y, Math.max(1.2, r), excess);
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
    const base = this.pinBase * r * het * (1 - 0.55 * wetness);
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
    const acc = this.acc * gravity.plane;
    head.vx += gravity.x * acc * dt;
    head.vy += gravity.y * acc * dt;

    // A rivulet running near a track that is already wet veers into it: wet
    // glass wets further, so that side offers less resistance. This is the only
    // thing that acts at a few millimetres — surface tension certainly does not
    // — and it is why two streams a finger's width apart join instead of
    // running to the bottom side by side. It is sampled at two distances so a
    // head feels both the channel it is in and the neighbouring one. Being a
    // difference, it is exactly zero on even glass, so water still falls
    // straight; only a lopsided neighbourhood bends it.
    // Positive means the left-hand side is wetter, and the pull is towards it.
    // The samples sit slightly behind the head, where the contact line is.
    const sense = (reach) => {
      const bx = -reach * dirX * 0.4;
      const by = -reach * dirY * 0.4;
      const lx = -reach * dirY;
      const ly = reach * dirX;
      return wet[s.index(head.x + bx + lx, head.y + by + ly)]
           - wet[s.index(head.x + bx - lx, head.y + by - ly)];
    };
    const steer = (sense(2 + r) + 0.8 * sense(this.wetSense)) * this.steer * gravity.plane;
    head.vx += -dirY * steer * dt;
    head.vy += dirX * steer * dt;
    // stable surface texture nudges the path; no random wandering
    // The surface field varies smoothly over many cells, so this bends a path
    // gently. The per-cell wetness steering above is what used to draw stairs,
    // which is why that one stays weak and this one carries the wander.
    head.vx += (het - 1) * this.texture * dt * -dirY;
    head.vy += (het - 1) * this.texture * dt * dirX;

    // Terminal speed rises with mass^0.4: a full drop runs about half again as
    // fast as one that has only just broken away, which is what you see.
    const drag = this.drag / Math.pow(Math.max(1, head.mass), 0.4);
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
    // A big drop drags a broad, obviously wet streak; a small one leaves a
    // barely-there thread. Both used to come out identical, because the width
    // was radius-derived and a real drop is only a cell or two across, so the
    // anti-staircase floor won every time. The floor still sets the geometry —
    // a trail thinner than about two cells draws as a staircase — so the
    // difference a viewer actually reads has to be carried by how wet the
    // track is left, which is what the optics turn into a film.
    const load = Math.min(1, head.mass / this.maxMass);
    const width = Math.max(1.2, r * 0.95 * (0.7 + 0.6 * load));
    const strength = TRAIL_WET_MIN + (1 - TRAIL_WET_MIN) * load;
    const steps = Math.max(1, Math.ceil(dist));
    const perStep = TRAIL_RATE * width * (dist / steps);
    let swept = 0;

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
          wet[i] = Math.min(1, Math.max(wet[i], strength * (1 - 0.3 * d)));
          // The condensation the drop runs through is swept into it. This is
          // why a run leaves a clear track behind it, why it grows and speeds
          // up as it goes, and why runs are longer the foggier the glass is.
          // Without it a head can only live off water already lying about, so
          // at an honest film budget nothing would ever run far — which is not
          // what a steamed mirror does.
          const before = fog[i];
          fog[i] *= 1 - 0.34 * strength * (1 - 0.55 * d);
          swept += before - fog[i];
          const owner = flowId[i];
          if (owner > 0 && this.find(owner) !== root) { this.union(root, owner); this.merges += 1; }
          flowId[i] = root;
        }
      }
    }
    head.mass += swept * s.fogYield;
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
        // Short range on purpose. A long reach drags a new drop sideways the
        // moment it forms, which is both unphysical and the thing that made
        // every trail start off at an angle. Contact lines bridge when they are
        // nearly touching; until then water falls straight down.
        // Two heads already joined into one body — their trails have touched,
        // so there is a continuous film between them — are not two drops being
        // shy of each other. Water in one channel feels the other, and they
        // close up quickly. This is the case the user sees most: two rivulets
        // a couple of millimetres apart running side by side far too long.
        const bridged = this.find(A.id) === this.find(B.id);
        const reach = bridged ? (ra + rb) * 5 + 15 : (ra + rb) * 2.6 + 5;
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.001 || d > reach) continue;
        dx /= d;
        dy /= d;
        // Closer pairs pull harder, and the lighter one moves further.
        const pull = this.attract * (bridged ? 2 : 1) * (1 - d / reach) * dt;
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
        // Contact lines bridge before the drawn circles overlap, so drops
        // coalesce a little before they visibly touch.
        const touching = d < (ra + rb) * (this.find(A.id) === this.find(B.id) ? 3.2 : 1.6);
        // a dominant collector reaches further than it touches
        const big = A.mass > B.mass * 1.6 ? A : B.mass > A.mass * 1.6 ? B : null;
        const captures = big && d < radiusForMass(big.mass) * 3.4 + 5;
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
