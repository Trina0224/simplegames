export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 420;
    this.spawnClock = 0;
  }

  // A seed request does not invent water. It merely offers candidate sites; each
  // visible bead must be funded by liquid removed from the field.
  seed(u, v, amount = 1, spread = 0.025, impulse = { x: 0, y: 0 }) {
    const attempts = Math.max(1, Math.min(14, Math.round(amount * 6)));
    for (let i = 0; i < attempts; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * spread;
      const x = Math.max(0, Math.min(1, u + Math.cos(a) * rr));
      const y = Math.max(0, Math.min(1, v + Math.sin(a) * rr));
      const mass = this.field.consumeWater(x, y, 0.010, 0.006 + amount * 0.004);
      if (mass < 0.0045) continue;
      // Radius is deliberately tiny. A visible macroscopic bead represents a very
      // large number of microdroplets having already coalesced.
      const radius = Math.min(0.0022, 0.00045 + Math.sqrt(mass) * 0.0040);
      this.add({
        x, y, radius,
        vx: impulse.x * (0.06 + Math.random() * 0.10),
        vy: impulse.y * (0.06 + Math.random() * 0.10),
      });
    }
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({
      x: d.x, y: d.y,
      radius: Math.max(0.00035, d.radius),
      vx: d.vx || 0, vy: d.vy || 0,
      pinned: d.pinned !== false,
      age: 0,
      wobble: Math.random() * 10,
    });
  }

  update(dt, gravity) {
    dt = Math.min(0.033, Math.max(0, dt));
    this.spawnClock += dt;
    if (this.spawnClock > 0.45) {
      this.spawnClock = 0;
      this._nucleate();
    }

    for (const d of this.drops) {
      d.age += dt;
      const wet = this.field.sampleWet(d.x, d.y);

      // Slow absorption: a drop can only grow by actually consuming nearby liquid.
      const wanted = (0.00012 + d.radius * 0.03) * dt;
      const absorbed = this.field.consumeWater(d.x, d.y, Math.max(0.004, d.radius * 2.2), wanted);
      if (absorbed > 0) {
        const area = d.radius * d.radius + absorbed * 0.000016;
        d.radius = Math.min(0.0060, Math.sqrt(area));
      }

      // Surface tension dominates at small scale. Small drops remain pinned even on
      // a vertical mirror; progressively larger ones eventually overcome adhesion.
      const releaseRadius = Math.max(0.0017, 0.0030 - wet * 0.0009);
      if (d.radius >= releaseRadius && gravity.plane > 0.12) d.pinned = false;
      if (Math.hypot(d.vx, d.vy) > 0.020) d.pinned = false;

      if (!d.pinned) {
        // Sliding is intentionally slow. Wet old trails reduce drag a little and
        // guide the drop; they do not turn the mirror into frictionless glass.
        const jitter = Math.sin(d.age * 1.7 + d.wobble) * 0.0025 * (1 - Math.min(1, wet));
        const sizeFactor = Math.min(1, Math.max(0.18, (d.radius - 0.0015) / 0.0035));
        d.vx += (gravity.x * 0.055 * gravity.plane * sizeFactor + jitter) * dt;
        d.vy += gravity.y * 0.055 * gravity.plane * sizeFactor * dt;
        const drag = Math.exp(-dt * (5.8 - Math.min(2.0, wet * 1.5)));
        d.vx *= drag;
        d.vy *= drag;

        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.018 + d.radius * 4.2;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.00006) {
          this.field.depositTrail(d.x, d.y, Math.min(0.18, 0.018 + d.radius * 14), Math.max(0.0025, d.radius * 0.75));
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.radius > 0.00028);
  }

  _nucleate() {
    if (this.drops.length >= this.maxDrops) return;
    // Sparse candidate sampling. A candidate only becomes visible after a genuinely
    // wet local patch has accumulated enough free liquid.
    for (let k = 0; k < 12; k++) {
      const x = Math.random(), y = Math.random();
      const wet = this.field.sampleWet(x, y);
      const water = this.field.sampleWater(x, y);
      if (water < 0.020) continue;
      if (water + wet * 0.06 < 0.025 + Math.random() * 0.035) continue;
      const mass = this.field.consumeWater(x, y, 0.008, 0.010);
      if (mass < 0.0055) continue;
      this.add({ x, y, radius: 0.00045 + Math.sqrt(mass) * 0.0033 });
    }
  }

  _merge() {
    // Surface tension makes touching droplets coalesce readily. Use a near-contact
    // threshold and repeat until no more merges occur so a moving drop can sweep up
    // a chain of tiny beads in one pass.
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 4) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        const a = this.drops[i];
        for (let j = i + 1; j < this.drops.length; j++) {
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.08;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;

          const aa = a.radius * a.radius;
          const ab = b.radius * b.radius;
          const total = aa + ab;
          a.x = (a.x * aa + b.x * ab) / total;
          a.y = (a.y * aa + b.y * ab) / total;
          a.vx = (a.vx * aa + b.vx * ab) / total;
          a.vy = (a.vy * aa + b.vy * ab) / total;
          a.radius = Math.min(0.0065, Math.sqrt(total));
          // Merging releases surface energy; sufficiently large merged drops are
          // more likely to depin and start moving.
          a.pinned = a.radius < 0.0026 && a.pinned && b.pinned;
          this.drops.splice(j, 1);
          j--;
          changed = true;
        }
      }
    }
  }
}
