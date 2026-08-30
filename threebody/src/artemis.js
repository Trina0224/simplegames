// artemis.js -- GENERATED. Do not edit by hand.
//
//   node --experimental-default-type=module threebody/tools/artemis.mjs
//
// The mission-context presets from ARTEMIS_DEMO_SPEC.md. Everything under
// `measured` came out of the propagator; everything under `NASA` is published
// program context and is never an input to the dynamics. They are kept in
// separate objects so that no display can quote one while meaning the other,
// which is the spec's acceptance test 4.
//
// mu = 0.0121505856, integrator tolerance 1e-13 absolute and relative.

/** Published program context. Labels, not inputs. Safe to update in isolation. */
export const NASA_REFERENCE = {
  gateway: {
    periodDays: 6.5,
    nearKm: 1500,
    farKm: 70000,
    note: 'NASA describes Gateway as operating in a near-rectilinear halo orbit with a '
      + 'period of about 6.5 days, passing about 1 500 km from the Moon at its closest '
      + 'and about 70 000 km at its farthest.',
  },
  capstone: {
    nearKm: 1609,
    farKm: 70006,
    periodDays: 6.5,
    note: 'CAPSTONE flew a lunar NRHO as a pathfinder for the family Gateway is planned '
      + 'for, testing operations and navigation there. NASA quotes roughly 1 000 miles at '
      + 'the near pass and 43 500 miles at the far one, on a cycle of about 6.5 days.',
  },
  artemis: {
    note: 'Under NASA\'s current architecture Artemis III (2027) is a low-Earth-orbit '
      + 'rendezvous and docking demonstration, and Artemis IV is the subsequent first '
      + 'crewed lunar-surface mission.',
  },
  source: 'NASA Gateway and CAPSTONE mission pages, as summarised in ARTEMIS_DEMO_SPEC.md',
};

/**
 * A Gateway-class member of the L2 halo family.
 *
 * Not fitted. This is the member of the SAME continuation the family slider
 * browses whose period is nearest the 6.5 days NASA publishes -- and had the
 * near-pass or far-pass figure been used to choose instead, it would have
 * selected a member 0.058 d and 0.143 d away respectively. Three
 * independent published numbers agreeing to within a fifth of a day is the family
 * going where Gateway's goes; it is not something a fitted curve would produce.
 */
export const GATEWAY_NRHO = {
  id: 'artemis-gateway',
  name: 'Artemis — Gateway-like NRHO',
  point: 'L2',
  artemis: true,
  blurb: 'Gateway is planned for a near-rectilinear halo orbit rather than a low circular '
    + 'lunar orbit. It passes 1345 km over the Moon and then swings '
    + '71 000 km out into cislunar space, every '
    + '6.50 days, and the whole loop stands on end. It is not parked at L2: '
    + 'L2 is drawn here too, and the orbit goes nowhere near it.',
  expect: 'perilune 1345 km above the Moon; apolune 70858 km; closes in 6.500 days',
  state: [0.9874065435015671, 0, 0.008005872776257781, 0, 1.713090117697641, 0],
  period: 1.4968470055984293,
  duration: 4.490541016795288,
  C: 3.047589115695002,
  residual: 1.161e-13,
  closure: 6.099e-11,
  drift: 1.048e-13,
  measured: {
    periodDays: 6.50005812181118,
    periluneKm: 3082.163,
    nearKm: 1344.763,
    apoluneKm: 70858.4,
    zMaxKm: 69707,
    slenderness: 5.408,
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
    + 'Gateway\'s are the same geometry. This is a CAPSTONE-like CR3BP demonstration, '
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
 * a measured 0.1 km over one Gateway orbit instead of staying exactly circular.
 */
export const LOW_LUNAR = {
  id: 'artemis-llo',
  state: [0.9926293311533818, 0, 0, 0, 1.589587602127313, 0],
  period: 0.01883700110466062,
  C: 5.508839892867249,
  altitudeKm: 100,
  measured: {
    periodHours: 1.9632,
    speedKmS: 1.6335,
    lowKm: 99.93,
    highKm: 100.06,
    revsPerGateway: 79.46,
    status: 'ok',
  },
  origin: 'circular at ' + 100 + ' km altitude: inertial speed sqrt(mu/r) about the Moon, '
    + 'converted to the rotating frame by subtracting omega x r from the barycentre, '
    + 'then propagated by the same CR3BP integrator as everything else',
};

/**
 * Where the Gateway-like member falls on the browsable L2 family.
 *
 * The slider samples 30 of 3087 members, so this is the NEAREST one, not the same
 * one, and the gap is recorded so nothing has to pretend otherwise.
 */
export const GATEWAY_ON_FAMILY = {
  point: 'L2',
  index: 23,
  of: 30,
  periodDays: 6.5482,
  periluneKm: 3210.9,
  periodGapDays: 0.0481,
  periluneGapKm: 128.8,
};

/**
 * Orion's departure state, and the approach that reaches Gateway from it.
 *
 * The stored solution is what tools/artemis.mjs got by scanning; the app's "Plan
 * approach" button re-runs the same scan live and must reproduce it. That is the
 * point of storing it at all -- a canned answer nobody can re-derive is a claim,
 * and this one is a measurement anyone can repeat.
 *
 * Concept, not reconstruction: ARTEMIS_DEMO_SPEC.md E says a concept
 * demonstration and not an Artemis IV operational trajectory, and the departure
 * state above is a search result, not a mission plan.
 */
export const ORION_DEPARTURE = {
  id: 'artemis-orion',
  name: 'Artemis — Orion to Gateway (concept)',
  rendezvous: true,
  state: [0.71625732282872, 0, 0.1040582726326743, 0, 0.39006494146646375, 0],
  epoch: 0.5,
  search: {
    fromEarthKm: 280000, heightKm: 40000, circularFraction: 0.95,
    note: 'cheapest of a grid over 180 000-280 000 km, 0-40 000 km height, '
      + '0.80-0.95 of circular, and four departure epochs, each scanned over '
      + 'fourteen flight times',
  },
  solution: {
    dv1: [0.14868780775260965, 0.1735467727886951, -0.15186466275665247],
    dv1Mag: 0.27438918038771093,
    dv2: [0.1695817841732966, 0.22432549355559891, -0.00019150637435802476],
    dv2Mag: 0.28121156671988623,
    dvTotal: 0.5556007471075972,
    timeOfFlight: 2,
    posErr: 2.452989729604407e-9,
    relSpeedBefore: 0.28121156671988623,
    relSpeedAfter: 0,
    kind: 'rendezvous',
    status: 'ok',
    iterations: 21,
  },
  measured: {
    dvTotalMs: 569.24,
    dv1Ms: 281.12,
    dv2Ms: 288.11,
    tofDays: 8.685,
    missM: 0.9429,
    relSpeedBeforeMs: 288.11,
  },
  blurb: 'Gateway is not a place, it is a state in motion — so "reach Gateway" means '
    + 'being where Gateway WILL be, moving how Gateway will be moving. Orion departs '
    + 'from cislunar space, and the solver aims at Gateway\'s position at the arrival '
    + 'instant, not at where it sits now. Position alone would be an intercept; the '
    + 'second burn at arrival is what makes it a rendezvous.',
  expect: 'rendezvous: 569 m/s over 8.69 days, '
    + 'miss 0.9 m',
};

export const ARTEMIS3D = [GATEWAY_NRHO, CAPSTONE_NRHO, ORION_DEPARTURE];
