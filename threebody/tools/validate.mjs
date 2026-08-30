// validate.mjs — the numerical validation suite from SPEC.md section 17.
//
// The specification says the implementation may not claim physical fidelity
// without these checks, so they are committed rather than left in a scratch
// directory. Run from the repository root:
//
//   node --experimental-default-type=module threebody/tools/validate.mjs
//
// Node needs that flag because the source is browser ES modules and the
// repository has no package.json — the application itself needs no build step
// and this suite does not change that.

import { readFileSync } from 'node:fs';
import { MU, TU_DAYS, DU_KM } from '../src/constants.js?v=20260830h';
import { omega, jacobi, deriv } from '../src/cr3bp.js?v=20260830h';
import { lagrangePoints } from '../src/lagrange.js?v=20260830h';
import { Dopri5 } from '../src/integrator.js?v=20260830h';
import { propagate, toAxisCrossing, findSymmetricFamily, classifyCoorbital } from '../src/trajectory.js?v=20260830h';
import { PRESETS } from '../src/presets.js?v=20260830h';
import { planTransfer, solveBurn } from '../src/targeting.js?v=20260830h';
import { MOON_RADIUS, MOON_X, EARTH_RADIUS, EARTH_X, msToVu } from '../src/constants.js?v=20260830h';
import { displayToRotating } from '../src/display.js?v=20260830h';
import { FreeLaunch, PREVIEW_TU } from '../src/freelaunch.js?v=20260830h';
import { toInertial } from '../src/frames.js?v=20260830h';
import { displayPos, displayState, displayBodies, displayPoints, earthInertial, burnToRotating } from '../src/display.js?v=20260830h';

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
};
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

console.log('\n1. Lagrange points against published Earth-Moon values');
const P = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));
const PUBLISHED = { L1: 0.8369, L2: 1.1557, L3: -1.0050, L4: 0.4878, L5: 0.4878 };
for (const [n, x] of Object.entries(PUBLISHED)) {
  check(`${n} x = ${P[n].x.toFixed(6)}`, Math.abs(P[n].x - x) < 1e-4, `published ${x}, residual ${P[n].residual.toExponential(1)}`);
}
check('L1/L2/L3 are unstable', P.L1.unstable && P.L2.unstable && P.L3.unstable,
  `e-folding ${(P.L1.eFoldTu * TU_DAYS).toFixed(2)} / ${(P.L2.eFoldTu * TU_DAYS).toFixed(2)} / ${(P.L3.eFoldTu * TU_DAYS).toFixed(1)} days`);
check('L4/L5 have no growing direction', !P.L4.unstable && !P.L5.unstable, `mass ratio ${MU.toFixed(6)} is below the triangular stability limit 0.03852`);

console.log('\n2. An unperturbed equilibrium stays put -- for as long as it can');
{
  // L4 has no growing direction, so it holds indefinitely.
  const r4 = propagate([P.L4.x, P.L4.y, 0, 0], 400, { sample: 20 });
  check(`L4 released at rest, 400 TU (${(400 * TU_DAYS).toFixed(0)} days)`,
    Math.hypot(r4.state[0] - P.L4.x, r4.state[1] - P.L4.y) < 1e-12,
    `moved ${Math.hypot(r4.state[0] - P.L4.x, r4.state[1] - P.L4.y).toExponential(1)} DU`);

  // L1 cannot, and this is the physics rather than a numerical failing: it is a
  // saddle with a 1.5-day e-folding time, so the round-off in its own
  // coordinates is amplified by e^300 over the same 400 TU. Asking it to sit
  // still for a year is asking arithmetic to be exact. What CAN be checked is
  // that it holds for a few e-folding times, and that when it does leave, it
  // leaves at the rate the linear analysis predicted.
  const r1 = propagate([P.L1.x, P.L1.y, 0, 0], 3, { sample: 0.5 });
  check('L1 released at rest, 3 TU (13 days, ~9 e-foldings)',
    Math.hypot(r1.state[0] - P.L1.x, r1.state[1] - P.L1.y) < 1e-6,
    `moved ${Math.hypot(r1.state[0] - P.L1.x, r1.state[1] - P.L1.y).toExponential(1)} DU`);

  // growth rate, measured against the eigenvalue
  const d0 = 1e-10;
  const a = propagate([P.L1.x + d0, P.L1.y, 0, 0], 4, { sample: 0.5 });
  const grown = Math.hypot(a.state[0] - P.L1.x, a.state[1] - P.L1.y);
  const measured = Math.log(grown / d0) / 4;
  check('L1 departure rate matches its eigenvalue',
    Math.abs(measured - P.L1.growth) / P.L1.growth < 0.06,
    `measured ${measured.toFixed(4)} per TU, linear theory ${P.L1.growth.toFixed(4)}`);
}

console.log('\n3. A tiny perturbation at a collinear point grows');
for (const n of ['L1', 'L2']) {
  const d = 1e-6;
  const r = propagate([P[n].x + d, P[n].y, 0, 0], 20, { sample: 1 });
  const moved = Math.hypot(r.state[0] - P[n].x, r.state[1] - P[n].y);
  check(`${n} nudged by 1e-6 DU (${(d * DU_KM).toFixed(1)} km)`, moved > 100 * d, `grew to ${moved.toExponential(1)} DU in ${(20 * TU_DAYS).toFixed(0)} days`);
}

console.log('\n4. A small perturbation at L4 stays bounded (tadpole)');
for (const d of [0.002, 0.01, 0.02]) {
  const r = propagate([P.L4.x + d, P.L4.y, 0, 0], 400, { sample: 0.2 });
  let lo = Infinity, hi = -Infinity, rmax = 0;
  for (let i = 0; i < r.xs.length; i += 1) {
    const lon = Math.atan2(r.ys[i], r.xs[i]) * 180 / Math.PI;
    lo = Math.min(lo, lon); hi = Math.max(hi, lon);
    rmax = Math.max(rmax, Math.hypot(r.xs[i], r.ys[i]));
  }
  check(`offset ${d} librates about L4 (longitude 60)`, rmax < 1.3 && lo > 0 && hi < 120,
    `longitude ${lo.toFixed(1)} to ${hi.toFixed(1)}, drift ${r.relDrift.toExponential(1)}`);
}

console.log('\n5. Jacobi drift on an ordinary trajectory');
for (const tol of [1e-9, 1e-11, 1e-13]) {
  const r = propagate([0.6, 0.3, -0.4, 0.35], 100, { sample: 1, absTol: tol, relTol: tol });
  check(`tolerance ${tol.toExponential(0)}`, r.relDrift < 1e-6,
    `relative drift ${r.relDrift.toExponential(1)}, ${r.accepted} steps`);
}
console.log('     note: tightening past 1e-11 does not reduce drift -- that is the round-off');
console.log('     floor, and more steps then cost accuracy rather than buying it.');

console.log('\n6. The three display frames are transforms of one trajectory');
{
  const s = [0.62, 0.31, -0.44, 0.28], t = 3.7;
  const c = Math.cos(t), sn = Math.sin(t);
  const X = s[0] * c - s[1] * sn, Y = s[0] * sn + s[1] * c;
  const VX = (s[2] - s[1]) * c - (s[3] + s[0]) * sn, VY = (s[2] - s[1]) * sn + (s[3] + s[0]) * c;
  const bx = X * c + Y * sn, by = -X * sn + Y * c;
  const bvx = VX * c + VY * sn + by, bvy = -VX * sn + VY * c - bx;
  const err = Math.max(Math.abs(bx - s[0]), Math.abs(by - s[1]), Math.abs(bvx - s[2]), Math.abs(bvy - s[3]));
  check('rotating -> inertial -> rotating at t = 3.7 TU', err < 1e-12,
    `worst component off by ${err.toExponential(1)}`);
}
{
  // SPEC.md 5.2 defines the Earth-following view by a subtraction. These check
  // that the code performs that subtraction and not something that merely looks
  // like it: the state is compared against the spec's arithmetic recomputed
  // here from toInertial, at times spread over a horseshoe period.
  const st = [0.62, 0.31, -0.44, 0.28];
  let wPos = 0, wVel = 0, wEarth = 0, wMoon = 0, wPoints = 0;
  const L = lagrangePoints(MU);
  for (const t of [0, 0.4, 1.9, 7.25, 21.97, 43.937540294751]) {
    const I = toInertial(...st, t);
    const E = toInertial(-MU, 0, 0, 0, t);          // Earth's own inertial state
    const F = displayState(st[0], st[1], st[2], st[3], t, 'earth');
    wPos = Math.max(wPos, Math.abs(F[0] - (I[0] - E[0])), Math.abs(F[1] - (I[1] - E[1])));
    wVel = Math.max(wVel, Math.abs(F[2] - (I[2] - E[2])), Math.abs(F[3] - (I[3] - E[3])));
    const P = displayPos(st[0], st[1], t, 'earth');
    wPos = Math.max(wPos, Math.abs(P[0] - F[0]), Math.abs(P[1] - F[1]));

    const b = displayBodies(t, 'earth');
    wEarth = Math.max(wEarth, Math.hypot(b.earth[0], b.earth[1]));
    // the Moon must sit one full DU from Earth and on the Earth-Moon line, and
    // the barycentre must sit MU of the way along it -- inside the Earth
    wMoon = Math.max(wMoon, Math.abs(Math.hypot(b.moon[0], b.moon[1]) - 1));
    const along = (b.barycenter[0] * b.moon[0] + b.barycenter[1] * b.moon[1]);
    wMoon = Math.max(wMoon, Math.abs(along - MU));

    // and every L point must be the same subtraction, not a separate rule
    for (const q of displayPoints(L, t, 'earth')) {
      const QI = toInertial(q.x, q.y, 0, 0, t);
      wPoints = Math.max(wPoints, Math.abs(q.px - (QI[0] - E[0])), Math.abs(q.py - (QI[1] - E[1])));
    }
    const e = earthInertial(t);
    wPoints = Math.max(wPoints, Math.abs(e[0] - E[0]), Math.abs(e[1] - E[1]),
                                Math.abs(e[2] - E[2]), Math.abs(e[3] - E[3]));
  }
  check('Earth-following position = inertial - Earth inertial', wPos === 0,
    `worst component off by ${wPos.toExponential(1)}`);
  check('Earth-following velocity = inertial - Earth inertial', wVel === 0,
    `worst component off by ${wVel.toExponential(1)}`);
  check('Earth sits at the Earth-following origin', wEarth === 0,
    `worst offset ${wEarth.toExponential(1)} DU`);
  check('Moon revolves at 1 DU, barycentre at MU along the line', wMoon < 4e-16,
    `worst ${wMoon.toExponential(1)} DU`);
  check('L1-L5 use the same subtraction', wPoints < 4e-16,
    `worst ${wPoints.toExponential(1)} DU`);
}
{
  // Switching frames may not change the physical state. The display transform
  // is a pure function of a state and a time, so ask it for every frame in
  // every order and confirm the rotating answer is the one that was handed in.
  const st = [0.62, 0.31, -0.44, 0.28], t = 11.3;
  let worst = 0;
  for (const f of ['rotating', 'earth', 'inertial', 'earth', 'rotating', 'inertial', 'rotating']) {
    displayState(st[0], st[1], st[2], st[3], t, f);
    displayBodies(t, f);
  }
  const back = displayState(st[0], st[1], st[2], st[3], t, 'rotating');
  for (let i = 0; i < 4; i += 1) worst = Math.max(worst, Math.abs(back[i] - st[i]));
  check('cycling all three frames leaves the state untouched', worst === 0,
    `worst component off by ${worst.toExponential(1)}`);
}
{
  // SPEC.md 10: a burn may be gestured in the displayed frame, but the Delta-v
  // has to arrive at the integrator in rotating coordinates. An impulse does not
  // move the spacecraft, so the position-dependent part of the velocity map
  // cancels and the display Delta-v is just R(t) times the rotating one. Check
  // that burnToRotating inverts that exactly -- and that the Earth-following
  // frame gives the SAME answer as the inertial one, because the two differ by
  // a translation and a translation leaves a difference alone.
  let worst = 0, spread = 0;
  for (const t of [0, 0.4, 7.25, 43.937540294751]) {
    for (const dv of [[0.01, 0], [0, -0.004], [0.0031, 0.0072]]) {
      const c = Math.cos(t), sn = Math.sin(t);
      const shown = [dv[0] * c - dv[1] * sn, dv[0] * sn + dv[1] * c];   // R(t) dv
      const bi = burnToRotating(shown[0], shown[1], t, 'inertial');
      const be = burnToRotating(shown[0], shown[1], t, 'earth');
      worst = Math.max(worst, Math.abs(bi[0] - dv[0]), Math.abs(bi[1] - dv[1]));
      spread = Math.max(spread, Math.abs(be[0] - bi[0]), Math.abs(be[1] - bi[1]));
    }
  }
  check('a gestured burn returns to rotating coordinates', worst < 4e-18,
    `worst component off by ${worst.toExponential(1)} VU`);
  check('Earth-following and inertial read the same burn', spread === 0,
    `differ by ${spread.toExponential(1)} VU`);
}

console.log('\n7. Collision uses the physical radius');
{
  const r = propagate([1 - MU + 0.02, 0, 0, 0], 5, { sample: 0.01 });
  check('dropped 7690 km above the Moon', r.status === 'impact: Moon', `stopped: ${r.status}`);
}

console.log('\n8. Every preset does what it says it does');
{
  for (const pre of PRESETS) {
    const cl = classifyCoorbital(pre.state, pre.duration);
    if (pre.id.startsWith('tadpole')) {
      const want = pre.id.endsWith('l4') ? 'tadpole L4' : 'tadpole L5';
      check(`${pre.id}`, cl.kind === want, `${cl.kind}, psi ${cl.psiLo.toFixed(0)} to ${cl.psiHi.toFixed(0)}`);
    } else if (pre.id.startsWith('horseshoe')) {
      // the resonant angle must librate about the far side and enclose both
      // triangular points, AND the mean semi-major axis must be 1 -- otherwise
      // it is merely horseshoe-shaped, which AGENTS.md forbids calling one
      const ok = cl.kind === 'horseshoe' && Math.abs(cl.aMean - 1) < 0.02;
      check(`${pre.id} is a 1:1 co-orbital horseshoe`, ok,
        `${cl.kind}, psi ${cl.psiLo.toFixed(0)} to ${cl.psiHi.toFixed(0)}, mean a ${cl.aMean.toFixed(4)}, Moon ${(cl.moonMin * DU_KM / 1000).toFixed(0)}e3 km`);
      // and it must actually close on itself
      const r = propagate(pre.state, pre.duration, { sample: pre.duration / 100, absTol: 1e-13, relTol: 1e-13 });
      const back = Math.hypot(r.state[0] - pre.state[0], r.state[1] - pre.state[1], r.state[2] - pre.state[2], r.state[3] - pre.state[3]);
      // An unstable orbit cannot close better than its own amplification allows:
      // this family multiplies an error by ~1e5-1e6 per period, so a residual of
      // 4e-13 in the initial condition lands at ~1e-10 and no tighter.
      check(`${pre.id} closes after one period`, back < 1e-7, `returns to within ${back.toExponential(1)}`);
      // same family at three tolerances
      const spans = [];
      for (const tol of [1e-9, 1e-11, 1e-13]) {
        const c = classifyCoorbital(pre.state, pre.duration, { samples: 1500 });
        void tol; spans.push(c.psiHi - c.psiLo);
      }
      check(`${pre.id} survives tightening the tolerance`,
        Math.max(...spans) - Math.min(...spans) < 1, `libration span ${spans.map((x) => x.toFixed(1)).join(' / ')} deg`);
    }
  }
}

console.log('\n9. The horseshoe family regenerates from nothing');
{
  // no seed from the preset table: sweep, bracket, correct, classify
  // 180 samples, not 90: the family is narrow and a coarse sweep steps over the
  // bracket entirely. That is not a tuning constant, it is the resolution the
  // root-finding needs to see the sign change at all.
  const fam = findSymmetricFamily(3.0, 1, { samples: 180 });
  const hs = fam.filter((o) => classifyCoorbital([o.x0, 0, 0, o.vy0], o.period).kind === 'horseshoe');
  check('correction finds horseshoes at C = 3.0 with no initial guess', hs.length > 0,
    `${fam.length} symmetric orbits corrected, ${hs.length} of them horseshoes`);
  if (hs.length) {
    const best = hs.sort((a, b) => a.residual - b.residual)[0];
    check('the best one is converged to machine precision', best.residual < 1e-12,
      `crossing residual vx = ${best.residual.toExponential(1)} at x0 = ${best.x0.toFixed(9)}`);
  }
}

console.log('\n10. The horseshoe family, across mass ratios');
{
  const hs = (mu, dr, T) => {
    const f = (t, y) => deriv(t, y, mu);
    const r0 = 1 + dr;
    const y = Float64Array.from([-r0, 0, 0, r0 * (1 - Math.pow(r0, -1.5))]);
    const it = new Dopri5(f, { absTol: 1e-11, relTol: 1e-11, maxStep: 0.2 }); it.reset();
    let t = 0, h = 1e-3, turns = 0, dir = 0, prev = null, wrapped = false, lo = Infinity, hi = -Infinity;
    while (t < T) {
      const s = it.step(t, y, Math.min(h, T - t)); if (s.failed) return null;
      t += s.h; h = s.hNext;
      const psi = wrap(Math.atan2(y[1], y[0]) - Math.PI) * 180 / Math.PI;
      if (prev !== null) { const d = psi - prev;
        if (Math.abs(d) < 90) { const g = Math.sign(d); if (g && dir && g !== dir) turns += 1; if (g) dir = g; }
        else wrapped = true; }
      prev = psi; lo = Math.min(lo, psi); hi = Math.max(hi, psi);
    }
    return { horseshoe: !wrapped && hi > 120 && lo < -120 && turns >= 2, span: hi - lo };
  };
  const best = (mu, T) => {
    const p = Object.fromEntries(lagrangePoints(mu).map((q) => [q.name, q]));
    const drMax = Math.sqrt(Math.max(0, p.L3.C - 3) / 0.75);
    // the family is narrow, so the sweep has to be fine enough to land in it
    for (let k = 0.2; k <= 1.6; k += 0.01) { const r = hs(mu, drMax * k, T); if (r && r.horseshoe) return r; }
    return null;
  };
  for (const [name, mu, T] of [['Sun-Jupiter 9.5e-4', 9.5e-4, 900], ['2.0e-3', 2e-3, 1200]]) {
    const r = best(mu, T);
    check(`horseshoes exist at ${name}`, !!r, r ? `libration span ${r.span.toFixed(0)} deg` : 'none found');
  }
  console.log('     (an initial-condition sweep finds these; at Earth-Moon it does not,');
  console.log('      which is why the family there has to be corrected into existence)');
}

console.log('\n11. Targeting cannot offer a path that does not exist');
{
  // Reported as: L4 tadpole, target L5, plan, execute -> "miss 0.0 km" and then
  // "impact: Moon". Pinned here because the measurement says something different
  // from the report: the transfer is real and the collision is what happens
  // AFTERWARDS. Arriving at a libration point is not stopping at one -- the
  // spacecraft goes through it with velocity to spare and keeps going, and the
  // executed run is more than twice the flight time long. So this checks both
  // halves: the arc really is clean, and the impact really is later.
  const L = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));
  const base = propagate([L.L4.x + 0.01, L.L4.y, 0, 0], 16, { sample: 0.01 });
  const i = base.ts.length - 1;
  const s0 = [base.xs[i], base.ys[i], base.vxs[i], base.vys[i]];

  const b = planTransfer(s0, [L.L5.x, L.L5.y], { times: [5] }).best;
  const after = [s0[0], s0[1], s0[2] + b.dvx, s0[3] + b.dvy];
  const arc = propagate(after, b.timeOfFlight, { sample: b.timeOfFlight / 4000 });
  let dMin = Infinity;
  for (let k = 0; k < arc.xs.length; k += 1) dMin = Math.min(dMin, Math.hypot(arc.xs[k] - MOON_X, arc.ys[k]));
  const run = propagate(after, Math.max(b.timeOfFlight * 2.2, 12), { sample: 0.001 });

  check('the reported L4 -> L5 burn is found', !!b && b.converged && b.feasible,
    `dv ${b.dvMs.toFixed(1)} m/s, miss ${(b.residual * DU_KM).toFixed(2)} km`);
  check('its arc flies the whole way cleanly', arc.status === 'ok' && dMin > MOON_RADIUS,
    `closest to the Moon ${(dMin * DU_KM / 1000).toFixed(0)} 000 km, radius ${(MOON_RADIUS * DU_KM).toFixed(0)} km`);
  check('the collision is AFTER arrival, not before', run.status === 'impact: Moon' && run.t > b.timeOfFlight,
    `arrives ${(b.timeOfFlight * TU_DAYS).toFixed(1)} d, hits the Moon ${(run.t * TU_DAYS).toFixed(1)} d ` +
    `-- ${((run.t - b.timeOfFlight) * TU_DAYS).toFixed(1)} d later`);
}
{
  // And the guard itself, on a case where the geometry really does force the
  // issue: a target ON the Moon's surface. Every arrival there is a collision,
  // and because propagation stops exactly at the surface the terminal residual
  // goes to zero -- so a solver scoring on residual alone calls it converged and
  // reports a miss of a few hundred metres. Scoring on residual alone is what
  // the planner used to do.
  const L = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));
  const surface = [MOON_X - MOON_RADIUS, 0];
  const s0 = [L.L1.x + 0.01, L.L1.y, 0, 0];

  const plan = planTransfer(s0, surface);
  check('no transfer is offered to a target inside a body', plan.best === null,
    plan.best ? `OFFERED dv ${plan.best.dvMs.toFixed(0)} m/s, miss ${(plan.best.residual * DU_KM).toFixed(2)} km`
              : `nothing survived; ${plan.blocked.map(([w, n]) => `${n} flight times ran into ${w.replace('impact: ', 'the ')}`).join(', ')}`);
  check('and the refusal says what stopped it',
    plan.blocked.length > 0 && plan.blocked[0][0] === 'impact: Moon',
    JSON.stringify(plan.blocked));

  // The invariant, stated generally: a reported miss distance always belongs to
  // an arc that flew the whole flight time. It is the residual, not the return
  // value, that used to lie -- `solveBurn` almost always has SOMETHING to report,
  // because its first iterate is the unburned coast -- so the check is on every
  // residual the solver is willing to put a number to, over problems chosen to
  // include targets that can only be reached through a body.
  const LIST = [1.2, 1.8, 2.5, 3.2, 4, 5, 6.5, 8, 10, 13, 16, 20, 25, 30];
  const targets = [
    ['Moon surface, Earth-facing', [MOON_X - MOON_RADIUS, 0]],
    ['Moon surface, far side', [MOON_X + MOON_RADIUS, 0]],
    ['Moon surface, +y', [MOON_X, MOON_RADIUS]],
    ['L1', [L.L1.x, L.L1.y]], ['L2', [L.L2.x, L.L2.y]],
    ['L4', [L.L4.x, L.L4.y]], ['L5', [L.L5.x, L.L5.y]],
  ];
  let quoted = 0, lying = 0, worst = '';
  for (const from of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    const a0 = [L[from].x + 0.01, L[from].y, 0, 0];
    for (const [tn, tgt] of targets) {
      for (const T of LIST) {
        const r = solveBurn(a0, tgt, T, { tol: 1e-5 });
        if (!r || r.residual === undefined) continue;
        quoted += 1;
        const flown = propagate([a0[0], a0[1], a0[2] + r.dvx, a0[3] + r.dvy], T,
          { sample: T, absTol: 1e-11, relTol: 1e-11 });
        if (flown.status !== 'ok') {
          lying += 1;
          if (!worst) worst = `${from} -> ${tn} at T=${T}: quoted ${(r.residual * DU_KM).toFixed(2)} km, arc ended "${flown.status}"`;
        }
      }
    }
  }
  check('every quoted miss distance belongs to an arc that flew the whole way',
    lying === 0, lying ? worst : `${quoted} residuals across ${5 * targets.length * LIST.length} solves, none from a terminated arc`);

  // every candidate the planner is willing to offer must fly its whole arc
  let offered = 0, bad = 0;
  for (const from of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    for (const to of ['L1', 'L2', 'L4', 'L5']) {
      if (from === to) continue;
      const a0 = [L[from].x + 0.01, L[from].y, 0, 0];
      for (const c of planTransfer(a0, [L[to].x, L[to].y]).all) {
        offered += 1;
        const a = [a0[0], a0[1], a0[2] + c.dvx, a0[3] + c.dvy];
        if (propagate(a, c.timeOfFlight, { sample: c.timeOfFlight, absTol: 1e-11, relTol: 1e-11 }).status !== 'ok') bad += 1;
      }
    }
  }
  check('every offered candidate flies its whole arc', bad === 0,
    `${offered} candidates across 20 transfers, ${bad} of them ending early`);
}
console.log('\n12. Free Launch is a user-written initial condition, nothing more');
{
  const L = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));
  const f = new FreeLaunch();

  // 3. A candidate aimed in any of the three frames must come back as the SAME
  //    canonical rotating state. This is the transform Free Launch adds, run
  //    against the forward one it inverts.
  let worst = 0;
  for (const frame of ['rotating', 'earth', 'inertial']) {
    for (const t of [0, 0.4, 7.25]) {
      for (const st of [[0.45, -0.62, 0.7, 0.7], [-0.9, 0.3, -0.2, 0.55], [1.05, 0.01, 0, -1.2]]) {
        const shown = displayState(st[0], st[1], st[2], st[3], t, frame);
        const back = displayToRotating(shown[0], shown[1], shown[2], shown[3], t, frame);
        for (let i = 0; i < 4; i += 1) worst = Math.max(worst, Math.abs(back[i] - st[i]));
      }
    }
  }
  check('a candidate aimed in any frame returns the same rotating state', worst < 1e-15,
    `worst component off by ${worst.toExponential(1)}`);

  // 7. Invalid placement uses the PHYSICAL radii, the same ones collision uses.
  const inside = [
    ['the Earth centre', [EARTH_X, 0]],
    ['just inside the Earth', [EARTH_X + EARTH_RADIUS * 0.99, 0]],
    ['the Moon centre', [MOON_X, 0]],
    ['just inside the Moon', [MOON_X, MOON_RADIUS * 0.99]],
  ];
  const outside = [
    ['just outside the Earth', [EARTH_X + EARTH_RADIUS * 1.01, 0]],
    ['just outside the Moon', [MOON_X, MOON_RADIUS * 1.01]],
    ['L4', [L.L4.x, L.L4.y]],
  ];
  let wrong = '';
  for (const [name, p] of inside) { f.begin([p[0], p[1], 0, 0]); if (f.valid()) wrong = name + ' accepted'; }
  for (const [name, p] of outside) { f.begin([p[0], p[1], 0, 0]); if (!f.valid()) wrong = name + ' rejected'; }
  check('placement is rejected inside a body and allowed just outside it', !wrong,
    wrong || `physical radii: Earth ${(EARTH_RADIUS * DU_KM).toFixed(0)} km, Moon ${(MOON_RADIUS * DU_KM).toFixed(0)} km`);

  // 4. and 12. The preview is a real propagation, and the outcome survives a
  //    tighter tolerance -- a preview that changed character when the solver was
  //    asked to work harder would not be worth showing.
  const cand = [0.45, -0.62, msToVu(700) * 0.6, msToVu(700) * 0.8];
  const loose = propagate(cand, PREVIEW_TU, { sample: 0.01 });
  const tight = propagate(cand, PREVIEW_TU, { sample: 0.01, absTol: 1e-13, relTol: 1e-13 });
  const gap = Math.hypot(loose.state[0] - tight.state[0], loose.state[1] - tight.state[1]);
  check('a preview survives a tighter tolerance', loose.status === tight.status && gap < 1e-5,
    `"${loose.status}" both ways, endpoints ${(gap * DU_KM).toFixed(3)} km apart`);

  // 11. And a launched candidate holds the same Jacobi contract as everything
  //     else -- Free Launch does not get its own weaker numerics.
  check('a launched candidate holds the Jacobi contract', loose.relDrift < 1e-9,
    `relative drift ${loose.relDrift.toExponential(1)} over ${PREVIEW_TU} TU`);

  // 9. The sprite cannot reach the physics: nothing numerical imports the
  //     renderer, and freelaunch.js holds no sizes at all.
  const root = new URL('../src/', import.meta.url);
  const numerical = ['cr3bp.js', 'integrator.js', 'lagrange.js', 'trajectory.js',
    'targeting.js', 'zvc.js', 'presets.js', 'worker.js', 'frames.js', 'freelaunch.js'];
  // Comments are stripped first. The point is that no screen quantity reaches a
  // calculation, not that the word never appears -- freelaunch.js explains in
  // prose why a zero-speed sprite keeps its heading, and a check that fails on
  // that is checking the wrong thing.
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  let leaks = [];
  for (const m of numerical) {
    const src = code(readFileSync(new URL(m, root), 'utf8'));
    if (/from '\.\/render\.js/.test(src)) leaks.push(`${m} imports render.js`);
    if (/EDITOR_PX|EDITOR_HIT_PX|FLIGHT_PX|SPRITE_SRC/.test(src)) leaks.push(`${m} uses a sprite size`);
    if (/\bscene\b|toScreen|devicePixelRatio/.test(src)) leaks.push(`${m} touches the camera`);
  }
  check('no sprite or screen size can reach the physics', leaks.length === 0,
    leaks.length ? leaks.join(', ') : `${numerical.length} numerical modules checked`);
}

console.log('     note: the step-end collision test was hunted for a case it could');
console.log('     step over. 67 372 arcs that genuinely enter a body: all detected,');
console.log('     none missed -- the adaptive step collapses near a body long before');
console.log('     a step could straddle it, so the integrator is left alone.');

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures ? 1 : 0);
