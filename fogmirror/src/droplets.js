export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 420;
    this.spawnClock = 0;
  }

  seed(u, v, amount = 1, spread = 0.025, impulse = { x: 0, y: 0 }) {
    const attempts = Math.max(1, Math.min(14, Math.round(amount * 6)));
    for (let i = 0; i < attempts; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * spread;
      const x = Math.max(0, Math.min(1, u + Math.cos(a) * rr));
      const y = Math.max(0, Math.min(1, v + Math.sin(a) * rr));
      const mass = this.field.consumeWater(x, y, 0.010, 0.004 + amount * 0.003);
      if (mass < 0.0015) continue;
      const radius = Math.min(0.0018, 0.00030 + Math.sqrt(mass) * 0.0031);
      this.add({
        x, y, radius,
        vx: impulse.x * (0.035 + Math.random() * 0.055),
        vy: impulse.y * (0.035 + Math.random() * 0.055),
      });
    }
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({
      x: d.x, y: d.y,
      radius: Math.max(0.00026, d.radius),
      vx: d.vx || 0, vy: d.vy || 0,
      pinned: d.pinned !== false,
      age: 0,
      wobble: Math.random() * 10,
    });
  }

  update(dt, gravity) {
    dt = Math.min(0.033, Math.max(0, dt));
    this.spawnClock += dt;
    if (this.spawnClock > 0.30) {
      this.spawnClock = 0;
      this._nucleate();
    }

    for (const d of this.drops) {
      d.age += dt;
      const wet = this.field.sampleWet(d.x, d.y);

      // Capillary catchment: once a visible bead has formed, surface tension pulls
      // nearby thin film into it. Young/pinned drops grow noticeably for the first
      // second or two instead of remaining a static pin-prick.
      const catchRadius = Math.max(0.0065, d.radius * (d.pinned ? 5.5 : 4.0));
      const capillaryRate = d.pinned
        ? (0.0040 + wet * 0.0045)
        : (0.0025 + wet * 0.0030);
      const wanted = capillaryRate * dt;
      const absorbed = this.field.consumeWater(d.x, d.y, catchRadius, wanted);
      if (absorbed > 0) {
        // Perceived droplet area grows from conserved liquid. The constant maps the
        // low-resolution field's arbitrary mass units into screen-space bead size.
        const area = d.radius * d.radius + absorbed * 0.00022;
        d.radius = Math.min(0.0048, Math.sqrt(area));
      }

      // A small but genuinely formed bead should eventually creep. Wet glass lowers
      // the contact-angle pinning threshold, so a drop on a freshly wiped path can
      // release at roughly pixel-scale size instead of waiting to become huge.
      const releaseRadius = Math.max(0.00078, 0.00125 - wet * 0.00038);
      if (d.radius >= releaseRadius && gravity.plane > 0.10) d.pinned = false;
      if (Math.hypot(d.vx, d.vy) > 0.012) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 1.7 + d.wobble) * 0.0013 * (1 - Math.min(1, wet));
        const sizeFactor = Math.min(1, Math.max(0.22, (d.radius - 0.00065) / 0.0024));
        d.vx += (gravity.x * 0.031 * gravity.plane * sizeFactor + jitter) * dt;
        d.vy += gravity.y * 0.031 * gravity.plane * sizeFactor * dt;
        const drag = Math.exp(-dt * (7.4 - Math.min(2.4, wet * 1.8)));
        d.vx *= drag;
        d.vy *= drag;

        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.009 + d.radius * 2.3;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        // A moving drop sweeps up the thin film it crosses. This both conserves mass
        // and creates the familiar behaviour where a descending bead gets larger.
        const swept = this.field.consumeWater(
          d.x, d.y,
          Math.max(0.006, d.radius * 3.2),
          (0.0032 + d.radius * 0.35) * dt,
        );
        if (swept > 0) {
          d.radius = Math.min(0.0052, Math.sqrt(d.radius * d.radius + swept * 0.00024));
        }

        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.000035) {
          this.field.depositTrail(
            d.x, d.y,
            Math.min(0.13, 0.012 + d.radius * 12),
            Math.max(0.0016, d.radius * 0.72),
          );
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.radius > 0.00022);
  }

  _nucleate() {
    if (this.drops.length >= this.maxDrops) return;
    for (let k = 0; k < 18; k++) {
      const x = Math.random(), y = Math.random();
      const wet = this.field.sampleWet(x, y);
      const water = this.field.sampleWater(x, y);
      if (water < 0.0065) continue;
      if (water + wet * 0.045 < 0.010 + Math.random() * 0.020) continue;
      const mass = this.field.consumeWater(x, y, 0.007, 0.0055);
      if (mass < 0.0017) continue;
      this.add({ x, y, radius: 0.00028 + Math.sqrt(mass) * 0.0028 });
    }
  }

  _merge() {
    // Surface tension pulls nearly touching beads together. The threshold is slightly
    // wider than pure geometric contact so a dense patch behaves cohesively instead
    // of as independent dots.
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        const a = this.drops[i];
        for (let j = i + 1; j < this.drops.length; j++) {
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.38;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;

          const aa = a.radius * a.radius;
          const ab = b.radius * b.radius;
          const total = aa + ab;
          a.x = (a.x * aa + b.x * ab) / total;
          a.y = (a.y * aa + b.y * ab) / total;
          a.vx = (a.vx * aa + b.vx * ab) / total;
          a.vy = (a.vy * aa + b.vy * ab) / total;
          a.radius = Math.min(0.0054, Math.sqrt(total));
          a.pinned = a.radius < 0.00105 && a.pinned && b.pinned;
          this.drops.splice(j, 1);
          j--;
          changed = true;
        }
      }
    }
  }
}
