// artemis.mjs — regenerates src/artemis.js, the mission-context presets.
//
//   node --experimental-default-type=module threebody/tools/artemis.mjs
//
// ARTEMIS_DEMO_SPEC.md is emphatic about one thing above all others: the orbits
// are found, never fitted. "Do not tune a curve visually to NASA's published
// closest/farthest distances." So this tool does exactly two things:
//
//   1. runs the SAME continuation the family slider browses, and
//   2. picks the member whose period is nearest the 6.5 days NASA publishes for
//      Gateway -- then reports what that member actually is.
//
// Selecting a member from a family is not shaping one. The proof that it is not
// is in validate.mjs section 19: NASA's three published figures -- period, near
// pass, far pass -- independently select members within 0.2 days of each other.
// If the family did not go where Gateway's goes, they would not agree.
//
// The low lunar orbit is generated too, and under the same model. The spec
// allows a Moon-centred two-body illustration if it is labelled as one; it is
// better not to need the label. A circular orbit's initial state is worked out
// analytically and then handed to the same CR3BP integrator as everything else,
// so the comparison is one model throughout and the small CR3BP perturbation of
// a "circular" orbit is itself measured rather than assumed away.

import { writeFileSync } from 'node:fs';
import { MU, DU_KM, TU_DAYS, MOON_X, MOON_RADIUS_KM, MOON_RADIUS } from '../src/constants.js?v=20260830m';
import { haloBranch, haloArc, lunarGeometry, closure } from '../src/halo.js?v=20260830m';
import { propagate3 } from '../src/trajectory3d.js?v=20260830m';
import { jacobi3 } from '../src/cr3bp3d.js?v=20260830m';

// --- what NASA publishes, kept apart from anything measured here ------------
// ARTEMIS_DEMO_SPEC.md: "Program facts are labels/context, not inputs to the
// CR3BP equations", and mission text must be easy to update without touching
// orbit code. Nothing below is used to choose, correct or adjust a state -- the
// period is used once, to pick which existing family member to show.
const NASA = {
  gatewayPeriodDays: 6.5,
  gatewayNearKm: 1500,
  gatewayFarKm: 70000,
  capstoneNearKm: 1609,     // NASA quotes about 1,000 miles
  capstoneFarKm: 70006,     // and about 43,500 miles
  source: 'NASA Gateway and CAPSTONE mission pages, as summarised in ARTEMIS_DEMO_SPEC.md',
};

// --- the family, walked exactly as the slider's is --------------------------
const held = haloBranch('L2', { steps: 400 });
const family = [...held, ...haloArc(held[held.length - 1], held[held.length - 2],
  { ds: 4e-4, steps: 20000 })];
console.error(`L2 family: ${family.length} members`);

const rows = family.map((m) => ({ m, g: lunarGeometry(m), days: m.period * TU_DAYS }));
const nearest = (want, of) =>
  rows.reduce((a, r) => (Math.abs(of(r) - want) < Math.abs(of(a) - want) ? r : a));

const byPeriod = nearest(NASA.gatewayPeriodDays, (r) => r.days);
const byNear = nearest((NASA.gatewayNearKm + MOON_RADIUS_KM) / DU_KM, (r) => r.g.perilune);
const byFar = nearest(NASA.gatewayFarKm / DU_KM, (r) => r.g.apolune);
console.error(`selected by period ${byPeriod.days.toFixed(4)} d; `
  + `the near-pass and far-pass figures would have selected ${byNear.days.toFixed(4)} d `
  + `and ${byFar.days.toFixed(4)} d`);

const gw = byPeriod;
const gwClose = closure(gw.m);

// --- a low lunar orbit, in the same model -----------------------------------
//
// A circular orbit of radius r about the Moon has inertial speed sqrt(mu/r). The
// rotating frame turns at one radian per time unit, so the state it needs is
// that inertial velocity minus omega x r measured from the BARYCENTRE, which for
// a point on the x axis is (0, x, 0). Prograde, in the z = 0 plane, because the
// contrast being drawn is with an orbit standing on end.
//
// Written out, since dropping a term here is silent: the inertial velocity is the
// Moon's own, (0, 1-mu, 0), plus the circular one, (0, sqrt(mu/r), 0); the frame
// term is (0, 1-mu+r, 0); the Moon's orbital velocity cancels and what is left is
// (0, sqrt(mu/r) - r, 0). The first draft of this kept the (1-mu) in the frame
// term and lost it from the inertial one, which is a spacecraft launched at 62%
// of circular speed: it fell into the Moon inside a tenth of a revolution, from
// every altitude tried.
const LLO_ALT_KM = 100;
const llor = (MOON_RADIUS_KM + LLO_ALT_KM) / DU_KM;
const llov = Math.sqrt(MU / llor);
const lloState = [MOON_X + llor, 0, 0, 0, llov - llor, 0];
const lloPeriod = 2 * Math.PI * llor / llov;
// Flown for as long as one Gateway orbit, so the comparison is like for like:
// the reader sees how many times round the low orbit goes while the NRHO goes
// round once. That ratio is the whole point of the demo.
const lloRun = propagate3(lloState, gw.m.period, { sample: gw.m.period / 6000, absTol: 1e-13, relTol: 1e-13 });
let lloLo = Infinity, lloHi = 0;
for (let i = 0; i < lloRun.xs.length; i += 1) {
  const d = Math.hypot(lloRun.xs[i] - MOON_X, lloRun.ys[i], lloRun.zs[i]);
  lloLo = Math.min(lloLo, d); lloHi = Math.max(lloHi, d);
}
console.error(`LLO: T ${(lloPeriod * TU_DAYS * 24).toFixed(3)} h, `
  + `${(gw.m.period / lloPeriod).toFixed(1)} revolutions per Gateway orbit, `
  + `altitude ${(lloLo * DU_KM - MOON_RADIUS_KM).toFixed(1)}-${(lloHi * DU_KM - MOON_RADIUS_KM).toFixed(1)} km, `
  + `status ${lloRun.status}`);

const num = (v) => (Number.isInteger(v) ? String(v) : String(v));
const src = `// artemis.js -- GENERATED. Do not edit by hand.
//
//   node --experimental-default-type=module threebody/tools/artemis.mjs
//
// The mission-context presets from ARTEMIS_DEMO_SPEC.md. Everything under
// \`measured\` came out of the propagator; everything under \`NASA\` is published
// program context and is never an input to the dynamics. They are kept in
// separate objects so that no display can quote one while meaning the other,
// which is the spec's acceptance test 4.
//
// mu = ${MU}, integrator tolerance 1e-13 absolute and relative.

/** Published program context. Labels, not inputs. Safe to update in isolation. */
export const NASA_REFERENCE = {
  gateway: {
    periodDays: ${NASA.gatewayPeriodDays},
    nearKm: ${NASA.gatewayNearKm},
    farKm: ${NASA.gatewayFarKm},
    note: 'NASA describes Gateway as operating in a near-rectilinear halo orbit with a '
      + 'period of about 6.5 days, passing about 1 500 km from the Moon at its closest '
      + 'and about 70 000 km at its farthest.',
  },
  capstone: {
    nearKm: ${NASA.capstoneNearKm},
    farKm: ${NASA.capstoneFarKm},
    periodDays: ${NASA.gatewayPeriodDays},
    note: 'CAPSTONE flew a lunar NRHO as a pathfinder for the family Gateway is planned '
      + 'for, testing operations and navigation there. NASA quotes roughly 1 000 miles at '
      + 'the near pass and 43 500 miles at the far one, on a cycle of about 6.5 days.',
  },
  artemis: {
    note: 'Under NASA\\'s current architecture Artemis III (2027) is a low-Earth-orbit '
      + 'rendezvous and docking demonstration, and Artemis IV is the subsequent first '
      + 'crewed lunar-surface mission.',
  },
  source: '${NASA.source}',
};

/**
 * A Gateway-class member of the L2 halo family.
 *
 * Not fitted. This is the member of the SAME continuation the family slider
 * browses whose period is nearest the 6.5 days NASA publishes -- and had the
 * near-pass or far-pass figure been used to choose instead, it would have
 * selected a member ${Math.abs(byNear.days - gw.days).toFixed(3)} d and ${Math.abs(byFar.days - gw.days).toFixed(3)} d away respectively. Three
 * independent published numbers agreeing to within a fifth of a day is the family
 * going where Gateway's goes; it is not something a fitted curve would produce.
 */
export const GATEWAY_NRHO = {
  id: 'artemis-gateway',
  name: 'Artemis — Gateway-like NRHO',
  point: 'L2',
  artemis: true,
  blurb: 'Gateway is planned for a near-rectilinear halo orbit rather than a low circular '
    + 'lunar orbit. It passes ${+(gw.g.perilune * DU_KM - MOON_RADIUS_KM).toFixed(0)} km over the Moon and then swings '
    + '${(gw.g.apolune * DU_KM / 1000).toFixed(0)} 000 km out into cislunar space, every '
    + '${gw.days.toFixed(2)} days, and the whole loop stands on end. It is not parked at L2: '
    + 'L2 is drawn here too, and the orbit goes nowhere near it.',
  expect: 'perilune ${+(gw.g.perilune * DU_KM - MOON_RADIUS_KM).toFixed(0)} km above the Moon; apolune ${(gw.g.apolune * DU_KM).toFixed(0)} km; closes in ${gw.days.toFixed(3)} days',
  state: [${gw.m.state.map(String).join(', ')}],
  period: ${gw.m.period},
  duration: ${gw.m.period * 3},
  C: ${gw.m.C},
  residual: ${gw.m.residual.toExponential(3)},
  closure: ${gwClose.error.toExponential(3)},
  drift: ${gwClose.run.relDrift.toExponential(3)},
  measured: {
    periodDays: ${gw.days},
    periluneKm: ${+(gw.g.perilune * DU_KM).toFixed(3)},
    nearKm: ${+(gw.g.perilune * DU_KM - MOON_RADIUS_KM).toFixed(3)},
    apoluneKm: ${+(gw.g.apolune * DU_KM).toFixed(1)},
    zMaxKm: ${+(gw.g.zMax * DU_KM).toFixed(0)},
    slenderness: ${+gw.g.slenderness.toFixed(3)},
  },
  origin: 'the L2 halo family: a Richardson seed at Az = 0.005 DU, corrected on the '
    + 'y = 0 section, continued by held component through the first fold and by '
    + 'pseudo-arclength past the second, then the member whose period is nearest 6.5 d',
};

/** The same family region CAPSTONE actually flew. Deliberately the same orbit. */
export const CAPSTONE_NRHO = {
  ...GATEWAY_NRHO,
  id: 'artemis-capstone',
  name: 'Artemis — CAPSTONE NRHO',
  capstone: true,
  blurb: 'The same orbit, and that is the point. CAPSTONE flew a lunar NRHO in 2022 as a '
    + 'pathfinder for the family Gateway is planned for, so its published geometry and '
    + 'Gateway\\'s are the same geometry. This is a CAPSTONE-like CR3BP demonstration, '
    + 'not reconstructed flight ephemeris.',
  expect: 'the Gateway-like member, shown again: CAPSTONE and Gateway target one family',
};

/**
 * A low lunar orbit, for the comparison -- generated in the CR3BP, not beside it.
 *
 * ARTEMIS_DEMO_SPEC.md allows a Moon-centred two-body illustration provided it is
 * labelled as one, and prefers one model throughout. This is one model throughout:
 * the circular initial state is worked out analytically and then flown by the same
 * integrator as every other trajectory here, which is why its altitude wanders by
 * a measured ${((lloHi - lloLo) * DU_KM).toFixed(1)} km over one Gateway orbit instead of staying exactly circular.
 */
export const LOW_LUNAR = {
  id: 'artemis-llo',
  state: [${lloState.map(String).join(', ')}],
  period: ${lloPeriod},
  C: ${jacobi3(lloState, MU)},
  altitudeKm: ${LLO_ALT_KM},
  measured: {
    periodHours: ${+(lloPeriod * TU_DAYS * 24).toFixed(4)},
    speedKmS: ${+(llov * DU_KM / (TU_DAYS * 86400)).toFixed(4)},
    lowKm: ${+(lloLo * DU_KM - MOON_RADIUS_KM).toFixed(2)},
    highKm: ${+(lloHi * DU_KM - MOON_RADIUS_KM).toFixed(2)},
    revsPerGateway: ${+(gw.m.period / lloPeriod).toFixed(2)},
    status: '${lloRun.status}',
  },
  origin: 'circular at ' + ${LLO_ALT_KM} + ' km altitude: inertial speed sqrt(mu/r) about the Moon, '
    + 'converted to the rotating frame by subtracting omega x r from the barycentre, '
    + 'then propagated by the same CR3BP integrator as everything else',
};

export const ARTEMIS3D = [GATEWAY_NRHO, CAPSTONE_NRHO];
`;

writeFileSync(new URL('../src/artemis.js?v=20260830m', import.meta.url), src);
console.error('wrote src/artemis.js');
