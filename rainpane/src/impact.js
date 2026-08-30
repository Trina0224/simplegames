// impact.js — what a raindrop does in the moments after it hits the glass.
//
// An impact is not an event that produces a bead. It is a short lifecycle: the
// drop arrives with momentum and spreads into a thin lamella far wider than
// itself, capillarity then takes over and the rim retracts, and only then does
// it settle into whatever the pane already had there. Skipping straight to a
// relaxed circle is the single most obvious way rain on glass looks fake.
//
// The mass is on the pane from the first frame — the water really is there —
// but its *shape* is re-laid every frame: the previous footprint is taken back
// and the new one written. That is the only way to animate a spreading
// footprint in a height field without inventing or losing water.

import { weber } from './rain.js?v=20260830g';
import { MM, NONE } from './surface.js?v=20260830g';

// Real spreading takes a couple of milliseconds and retraction ten or twenty.
// At sixty frames a second that is less than one frame, so it is dilated to
// something a person can see. This is a deliberate perceptual choice and the
// only one in this file; the shapes and sizes it interpolates between are not.
const SPREAD_S = 0.045;
const LIFE_S = 0.20;

// Clanet's scaling: the lamella spreads until inertia is spent against surface
// tension, so the maximum spread ratio goes as the fourth root of the Weber
// number. Drizzle barely spreads at all; a storm drop covers several times its
// own diameter.
const SPREAD_COEFF = 0.55;
const SPREAD_MIN = 1.5;
const SPREAD_MAX = 5.0;

// What is left once the rim has pulled back: a sessile cap on glass sits on a
// base rather wider than the drop it came from, and wider still where the glass
// is already wet, because a wet contact line retracts far less.
const RELAX_DRY = 1.25;
const RELAX_WET = 0.95;

export class ImpactField {
  constructor(surface) {
    this.surface = surface;
    this.live = [];
    this.pool = [];
    this.landed = 0;                // mass delivered, for the audit
    this.onImpact = null;           // audio listens here; see AUDIO_SPEC.md
    this.setScale(3);
  }

  setScale(cellPx) {
    this.cellMm = Math.max(0.02, cellPx / MM);
    this.mmToCells = 1 / this.cellMm;
    // One unit of thickness is one cell deep over one cell, so a unit of mass
    // is one cell cubed.
    this.mm3ToMass = 1 / (this.cellMm * this.cellMm * this.cellMm);
  }

  reset() {
    for (const s of this.live) this.pool.push(s);
    this.live.length = 0;
    this.landed = 0;
  }

  /**
   * A drop arrives. `diameter` in mm, `velocity` in m/s, `volume` in mm^3.
   * `gravity` tilts the spreading: on an inclined pane the lamella runs further
   * downhill than up, so the footprint is not centred on the point of contact.
   */
  add(x, y, drop, gravity) {
    const s = this.pool.pop() || { cells: [] };
    const we = weber(drop.diameter, drop.velocity);
    const beta = Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, SPREAD_COEFF * Math.pow(we, 0.25)));
    const rDrop = 0.5 * drop.diameter * this.mmToCells;
    const wet = this.surface.wet[this.surface.index(x, y)];

    s.x = x;
    s.y = y;
    s.mass = drop.volume * this.mm3ToMass;
    s.r0 = rDrop;
    s.rMax = rDrop * beta;
    s.rEq = rDrop * (RELAX_DRY + (RELAX_WET - RELAX_DRY) * wet + 0.55 * wet);
    // The lamella is thrown downhill as it spreads, and the further it spreads
    // the further off-centre it ends up.
    const tilt = gravity && gravity.plane > 0.05 ? gravity.plane : 0;
    s.driftX = (gravity ? gravity.x : 0) * (s.rMax - s.r0) * 0.3 * tilt;
    s.driftY = (gravity ? gravity.y : 1) * (s.rMax - s.r0) * 0.3 * tilt;
    s.age = 0;
    s.cells.length = 0;
    s.laid = 0;

    this.live.push(s);
    this.landed += s.mass;

    // The same event drives the sound. It is the physical impact, not anything
    // read back off the render: size, speed, energy, and how wet the glass
    // already was where it landed.
    if (this.onImpact) {
      const v = drop.velocity;
      const kg = drop.volume * 1e-6;               // mm^3 of water -> kg
      this.onImpact({
        x: x / this.surface.cols,
        y: y / this.surface.rows,
        diameter: drop.diameter,
        velocity: v,
        energy: 0.5 * kg * v * v,
        thickness: this.surface.h[this.surface.index(x, y)] * this.cellMm,
        wetness: wet,
        existingBody: this.surface.flowId[this.surface.index(x, y)] !== NONE,
      });
    }
    return s;
  }

  update(dt) {
    const s = this.surface;
    const keep = [];
    for (const sp of this.live) {
      // take the previous footprint back before writing the new one
      if (sp.cells.length) sp.mass = s.retract(sp.cells);
      sp.cells.length = 0;
      sp.age += dt;

      const done = sp.age >= LIFE_S;
      const r = radiusAt(sp, done ? LIFE_S : sp.age);
      const t = Math.min(1, sp.age / LIFE_S);
      const cx = sp.x + sp.driftX * ease(Math.min(1, sp.age / SPREAD_S));
      const cy = sp.y + sp.driftY * ease(Math.min(1, sp.age / SPREAD_S));

      // A spreading lamella is a thin sheet with the liquid piled into its rim,
      // which is why a fresh splash reads as a ring and not as a blob; it
      // relaxes continuously back into a cap rather than switching at some
      // moment part way through.
      const rimness = sp.age < SPREAD_S
        ? 1
        : 1 - ease(Math.min(1, (sp.age - SPREAD_S) / (LIFE_S - SPREAD_S)));
      s.depositRim(cx, cy, r, sp.mass, sp.cells, rimness);
      // The glass stays wet out to wherever the lamella actually reached, which
      // is what leaves a halo around a splash long after the water has gone.
      s.markWet(cx, cy, Math.max(sp.rMax * (0.4 + 0.6 * t), 1), 0.55);

      if (!done) { keep.push(sp); continue; }

      // Handover. If any part of the footprint overlaps an existing body then
      // the whole splash belongs to that body — a drop landing on a rivulet
      // feeds it, it does not sit on top of it as an independent bead. Testing
      // only the point of contact misses the common case, which is a splash
      // that lands beside a channel and spreads into it.
      let owner = NONE;
      for (let k = 0; k < sp.cells.length && owner === NONE; k += 2) {
        owner = s.flowId[sp.cells[k]];
      }
      if (owner !== NONE) {
        for (let k = 0; k < sp.cells.length; k += 2) {
          if (s.flowId[sp.cells[k]] === NONE) s.flowId[sp.cells[k]] = owner;
        }
      }
      sp.cells.length = 0;
      this.pool.push(sp);
    }
    this.live = keep;
  }

  /**
   * Mass currently held by impacts that are still spreading. This is reported
   * for interest only and must NOT be added to the pane's total: a live splash
   * has already written its water into the thickness field, so counting it here
   * as well double-counts it.
   */
  spreadingMass() {
    let sum = 0;
    for (const s of this.live) sum += s.mass;
    return sum;
  }
}

function radiusAt(sp, age) {
  if (age <= SPREAD_S) {
    // inertia-dominated: fast at first, slowing as it runs out of momentum
    return sp.r0 + (sp.rMax - sp.r0) * ease(age / SPREAD_S);
  }
  const t = (age - SPREAD_S) / (LIFE_S - SPREAD_S);
  // surface forces take over and the rim pulls back
  return sp.rMax + (sp.rEq - sp.rMax) * ease(t);
}

function ease(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x) * (1 - x);
}
