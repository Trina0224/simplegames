export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 180;
  }

  // Create one or a few candidate beads only where the finger actually moved water.
  // This never sprays random droplets across the mirror.
  nucleateAt(u, v, strength = 1, impulse = { x: 0, y: 0 }) {
    if (this.drops.length >= this.maxDrops) return;

    const requested = 0.010 + strength * 0.018;
    const mass = this.field.consumeWater(u, v, 0.016 + strength * 0.006, requested);
    if (mass < 0.0022) return;

    const nearby = this._nearest(u, v, 0.030);
    if (nearby) {
      // Prefer feeding an existing bead over creating another one. This is the
      // capillary/coalescing behaviour that makes a wiped edge collect into one
      // or a few drops rather than hundreds of dots.
      const area = nearby.radius * nearby.radius + mass * 0.000035;
      nearby.radius = Math.min(0.0075, Math.sqrt(area));
      nearby.vx += impulse.x * 0.018;
      nearby.vy += impulse.y * 0.018;
      if (nearby.radius > 0.00165) nearby.pinned = false;
      return;
    }

    const radius = Math.min(0.0021, 0.00048 + Math.sqrt(mass) * 0.0045);
    this.add({
      x: u,
      y: v,
      radius,
      vx: impulse.x * 0.025,
      vy: impulse.y * 0.025,
    });
  }

  // Kept for the broad-swipe API: it now produces only a couple of edge pools.
  seed(u, v, amount = 1, spread = 0.02, impulse = { x: 0, y: 0 }) {
    const count = amount > 0.9 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = i === 0 ? 0 : Math.random() * spread * 0.45;
      this.nucleateAt(
        Math.max(0, Math.min(1, u + Math.cos(a) * rr)),
        Math.max(0, Math.min(1, v + Math.sin(a) * rr)),
        Math.min(1.5, 0.75 + amount * 0.6),
        impulse,
      );
    }
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

      // Once a bead exists, surface tension makes it a collector for the nearby
      // thin film. Moving beads collect from a wider catchment and therefore grow
      // faster as they travel.
      const moving = !d.pinned || Math.hypot(d.vx, d.vy) > 0.002;
      const catchRadius = Math.max(0.008, d.radius * (moving ? 5.0 : 3.5));
      const wanted = (moving ? 0.0048 : 0.0028) * dt + d.radius * (moving ? 0.020 : 0.010) * dt;
      const absorbed = this.field.consumeWater(d.x, d.y, catchRadius, wanted);
      if (absorbed > 0) {
        const area = d.radius * d.radius + absorbed * 0.000038;
        d.radius = Math.min(0.0080, Math.sqrt(area));
      }

      // Very small beads can sit. Once they have collected enough water they depin.
      // Wet trails lower the threshold further.
      const releaseRadius = Math.max(0.00125, 0.00185 - wet * 0.00045);
      if (d.radius >= releaseRadius && gravity.plane > 0.10) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 1.5 + d.wobble) * 0.0011 * (1 - Math.min(1, wet));
        const sizeFactor = Math.min(1.75, Math.max(0.35, d.radius / 0.0022));
        d.vx += (gravity.x * 0.036 * gravity.plane * sizeFactor + jitter) * dt;
        d.vy += gravity.y * 0.036 * gravity.plane * sizeFactor * dt;

        // Bigger drops move faster because gravity grows faster than the contact
        // perimeter resisting them. Wet trails reduce drag modestly.
        const drag = Math.exp(-dt * (7.0 - Math.min(2.4, wet * 1.8)));
        d.vx *= drag;
        d.vy *= drag;
        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.010 + d.radius * 7.5;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.00004) {
          this.field.depositTrail(
            d.x,
            d.y,
            Math.min(0.20, 0.016 + d.radius * 16),
            Math.max(0.0020, d.radius * 0.65),
          );
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.radius > 0.00024);
  }

  _nearest(x, y, radius) {
    let best = null;
    let bestD2 = radius * radius;
    for (const d of this.drops) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD2) { bestD2 = dd; best = d; }
    }
    return best;
  }

  _attractDrops(dt) {
    // A coarse capillary attraction: nearby beads drift toward the larger one.
    // This is deliberately short range; it should look like coalescence, not magnets.
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const range = Math.min(0.028, (a.radius + b.radius) * 5.5 + 0.004);
        if (dist >= range) continue;
        const pull = (1 - dist / range) * 0.018 * dt;
        const ux = dx / dist, uy = dy / dist;
        const aa = a.radius * a.radius, bb = b.radius * b.radius;
        if (aa >= bb) {
          b.x -= ux * pull;
          b.y -= uy * pull;
        } else {
          a.x += ux * pull;
          a.y += uy * pull;
        }
      }
    }
  }

  _merge() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        const a = this.drops[i];
        for (let j = i + 1; j < this.drops.length; j++) {
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.55;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;

          const aa = a.radius * a.radius;
          const bb = b.radius * b.radius;
          const total = aa + bb;
          a.x = (a.x * aa + b.x * bb) / total;
          a.y = (a.y * aa + b.y * bb) / total;
          a.vx = (a.vx * aa + b.vx * bb) / total;
          a.vy = (a.vy * aa + b.vy * bb) / total;
          a.radius = Math.min(0.0085, Math.sqrt(total));
          a.pinned = a.radius < 0.00155 && a.pinned && b.pinned;
          this.drops.splice(j, 1);
          j--;
          changed = true;
        }
      }
    }
  }
}
