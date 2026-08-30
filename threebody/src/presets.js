// presets.js — reproducible initial states, not animations.
//
// Every entry is either an exact analytic condition or a converged member of a
// numerically corrected family, with enough recorded for anyone to regenerate
// it from scratch. AGENTS.md is explicit that a preset stores model state and
// propagation settings sufficient to reproduce it, and that nothing here may be
// hand-tuned into looking right.

import { MU } from './constants.js?v=20260830d';
import { lagrangePoints } from './lagrange.js?v=20260830d';
import { omega } from './cr3bp.js?v=20260830d';

const L = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));

/**
 * A perpendicular x-axis crossing, from the energy rather than from a table.
 *
 * A member of a corrected family is defined by its Jacobi constant and where it
 * crosses; the speed there follows, because C fixes it. Writing both the
 * position and the velocity as constants means they can disagree, and the first
 * time this file was written they did — a mistyped vy0 describes a completely
 * different orbit that still looks plausible. Deriving it removes the
 * possibility rather than the digit.
 */
function crossing(C, x0, sign) {
  const v2 = 2 * omega(x0, 0, MU) - C;
  if (v2 <= 0) throw new Error(`preset at C=${C}, x0=${x0} is inside the forbidden region`);
  return [x0, 0, 0, sign * Math.sqrt(v2)];
}

export const PRESETS = [
  {
    id: 'tadpole-l4',
    name: 'L4 tadpole',
    blurb: 'Released a little away from L4 and left alone. It does not fall in and it does not escape; it swings around the equilibrium for years.',
    state: [L.L4.x + 0.01, L.L4.y, 0, 0],
    duration: 400,
    view: { span: 1.1, centre: [0.49, 0.86] },
    origin: 'analytic: L4 solved from the model, displaced 0.01 DU in x, released at rest',
    expect: 'librates about longitude 60 over roughly 19 degrees',
  },
  {
    id: 'tadpole-l5',
    name: 'L5 tadpole',
    blurb: 'The same thing at the trailing triangular point. Mirror image, same physics.',
    state: [L.L5.x + 0.01, L.L5.y, 0, 0],
    duration: 400,
    view: { span: 1.1, centre: [0.49, -0.86] },
    origin: 'analytic: mirror of the L4 case',
    expect: 'librates about longitude -60',
  },
  {
    // Found by scanning perpendicular far-side crossings at fixed C for sign
    // changes in vx at the next crossing, then Newton-correcting each bracket.
    // See tools/horseshoe.mjs, which regenerates these numbers from nothing.
    id: 'horseshoe',
    name: 'Earth–Moon horseshoe',
    blurb: 'The spacecraft creeps most of the way round the Moon’s orbit, slows, turns round without any push, and creeps back. Nothing steers it. The reversal is what the Moon’s gravity does to its orbital period.',
    C: 3.0,
    x0: -1.267104822144,
    sign: 1,
    get state() { return crossing(3.0, -1.267104822144, 1); },
    duration: 43.937540294751,
    origin: 'converged symmetric periodic orbit at C = 3.000; tools/horseshoe.mjs regenerates it with no initial guess',
    expect: 'librates +-158 degrees about the far side, enclosing both L4 and L5; mean semi-major axis 1.000; closest to the Moon 145 000 km',
    verified: {
      C: 3.0,
      period: 43.937540294751,
      crossingResidual: 4.1e-13,
      closesTo: 1.6e-10,
      // What the orbit does to an error over one period. It is why the period
      // is stored to twelve figures: an unstable orbit given a period wrong in
      // the fourth decimal does not come back to where it started.
      amplifiesPerPeriod: 1.8e5,
      meanSemiMajor: 0.9997,
      moonClosestKm: 145000,
    },
  },
  {
    id: 'horseshoe-wide',
    name: 'Horseshoe, wider',
    blurb: 'A second member of the same family: slower, further out, sixteen months to go round once.',
    C: 3.0,
    x0: -1.159040332924,
    sign: 1,
    get state() { return crossing(3.0, -1.159040332924, 1); },
    duration: 112.764622135782,
    origin: 'converged symmetric periodic orbit at C = 3.000, the same family, a slower member',
    expect: 'librates +-155 degrees; closest to the Moon 161 000 km',
    verified: { C: 3.0, period: 112.764622135782, crossingResidual: 6.7e-13, closesTo: 4.2e-10, amplifiesPerPeriod: 1.3e6, meanSemiMajor: 1.0034, moonClosestKm: 160912 },
  },
  {
    id: 'l1-unstable',
    name: 'L1, nudged',
    blurb: 'Placed at L1 and pushed by four hundred metres — about the length of a runway, against a quarter of a million miles. Watch how long that stays small.',
    state: [L.L1.x + 1e-6, 0, 0, 0],
    duration: 20,
    view: { span: 1.4, centre: [0.9, 0] },
    origin: 'analytic: L1 solved from the model, displaced 1e-6 DU',
    expect: 'grows at 2.93 per TU, its own eigenvalue: 1 km becomes 100 000 km in about three weeks',
  },
  {
    id: 'l2-unstable',
    name: 'L2, nudged',
    blurb: 'The same push behind the Moon, where it runs away faster still.',
    state: [L.L2.x + 1e-6, 0, 0, 0],
    duration: 20,
    view: { span: 1.6, centre: [1.0, 0] },
    origin: 'analytic: L2 displaced 1e-6 DU',
    expect: 'departs and leaves the Earth-Moon neighbourhood',
  },
  {
    id: 'free',
    name: 'Free launch',
    blurb: 'No family, no plan. A state chosen off the shelf, to show what most of phase space actually does.',
    state: [0.6, 0.3, -0.4, 0.35],
    duration: 100,
    origin: 'arbitrary, kept fixed so it is reproducible',
    expect: 'wanders; sensitive to its initial conditions',
  },
];

export const byId = (id) => PRESETS.find((p) => p.id === id);
