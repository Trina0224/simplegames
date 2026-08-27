export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 140;
    this.spawnClock = 0;
  }

  seed(u, v, amount = 1, spread = 0.04, impulse = { x: 0, y: 0 }) {
    // A gesture should release a handful of beads, not instantly cover the mirror.
    const count = Math.max(1, Math.min(10, Math.round(amount * 3.2)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.add({
        x: Math.max(0, Math.min(1, u + Math.cos(a) * r)),
        y: Math.max(0, Math.min(1, v + Math.sin(a) * r)),
        radius: 0.0022 + Math.random() * 0.0048 * Math.max(0.55, amount),
        vx: impulse.x * (0.18 + Math.random() * 0.45),
        vy: impulse.y * (0.18 + Math.random() * 0.45),
      });
    }
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({
      x:d.x, y:d.y, radius:d.radius,
      vx:d.vx||0, vy:d.vy||0,
      pinned:true, age:0, wobble:Math.random()*10,
    });
  }

  update(dt, gravity) {
    dt = Math.min(0.035, Math.max(0, dt));
    this.spawnClock += dt;
    // Natural visible nucleation should be occasional. Most large beads should
    // come from wiped/rewet regions, not appear everywhere by themselves.
    if (this.spawnClock > 0.42) {
      this.spawnClock = 0;
      this._nucleate();
    }

    for (const d of this.drops) {
      d.age += dt;
      const wet = this.field.sampleWet(d.x, d.y);
      const water = this.field.sampleWater(d.x, d.y);

      // Grow slowly by collecting surface moisture. Large beads should take time.
      d.radius = Math.min(0.020, d.radius + (water * 0.00015 + wet * 0.000025) * dt * 60);

      const mass = Math.max(0.00001, d.radius * d.radius);
      const drive = gravity.plane * mass * 900;
      // Small beads stay pinned. Wet trails reduce the threshold, but do not turn
      // every speck into a sliding raindrop.
      const pinning = Math.max(0.018, 0.19 - wet * 0.07) * (0.011 / Math.max(0.003, d.radius));
      if (drive > pinning || Math.hypot(d.vx, d.vy) > 0.035) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 2.2 + d.wobble) * 0.009 * (1 - Math.min(1, wet));
        d.vx += (gravity.x * 0.27 * gravity.plane + jitter) * dt;
        d.vy += gravity.y * 0.27 * gravity.plane * dt;
        const drag = Math.exp(-dt * (2.8 - Math.min(1.0, wet)));
        d.vx *= drag;
        d.vy *= drag;
        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.12 + d.radius * 3.0;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.00018) {
          this.field.depositTrail(
            d.x, d.y,
            Math.min(0.38, 0.045 + d.radius * 9),
            Math.max(0.004, d.radius * 0.62),
          );
        }
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.06 && d.x < 1.06 && d.y > -0.06 && d.y < 1.06 && d.radius > 0.0018);
  }

  _nucleate() {
    if (this.drops.length >= this.maxDrops) return;
    // Sample only a few sites. Require genuinely wet glass; untouched initial fog
    // should not continuously manufacture visible macroscopic drops.
    for (let k = 0; k < 3; k++) {
      const x = Math.random(), y = Math.random();
      const wet = this.field.sampleWet(x,y);
      const water = this.field.sampleWater(x,y);
      const score = water + wet * 0.55;
      if (score > 0.52 + Math.random() * 0.32) {
        this.add({ x, y, radius:0.0022 + Math.random() * 0.0032 + water * 0.002 });
      }
    }
  }

  _merge() {
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        const rr = (a.radius + b.radius) * 0.74;
        if ((a.x-b.x)**2 + (a.y-b.y)**2 > rr*rr) continue;
        const va = a.radius*a.radius, vb = b.radius*b.radius, total = va+vb;
        a.x = (a.x*va + b.x*vb)/total;
        a.y = (a.y*va + b.y*vb)/total;
        a.vx = (a.vx*va + b.vx*vb)/total;
        a.vy = (a.vy*va + b.vy*vb)/total;
        a.radius = Math.min(0.022, Math.sqrt(total));
        a.pinned = a.pinned && b.pinned && a.radius < 0.0085;
        this.drops.splice(j,1); j--;
      }
    }
  }
}
