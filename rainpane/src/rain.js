// rain.js — the rainfall process. It decides how much water arrives, how it is
// split between drops, and how hard each one hits. It does not touch the pane.
//
// Intensity is a rainfall rate in mm/h, not a spawn counter. Everything else
// follows from it, so drizzle and storm differ in the *spectrum* of drop sizes
// and in impact energy, not only in how many events there are.

// Marshall & Palmer (1948): the number of drops per size falls off
// exponentially, and how fast it falls off depends on the rainfall rate.
//
//   N(D) = N0 exp(-Lambda D),  Lambda = 4.1 R^-0.21 mm^-1
//
// What arrives at a surface is weighted by how fast each size falls, so the
// arrival spectrum is proportional to D^0.67 exp(-Lambda D) once the terminal
// velocity below is folded in — which is a gamma distribution, and is sampled
// exactly rather than by rejection.
const LAMBDA_A = 4.1;
const LAMBDA_B = -0.21;
const VELOCITY_SPEED = 3.78;        // v = 3.78 D^0.67 m/s, D in mm
const VELOCITY_POWER = 0.67;
const D_MIN = 0.25;                 // mm; below this nothing is visible on a pane
const D_MAX = 5.0;

// A vertical pane does not catch the rain a horizontal metre would. How much it
// does catch depends on wind, and this is where the perceptual tuning lives:
// everything above is meteorology, this one number is taste.
const CATCH = 0.55;

const RHO = 1000;                   // kg/m^3
const SIGMA = 0.0728;               // N/m, water against air

export const INTENSITIES = [
  { name: 'Dry', rate: 0 },
  { name: 'Drizzle', rate: 0.4 },
  { name: 'Light', rate: 2.5 },
  { name: 'Rain', rate: 8 },
  { name: 'Heavy', rate: 25 },
  { name: 'Storm', rate: 55 },
];

export function terminalVelocity(diameterMm) {
  return VELOCITY_SPEED * Math.pow(diameterMm, VELOCITY_POWER);
}

/** Volume of a sphere of this diameter, in cubic millimetres. */
export function dropVolume(diameterMm) {
  return (Math.PI / 6) * diameterMm * diameterMm * diameterMm;
}

/**
 * Weber number of the impact: inertia against surface tension. It is what
 * decides how far a drop spreads before capillarity pulls it back, which is
 * why a storm drop splashes into a wide lamella and drizzle just sticks.
 */
export function weber(diameterMm, velocityMs) {
  return (RHO * velocityMs * velocityMs * (diameterMm / 1000)) / SIGMA;
}

export class Rainfall {
  constructor(random = Math.random) {
    this.random = random;
    this.rate = 0;                  // mm/h
    this.carry = 0;                 // mm^3 of rain owed but not yet delivered
    this.paneArea = 1;              // mm^2
  }

  setRate(mmPerHour) {
    this.rate = Math.max(0, mmPerHour);
    this.lambda = this.rate > 0 ? LAMBDA_A * Math.pow(this.rate, LAMBDA_B) : LAMBDA_A;
  }

  setPane(areaMm2) {
    this.paneArea = Math.max(1, areaMm2);
  }

  /** Water arriving on the pane per second, in cubic millimetres. */
  massFlux() {
    return (this.rate / 3600) * this.paneArea * CATCH;
  }

  /**
   * Draw the drops that arrive in `dt`. The loop is driven by the *volume*
   * owed, not by a count: choosing an event rate and a size independently is
   * how a simulation ends up with storms that are only drizzle repeated.
   */
  step(dt, out) {
    out.length = 0;
    if (this.rate <= 0) return out;
    this.carry += this.massFlux() * dt;
    let guard = 400;
    while (this.carry > 0 && guard-- > 0) {
      const d = this.sampleDiameter();
      const v = dropVolume(d);
      this.carry -= v;
      out.push({ diameter: d, volume: v, velocity: terminalVelocity(d) });
    }
    return out;
  }

  /** Gamma(1 + 0.67, 1/Lambda), clamped to what a pane can show. */
  sampleDiameter() {
    for (let tries = 0; tries < 24; tries += 1) {
      const d = gamma(1 + VELOCITY_POWER, 1 / this.lambda, this.random);
      if (d >= D_MIN && d <= D_MAX) return d;
    }
    return Math.min(D_MAX, Math.max(D_MIN, 1 / this.lambda));
  }
}

// Marsaglia & Tsang's gamma sampler, with the standard boost for shape < 1.
function gamma(shape, scale, random) {
  if (shape < 1) {
    const u = Math.max(1e-12, random());
    return gamma(shape + 1, scale, random) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

function normal(random) {
  const u = Math.max(1e-12, random());
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
