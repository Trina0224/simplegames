export class DropletSystem {
  constructor(field) {
    this.field = field;
    this.drops = [];
    this.maxDrops = 180;
    this.spawnClock = 0;
  }

  seed(u, v, amount = 1, spread = 0.04, impulse = { x: 0, y: 0 }) {
    const count = Math.max(1, Math.min(18, Math.round(amount * 7)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.add({
        x: Math.max(0, Math.min(1, u + Math.cos(a) * r)),
        y: Math.max(0, Math.min(1, v + Math.sin(a) * r)),
        radius: 0.004 + Math.random() * 0.009 * Math.max(0.5, amount),
        vx: impulse.x * (0.25 + Math.random() * 0.7),
        vy: impulse.y * (0.25 + Math.random() * 0.7),
      });
    }
  }

  add(d) {
    if (this.drops.length >= this.maxDrops) this.drops.shift();
    this.drops.push({ x:d.x, y:d.y, radius:d.radius, vx:d.vx||0, vy:d.vy||0, pinned:true, age:0, wobble:Math.random()*10 });
  }

  update(dt, gravity) {
    dt = Math.min(0.035, Math.max(0, dt));
    this.spawnClock += dt;
    if (this.spawnClock > 0.16) {
      this.spawnClock = 0;
      this._nucleate();
    }

    for (const d of this.drops) {
      d.age += dt;
      const wet = this.field.sampleWet(d.x, d.y);
      const water = this.field.sampleWater(d.x, d.y);
      d.radius = Math.min(0.035, d.radius + (water * 0.0005 + wet * 0.00008) * dt * 60);

      const mass = Math.max(0.00001, d.radius * d.radius);
      const drive = gravity.plane * mass * 950;
      const pinning = Math.max(0.012, 0.16 - wet * 0.08) * (0.014 / Math.max(0.004, d.radius));
      if (drive > pinning || Math.hypot(d.vx, d.vy) > 0.025) d.pinned = false;

      if (!d.pinned) {
        const jitter = Math.sin(d.age * 2.4 + d.wobble) * 0.015 * (1 - Math.min(1, wet));
        d.vx += (gravity.x * 0.34 * gravity.plane + jitter) * dt;
        d.vy += gravity.y * 0.34 * gravity.plane * dt;
        const drag = Math.exp(-dt * (2.2 - Math.min(1.1, wet)));
        d.vx *= drag;
        d.vy *= drag;
        const speed = Math.hypot(d.vx, d.vy);
        const cap = 0.18 + d.radius * 4.2;
        if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }

        const ox = d.x, oy = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const moved = Math.hypot(d.x - ox, d.y - oy);
        if (moved > 0.0002) this.field.depositTrail(d.x, d.y, Math.min(0.55, 0.08 + d.radius * 13), Math.max(0.006, d.radius * 0.7));
      }
    }

    this._merge();
    this.drops = this.drops.filter(d => d.x > -0.08 && d.x < 1.08 && d.y > -0.08 && d.y < 1.08 && d.radius > 0.0025);
  }

  _nucleate() {
    if (this.drops.length >= this.maxDrops) return;
    for (let k = 0; k < 7; k++) {
      const x = Math.random(), y = Math.random();
      const wet = this.field.sampleWet(x,y);
      const water = this.field.sampleWater(x,y);
      if (water + wet * 0.45 > 0.28 + Math.random() * 0.45) {
        this.add({ x, y, radius:0.0035 + Math.random() * 0.0045 + water * 0.004 });
      }
    }
  }

  _merge() {
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        const rr = (a.radius + b.radius) * 0.82;
        if ((a.x-b.x)**2 + (a.y-b.y)**2 > rr*rr) continue;
        const va = a.radius*a.radius, vb = b.radius*b.radius, total = va+vb;
        a.x = (a.x*va + b.x*vb)/total;
        a.y = (a.y*va + b.y*vb)/total;
        a.vx = (a.vx*va + b.vx*vb)/total;
        a.vy = (a.vy*va + b.vy*vb)/total;
        a.radius = Math.min(0.04, Math.sqrt(total));
        a.pinned = a.pinned && b.pinned && a.radius < 0.011;
        this.drops.splice(j,1); j--;
      }
    }
  }
}
