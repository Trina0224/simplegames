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
      const radius = Math.min(0.0020, 0.00034 + Math.sqrt(mass) * 0.0034);
      this.add({
        x, y, radius,
        vx: impulse.x * (0.045 + Math.random() * 0.075),
        vy: impulse.y * (0.045 + Math.random() * 0.075),
      });
    }
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({
      x: d.x, y: d.y,
      radius: Math.max(0.00028, d.radius),
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

      const wanted = (0.00010 + d.radius * 0.022) * dt;
      const absorbed = this.field.consumeWater(d.x, d.y, Math.max(0.0035, d.radius * 2.0), wanted);
      if (absorbed > 0) {
        const area = d.radius * d.radius + absorbed * 0.000014;
        d.radius = Math.min(0.0055, Math.sqrt(area));
      }

      const releaseRadius = Math.max(0.00155, 0.00275 - wet * 0.00080);
      if (d.radius >= releaseRadius && gravity.plane > 0.12) d.pinned = false;
      if (Math.hypot(d.vx, d.vy) > 0.018) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 1.7 + d.wobble) * 0.0018 * (1 - Math.min(1, wet));
        const sizeFactor = Math.min(1, Math.max(0.15, (d.radius - 0.0014) / 0.0032));
        d.vx += (gravity.x * 0.045 * gravity.plane * sizeFactor + jitter) * dt;
        d.vy += gravity.y * 0.045 * gravity.plane * sizeFactor * dt;
        const drag = Math.exp(-dt * (6.4 - Math.min(2.2, wet * 1.6)));
        d.vx *= drag;
        d.vy *= drag;

        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.014 + d.radius * 3.5;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.00005) {
          this.field.depositTrail(d.x, d.y, Math.min(0.16, 0.016 + d.radius * 13), Math.max(0.0022, d.radius * 0.72));
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.03 && d.x < 1.03 && d.y > -0.03 && d.y < 1.03 && d.radius > 0.00024);
  }

  _nucleate() {
    if (this.drops.length >= this.maxDrops) return;
    for (let k = 0; k < 18; k++) {
      const x = Math.random(), y = Math.random();
      const wet = this.field.sampleWet(x, y);
      const water = this.field.sampleWater(x, y);
      // Wiped edges can now nucleate tiny beads after a few passes, but untouched
      // fog remains below this threshold and therefore does not rain by itself.
      if (water < 0.0065) continue;
      if (water + wet * 0.045 < 0.010 + Math.random() * 0.020) continue;
      const mass = this.field.consumeWater(x, y, 0.007, 0.0055);
      if (mass < 0.0017) continue;
      this.add({ x, y, radius: 0.00030 + Math.sqrt(mass) * 0.0030 });
    }
  }

  _merge() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 5) {
      changed = false;
      for (let i = 0; i < this.drops.length; i++) {
        const a = this.drops[i];
        for (let j = i + 1; j < this.drops.length; j++) {
          const b = this.drops[j];
          const rr = (a.radius + b.radius) * 1.15;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > rr * rr) continue;

          const aa = a.radius * a.radius;
          const ab = b.radius * b.radius;
          const total = aa + ab;
          a.x = (a.x * aa + b.x * ab) / total;
          a.y = (a.y * aa + b.y * ab) / total;
          a.vx = (a.vx * aa + b.vx * ab) / total;
          a.vy = (a.vy * aa + b.vy * ab) / total;
          a.radius = Math.min(0.0060, Math.sqrt(total));
          a.pinned = a.radius < 0.00235 && a.pinned && b.pinned;
          this.drops.splice(j, 1);
          j--;
          changed = true;
        }
      }
    }
  }
}
