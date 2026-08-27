export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];               // active flow heads; renderer still consumes this array
    this.maxDrops = 48;
    this.nextId = 1;
    this.flowId = new Int32Array(field.w * field.h);
    this.pendingBodyMerges = [];
  }

  nucleateAt(u, v, strength = 1, impulse = { x: 0, y: 0 }) {
    if (this.drops.length >= this.maxDrops) return;

    // Finger-created water belongs to a local basin. Feed an existing collector
    // before creating another flow head.
    const nearby = this._dominantNear(u, v, 0.070);
    const requested = 0.014 + strength * 0.026;
    const mass = this.field.consumeWater(u, v, 0.020 + strength * 0.008, requested);
    if (mass < 0.0018) return;

    if (nearby) {
      nearby.mass += mass;
      nearby.vx += impulse.x * 0.010;
      nearby.vy += impulse.y * 0.010;
      nearby.justMerged = Math.max(nearby.justMerged, 0.22);
      this._syncRadius(nearby);
      return;
    }

    this.add({
      x: u,
      y: v,
      mass,
      vx: impulse.x * 0.014,
      vy: impulse.y * 0.014,
      pinned: true,
    });
  }

  seed(u, v, amount = 1, spread = 0.02, impulse = { x: 0, y: 0 }) {
    this.nucleateAt(u, v, Math.min(1.7, 0.85 + amount * 0.7), impulse);
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) {
      const smallest = this.drops.reduce((best, x) => (!best || x.mass < best.mass ? x : best), null);
      if (smallest) this.drops.splice(this.drops.indexOf(smallest), 1);
    }
    const drop = {
      id: this.nextId++,
      x: d.x,
      y: d.y,
      mass: Math.max(0.0016, d.mass || 0.0022),
      radius: 0,
      vx: d.vx || 0,
      vy: d.vy || 0,
      pinned: d.pinned !== false,
      age: 0,
      justMerged: 0,
      lastX: d.x,
      lastY: d.y,
      trailWidth: 0.002,
      wobble: Math.random() * 17,
    };
    this._syncRadius(drop);
    this.drops.push(drop);
    this._stampBody(drop, drop.x, drop.y, Math.max(0.0022, drop.radius * 0.85));
  }

  update(dt, gravity) {
    dt = Math.min(0.033, Math.max(0, dt));
    this.pendingBodyMerges.length = 0;

    for (const d of this.drops) {
      d.age += dt;
      d.justMerged = Math.max(0, d.justMerged - dt);

      const wet = this.field.sampleWet(d.x, d.y);
      const moving = !d.pinned || Math.hypot(d.vx, d.vy) > 0.0012;

      // A flow head is the collector at the front of a connected water body. It
      // sweeps a much larger catchment than its visible optical radius.
      const catchRadius = Math.min(0.030, Math.max(0.010, d.radius * (moving ? 6.5 : 4.0)));
      const collectRate = moving ? 0.020 : 0.008;
      const requested = (collectRate + d.mass * (moving ? 0.16 : 0.07)) * dt;
      const collected = this.field.consumeWater(d.x, d.y, catchRadius, requested);
      if (collected > 0) d.mass += collected;

      this._syncRadius(d);

      // Force-style pinning. Gravity drive scales with mobile mass; resistance
      // scales more like contact perimeter and is reduced on wet / existing trails.
      const drive = gravity.plane * d.mass;
      const perimeter = Math.max(0.55, d.radius / 0.0020);
      const trailFactor = 1 - Math.min(0.58, wet * 0.48);
      const mergeFactor = d.justMerged > 0 ? 0.62 : 1;
      const resistance = 0.0030 * perimeter * trailFactor * mergeFactor;
      if (drive > resistance && gravity.plane > 0.06) d.pinned = false;

      if (!d.pinned) {
        const massFactor = Math.min(3.8, Math.max(0.45, Math.sqrt(d.mass / 0.004)));

        // Follow physical gravity, with only a very small stable meander.
        const meander = Math.sin(d.age * 1.1 + d.wobble) * 0.00035 * (1 - Math.min(1, wet));
        d.vx += (gravity.x * 0.030 * gravity.plane * massFactor + meander) * dt;
        d.vy += gravity.y * 0.030 * gravity.plane * massFactor * dt;

        // Existing wet trails guide the front. Probe perpendicular to gravity and
        // bias slightly toward the wetter side rather than using random jitter.
        this._steerToWetTrail(d, gravity, dt);

        const drag = Math.exp(-dt * (7.4 - Math.min(3.0, wet * 2.2)));
        d.vx *= drag;
        d.vy *= drag;

        // Terminal speed rises strongly with mass: a growing rivulet should visibly
        // accelerate as it sweeps water on the way down.
        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.006 + Math.min(0.12, 0.020 * massFactor + d.radius * 5.5);
        if (speed > cap) {
          d.vx *= cap / speed;
          d.vy *= cap / speed;
        }

        const ox = d.x;
        const oy = d.y;
        d.lastX = ox;
        d.lastY = oy;
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.000025) {
          // Leave only a fraction of the mobile mass as residual film. The trail is
          // connected simulation state, not just a painted line.
          const residual = Math.min(d.mass * 0.010, 0.00050 + d.radius * 0.010);
          d.mass = Math.max(0.0014, d.mass - residual * dt * 8);
          const trailAmount = Math.min(0.24, 0.016 + d.radius * 18);
          const trailRadius = Math.max(0.0017, d.radius * 0.56);
          d.trailWidth = trailRadius;
          this._depositSegment(d, ox, oy, d.x, d.y, trailAmount, trailRadius);
          this._syncRadius(d);
        }
      } else {
        // Even a pinned bead owns a small body region so touching flows can merge.
        this._stampBody(d, d.x, d.y, Math.max(0.0020, d.radius * 0.72));
      }
    }

    this._mergeHeadContacts();
    this._mergeBodyContacts();
    this._collapseLocalBasins();

    this.drops = this.drops.filter(d =>
      d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.mass > 0.0012
    );
  }

  _syncRadius(d) {
    // Perceptual mapping only. Mass is authoritative; radius cannot grow on its own.
    d.radius = Math.min(0.0115, 0.00042 + Math.sqrt(Math.max(0, d.mass)) * 0.022);
  }

  _dominantNear(x, y, radius) {
    let best = null;
    let bestScore = -Infinity;
    const r2 = radius * radius;
    for (const d of this.drops) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd > r2) continue;
      const score = d.mass * 3.0 - Math.sqrt(dd) * 0.30;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  _steerToWetTrail(d, gravity, dt) {
    if (gravity.plane < 0.05) return;
    const px = -gravity.y;
    const py = gravity.x;
    const probe = Math.max(0.005, d.radius * 2.4);
    const wl = this.field.sampleWet(d.x + px * probe, d.y + py * probe);
    const wr = this.field.sampleWet(d.x - px * probe, d.y - py * probe);
    const bias = Math.max(-1, Math.min(1, wl - wr));
    d.vx += px * bias * 0.0045 * dt;
    d.vy += py * bias * 0.0045 * dt;
  }

  _depositSegment(d, x0, y0, x1, y1, amount, radius) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / Math.max(0.0018, radius * 0.7)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.field.depositTrail(x, y, amount, radius);
      this._stampBody(d, x, y, radius * 1.25);
    }
  }

  _stampBody(drop, u, v, radius) {
    const cx = u * this.field.w;
    const cy = v * this.field.h;
    const rx = Math.max(1, radius * this.field.w);
    const ry = Math.max(1, radius * this.field.h);
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.field.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.field.h - 1, Math.ceil(cy + ry));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const i = y * this.field.w + x;
        const other = this.flowId[i];
        if (other && other !== drop.id) this.pendingBodyMerges.push([drop.id, other]);
        this.flowId[i] = drop.id;
      }
    }
  }

  _mergeHeadContacts() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        for (let j = i + 1; j < this.drops.length; j++) {
          const a = this.drops[i];
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.45;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;
          this._mergePair(a, b);
          changed = true;
          j--;
        }
      }
    }
  }

  _mergeBodyContacts() {
    if (!this.pendingBodyMerges.length) return;
    const seen = new Set();
    for (const [aId, bId] of this.pendingBodyMerges) {
      const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = this.drops.find(d => d.id === aId);
      const b = this.drops.find(d => d.id === bId);
      if (!a || !b || a === b) continue;
      this._mergePair(a, b);
    }
  }

  _collapseLocalBasins() {
    // Long-range surface-film connection. In a recently wiped basin, smaller heads
    // should eventually feed the dominant one rather than create parallel rivers.
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0.045) continue;
        const wa = this.field.sampleWet(a.x, a.y);
        const wb = this.field.sampleWet(b.x, b.y);
        if (Math.max(wa, wb) < 0.18) continue;

        const larger = a.mass >= b.mass ? a : b;
        const smaller = a.mass >= b.mass ? b : a;
        // If their wet catchments almost touch, collapse into the dominant flow.
        if (dist < 0.018 + larger.radius * 3.0) {
          this._mergePair(larger, smaller);
          j--;
        }
      }
    }
  }

  _mergePair(a, b) {
    if (!a || !b || a === b) return;
    const ai = this.drops.indexOf(a);
    const bi = this.drops.indexOf(b);
    if (ai < 0 || bi < 0) return;

    // Preserve combined mass and momentum. Keep the larger / more downstream head
    // as the front so body merges do not jump backward up a trail.
    const survivor = a.mass >= b.mass ? a : b;
    const absorbed = survivor === a ? b : a;
    const total = survivor.mass + absorbed.mass;
    survivor.vx = (survivor.vx * survivor.mass + absorbed.vx * absorbed.mass) / total;
    survivor.vy = (survivor.vy * survivor.mass + absorbed.vy * absorbed.mass) / total;
    survivor.mass = total;
    survivor.justMerged = 0.28;
    survivor.pinned = false;
    this._syncRadius(survivor);

    const absorbedIndex = this.drops.indexOf(absorbed);
    if (absorbedIndex >= 0) this.drops.splice(absorbedIndex, 1);
  }
}
