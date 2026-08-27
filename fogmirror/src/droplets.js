export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 120;
  }

  nucleateAt(u, v, strength = 1, impulse = { x: 0, y: 0 }) {
    if (this.drops.length >= this.maxDrops) return;

    const requested = 0.012 + strength * 0.022;
    const mass = this.field.consumeWater(u, v, 0.020 + strength * 0.007, requested);
    if (mass < 0.0020) return;

    // A wiped patch should normally feed one dominant collector, not make a row
    // of independent beads. Prefer the largest existing bead in this local basin.
    const nearby = this._dominantNear(u, v, 0.060);
    if (nearby) {
      const area = nearby.radius * nearby.radius + mass * 0.000052;
      nearby.radius = Math.min(0.0105, Math.sqrt(area));
      nearby.vx += impulse.x * 0.010;
      nearby.vy += impulse.y * 0.010;
      if (nearby.radius > 0.00145) nearby.pinned = false;
      return;
    }

    const radius = Math.min(0.0024, 0.00052 + Math.sqrt(mass) * 0.0050);
    this.add({
      x: u, y: v, radius,
      vx: impulse.x * 0.018,
      vy: impulse.y * 0.018,
    });
  }

  seed(u, v, amount = 1, spread = 0.02, impulse = { x: 0, y: 0 }) {
    this.nucleateAt(u, v, Math.min(1.7, 0.85 + amount * 0.7), impulse);
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({
      x: d.x, y: d.y,
      radius: Math.max(0.00030, d.radius),
      vx: d.vx || 0, vy: d.vy || 0,
      pinned: d.pinned !== false,
      age: 0,
      wobble: Math.random() * 10,
    });
  }

  update(dt, gravity) {
    dt = Math.min(0.033, Math.max(0, dt));

    this._attractDrops(dt);

    for (const d of this.drops) {
      d.age += dt;
      const wet = this.field.sampleWet(d.x, d.y);
      const moving = !d.pinned || Math.hypot(d.vx, d.vy) > 0.0015;

      // A formed bead pulls thin film toward itself through capillary action. A
      // moving bead sweeps a larger catchment, so it grows noticeably as it falls.
      const catchRadius = Math.max(0.012, d.radius * (moving ? 7.0 : 5.0));
      const wanted = ((moving ? 0.010 : 0.0055) + d.radius * (moving ? 0.16 : 0.08)) * dt;
      const absorbed = this.field.consumeWater(d.x, d.y, catchRadius, wanted);
      if (absorbed > 0) {
        const area = d.radius * d.radius + absorbed * 0.000060;
        d.radius = Math.min(0.0115, Math.sqrt(area));
      }

      const releaseRadius = Math.max(0.00115, 0.00165 - wet * 0.00038);
      if (d.radius >= releaseRadius && gravity.plane > 0.08) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 1.35 + d.wobble) * 0.00065 * (1 - Math.min(1, wet));
        // As volume grows, gravity increasingly wins over contact-line resistance.
        const sizeFactor = Math.min(3.0, Math.max(0.40, d.radius / 0.0019));
        d.vx += (gravity.x * 0.031 * gravity.plane * sizeFactor + jitter) * dt;
        d.vy += gravity.y * 0.031 * gravity.plane * sizeFactor * dt;

        const drag = Math.exp(-dt * (6.8 - Math.min(2.7, wet * 2.0)));
        d.vx *= drag;
        d.vy *= drag;
        const speed = Math.hypot(d.vx, d.vy);
        // Small drops creep; a drop that has swallowed substantial water is
        // allowed to become visibly faster, matching a real descending rivulet.
        const cap = 0.008 + d.radius * 12.0;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.000035) {
          this.field.depositTrail(
            d.x, d.y,
            Math.min(0.23, 0.018 + d.radius * 18),
            Math.max(0.0020, d.radius * 0.62),
          );
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.radius > 0.00024);
  }

  _dominantNear(x, y, radius) {
    let best = null;
    let bestScore = -Infinity;
    const r2 = radius * radius;
    for (const d of this.drops) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd > r2) continue;
      // Strongly prefer size, mildly prefer closeness.
      const score = d.radius * 12 - Math.sqrt(dd);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  _attractDrops(dt) {
    // Thin wet films connect nearby beads. Within a local basin, the smaller bead
    // creeps toward the larger one until surface tension can merge them. This is
    // intentionally stronger than the previous near-contact-only rule so several
    // tiny beads become one main drop instead of parallel rivulets.
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const range = Math.min(0.060, 0.018 + (a.radius + b.radius) * 7.5);
        if (dist >= range) continue;

        const aa = a.radius * a.radius, bb = b.radius * b.radius;
        const larger = aa >= bb ? a : b;
        const smaller = aa >= bb ? b : a;
        const sx = larger.x - smaller.x, sy = larger.y - smaller.y;
        const sd = Math.hypot(sx, sy) || 1e-6;
        const strength = (1 - dist / range);
        // Capillary motion is slow at long range and becomes decisive close up.
        const pull = (0.010 + strength * 0.050) * strength * dt;
        smaller.x += sx / sd * pull;
        smaller.y += sy / sd * pull;
        smaller.vx += sx / sd * pull * 0.6;
        smaller.vy += sy / sd * pull * 0.6;
      }
    }
  }

  _merge() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 8) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        const a = this.drops[i];
        for (let j = i + 1; j < this.drops.length; j++) {
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.85;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;

          const aa = a.radius * a.radius;
          const bb = b.radius * b.radius;
          const total = aa + bb;
          a.x = (a.x * aa + b.x * bb) / total;
          a.y = (a.y * aa + b.y * bb) / total;
          a.vx = (a.vx * aa + b.vx * bb) / total;
          a.vy = (a.vy * aa + b.vy * bb) / total;
          a.radius = Math.min(0.0120, Math.sqrt(total));
          a.pinned = a.radius < 0.00135 && a.pinned && b.pinned;
          this.drops.splice(j, 1);
          j--;
          changed = true;
        }
      }
    }
  }
}
