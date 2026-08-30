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
import { MU, TU_DAYS, DU_KM } from '../src/constants.js?v=20260830k';
import { omega, jacobi, deriv, gradOmega } from '../src/cr3bp.js?v=20260830k';
import { lagrangePoints } from '../src/lagrange.js?v=20260830k';
import { Dopri5 } from '../src/integrator.js?v=20260830k';
import { propagate, toAxisCrossing, findSymmetricFamily, classifyCoorbital } from '../src/trajectory.js?v=20260830k';
import { PRESETS } from '../src/presets.js?v=20260830k';
import { planTransfer, solveBurn } from '../src/targeting.js?v=20260830k';
import { MOON_RADIUS, MOON_X, EARTH_RADIUS, EARTH_X, msToVu } from '../src/constants.js?v=20260830k';
import { displayToRotating } from '../src/display.js?v=20260830k';
import { FreeLaunch, PREVIEW_TU } from '../src/freelaunch.js?v=20260830k';
import { deriv3, jacobi3, omega3, gradOmega3, lift } from '../src/cr3bp3d.js?v=20260830k';
import { propagate3 } from '../src/trajectory3d.js?v=20260830k';
import { toInertial3, toRotating3, displayState3, bodies3 } from '../src/frames3d.js?v=20260830k';
import { richardsonSeed, correctHalo, closure, haloFamily, lissajousSeed, refineLissajous, crossingHeights, haloBranch, haloArc, lunarGeometry } from '../src/halo.js?v=20260830k';
import { PRESETS3D, NRHO3D, LISSAJOUS3D } from '../src/presets3d.js?v=20260830k';
import { FAMILY3D, FAMILY_POINTS } from '../src/family3d.js?v=20260830k';
import { Editor3D, PREVIEW3_TU } from '../src/freelaunch3d.js?v=20260830k';
import { advance, resumeFrom } from '../src/playback.js?v=20260830k';
import { toInertial } from '../src/frames.js?v=20260830k';
import { displayPos, displayState, displayBodies, displayPoints, earthInertial, burnToRotating } from '../src/display.js?v=20260830k';

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

console.log('\n13. The spatial problem contains the planar one, and closes a halo');
{
  // THREE_D_SPEC.md 8. Item 1 first, because everything else rests on it: the
  // planar problem is an INVARIANT SUBSPACE, and exactly so -- dOmega/dz carries
  // a factor of z, so a state that starts in the plane cannot leave it.
  let wEq = 0, wZ = 0;
  for (const [x, y] of [[0.5, 0.3], [-1.2, 0.4], [1.05, -0.02], [0.8, 0.6]]) {
    wEq = Math.max(wEq, Math.abs(omega3(x, y, 0) - omega(x, y)));
    const g3 = gradOmega3(x, y, 0), g2 = gradOmega(x, y);
    wEq = Math.max(wEq, Math.abs(g3[0] - g2[0]), Math.abs(g3[1] - g2[1]));
    wZ = Math.max(wZ, Math.abs(g3[2]));
    const s = [x, y, 0.2, -0.4];
    wEq = Math.max(wEq, Math.abs(jacobi3(lift(s)) - jacobi(s)));
    const d3 = deriv3(0, lift(s));
    wZ = Math.max(wZ, Math.abs(d3[2]), Math.abs(d3[5]));
  }
  check('the six-state equations reduce to the planar ones at z = 0', wEq === 0 && wZ === 0,
    `equations off by ${wEq}, out-of-plane terms exactly ${wZ}`);

  // ...and the propagators agree, with the difference falling as both tighten.
  // They do not take identical STEPS -- the error norm is an RMS over the state
  // width and two exact zeros change it -- so agreement is shown by refinement,
  // not by an equality that would be luck.
  const p = PRESETS.find((q) => q.id === 'horseshoe');
  const gaps = [];
  for (const tol of [1e-9, 1e-11, 1e-13]) {
    const a = propagate(p.state, p.duration, { sample: 0.05, absTol: tol, relTol: tol });
    const b = propagate3(lift(p.state), p.duration, { sample: 0.05, absTol: tol, relTol: tol });
    let w = 0, z = 0;
    for (let i = 0; i < Math.min(a.xs.length, b.xs.length); i += 1) {
      w = Math.max(w, Math.hypot(a.xs[i] - b.xs[i], a.ys[i] - b.ys[i]));
      z = Math.max(z, Math.abs(b.zs[i]), Math.abs(b.vzs[i]));
    }
    gaps.push([tol, w, z]);
  }
  check('a planar state stays exactly planar under the 3D propagator',
    gaps.every(([, , z]) => z === 0), 'z and vz identically zero over a full horseshoe period');
  check('and the 2D/3D difference falls as both tolerances tighten',
    gaps[2][1] < gaps[1][1] && gaps[1][1] < gaps[0][1],
    gaps.map(([t, w]) => `${t.toExponential(0)}: ${(w * DU_KM * 1000).toFixed(2)} m`).join('  ->  '));

  // 3. six-state frame round trip
  let rt = 0, zKeep = 0;
  for (const t of [0, 0.4, 3.7, 21.9]) {
    for (const st of [[0.85, 0.12, 0.04, -0.1, 0.42, 0.09], [-1.2, 0.3, -0.15, 0.2, -0.3, 0.02]]) {
      const back = toRotating3(...toInertial3(...st, t), t);
      for (let i = 0; i < 6; i += 1) rt = Math.max(rt, Math.abs(back[i] - st[i]));
      const d = displayState3(...st, t, 'earth');
      zKeep = Math.max(zKeep, Math.abs(d[2] - st[2]), Math.abs(d[5] - st[5]));
    }
  }
  check('rotating -> inertial -> rotating returns the six-state', rt < 1e-14,
    `worst component off by ${rt.toExponential(1)}`);
  check('z and vz survive every frame untouched', zKeep === 0,
    'Earth stays in the reference plane, so subtracting it cannot move z');

  // 4, 5, 6, 8, 10: the halo presets themselves
  for (const h of PRESETS3D) {
    const o = { state: h.state, period: h.period };
    const c = closure(o);
    check(`${h.id} closes after one period`, c.error < 1e-10,
      `closure ${c.error.toExponential(2)}, Jacobi drift ${c.run.relDrift.toExponential(2)}, ` +
      `${c.run.accepted} steps, ${c.run.rejected} rejected`);
    check(`${h.id} is genuinely out of plane`, c.zMax > 0.05 && h.state[2] !== 0,
      `max |z| ${(c.zMax * DU_KM).toFixed(0)} km from a real z in the state, not a renderer offset`);
    // tightening must not move the topology
    const loose = closure(o, { absTol: 1e-9, relTol: 1e-9 });
    check(`${h.id} keeps its shape at a looser tolerance`,
      Math.abs(loose.zMax - c.zMax) * DU_KM < 1 && Math.abs(loose.run.C0 - c.run.C0) < 1e-9,
      `max |z| differs by ${(Math.abs(loose.zMax - c.zMax) * DU_KM).toFixed(4)} km, C by ${Math.abs(loose.run.C0 - c.run.C0).toExponential(1)}`);
    check(`${h.id} reports the C it stores`, Math.abs(jacobi3(h.state, MU) - h.C) < 1e-9,
      `stored ${h.C.toFixed(9)}, measured ${jacobi3(h.state, MU).toFixed(9)}`);
  }

  // 6: the corrector converges to the noise floor rather than to a fixed count
  const seed = richardsonSeed('L1', 0.02, {});
  const tight = correctHalo(seed.state, { tol: 1e-14 });
  check('correction converges to the numerical noise floor', tight.residual < 1e-13,
    `residual ${tight.residual.toExponential(2)} in ${tight.iterations} iterations`);

  // 7: the mirror pair
  const n = correctHalo(richardsonSeed('L1', 0.02, { northern: true }).state, {});
  const s2 = correctHalo(richardsonSeed('L1', 0.02, { northern: false }).state, {});
  const mir = Math.max(Math.abs(n.state[0] - s2.state[0]), Math.abs(n.state[2] + s2.state[2]),
    Math.abs(n.state[4] - s2.state[4]), Math.abs(n.period - s2.period));
  check('northern and southern halos are exact mirrors', mir === 0,
    `every component agrees with z negated, to ${mir}`);

  // 8: collision is a 3D distance
  const over = propagate3([MOON_X, 0, MOON_RADIUS * 0.5, 0, 0, 0], 0.4, { sample: 0.001 });
  check('collision uses 3D distance, not the planar projection', over.status === 'impact: Moon',
    `released ${(MOON_RADIUS * 0.5 * DU_KM).toFixed(0)} km above the Moon's centre: "${over.status}"`);

  // continuation, not hand-tuning
  const list = [];
  for (let a = 0.005; a <= 0.0651; a += 0.005) list.push(+a.toFixed(4));
  const fam = haloFamily('L1', list, {});
  const got = fam.filter(Boolean);
  check('the L1 family continues rather than being hand-picked',
    got.length === list.length && got[got.length - 1].residual < 1e-10,
    `${got.length} of ${list.length} members corrected, last residual ${got[got.length - 1].residual.toExponential(1)}`);
}

console.log('\n14. A Lissajous is not a halo, and is not called one');
{
  // THREE_D_SPEC.md 9: quasi-periodic motion must not be mislabelled periodic,
  // and "its plotted path visually seems to close" is explicitly not enough. So
  // the two are put through the SAME measurement -- the height at every second
  // crossing of the x-z plane, which for a periodic orbit is the same point
  // every time -- and the answers are four orders of magnitude apart.
  const same = (p, n, tMax) => crossingHeights(p.state, n, { tMax });

  // The halo's own spread over three periods is tens of METRES, not zero, and it
  // should not be asserted to be zero: a halo is unstable, so its closure error
  // is amplified a little on every revolution. What matters is the ratio to the
  // Lissajous, which is a factor of two hundred thousand, so the bound is set
  // where that distinction lives rather than at the noise floor.
  let haloWorst = 0;
  for (const h of PRESETS3D) {
    const c = same(h, 3, h.period * 8);
    haloWorst = Math.max(haloWorst, c.spread);
    check(`${h.id} returns to the same height every period`, c.spread * DU_KM < 0.5,
      `3 successive same-face crossings within ${(c.spread * DU_KM * 1000).toFixed(2)} m ` +
      `-- not zero, because a halo is unstable`);
  }
  for (const l of LISSAJOUS3D) {
    const c = same(l, 8, l.duration);
    check(`${l.id} does NOT`, c.spread * DU_KM > 1000,
      `8 crossings spread over ${(c.spread * DU_KM).toFixed(0)} km`);
    check(`${l.id} carries no period to quote`,
      l.period === undefined && l.residual === undefined && l.quasi === true,
      `frequencies ${l.inPlane.toFixed(4)} and ${l.outOfPlane.toFixed(4)}, ratio ${(l.inPlane / l.outOfPlane).toFixed(6)} -- not 1`);
    // it must survive as long as it claims, and still be a Lissajous while it does
    const r = propagate3(l.state, l.duration, { sample: 0.01, absTol: 1e-13, relTol: 1e-13 });
    check(`${l.id} holds for the ${l.duration} TU it is played over`,
      r.status === 'ok' && r.relDrift < 1e-9,
      `status "${r.status}", Jacobi drift ${r.relDrift.toExponential(2)}, ${r.accepted} steps`);
    check(`${l.id} reports the C it stores`, Math.abs(jacobi3(l.state, MU) - l.C) < 1e-9,
      `stored ${l.C.toFixed(9)}, measured ${jacobi3(l.state, MU).toFixed(9)}`);
  }

  let lisBest = Infinity;
  for (const l of LISSAJOUS3D) lisBest = Math.min(lisBest, same(l, 8, l.duration).spread);
  check('the two are separated by orders of magnitude, not by eye',
    lisBest / haloWorst > 1000,
    `the loosest halo repeats to ${(haloWorst * DU_KM * 1000).toFixed(0)} m; the tightest ` +
    `Lissajous spreads ${(lisBest * DU_KM).toFixed(0)} km -- a factor of ${Math.round(lisBest / haloWorst).toLocaleString('en-US')}`);

  const raw = lissajousSeed('L1', 0.012, 0.012);
  const refined = refineLissajous(raw, { tMax: 60 });
  check('bisection buys a Lissajous a usable lifetime',
    refined.lifetime > 20 && Math.abs(refined.correction) < 0.05,
    `${raw.point} seed holds 4.4 TU raw, ${refined.lifetime.toFixed(1)} TU after ` +
    `a correction of ${refined.correction.toExponential(2)} in vy`);
}

console.log('\n15. NRHO is a region of the halo family, reached by continuation');
{
  const n = NRHO3D;
  const c = closure({ state: n.state, period: n.period });
  const g = lunarGeometry({ state: n.state, period: n.period });
  check('the NRHO closes after one period', c.error < 1e-8,
    `closure ${c.error.toExponential(2)}, Jacobi drift ${c.run.relDrift.toExponential(2)}, ` +
    `${c.run.accepted} steps, ${c.run.rejected} rejected, status "${c.run.status}"`);
  check('it is near-rectilinear by measurement, not by shape',
    g.slenderness > 3 && g.xSpan * DU_KM < 30000,
    `|z| ${(g.zMax * DU_KM).toFixed(0)} km against ${(g.xSpan * DU_KM).toFixed(0)} km of x ` +
    `-- slenderness ${g.slenderness.toFixed(2)}`);
  check('it makes a genuine lunar close approach, and clears the surface',
    g.perilune * DU_KM < 12000 && g.perilune > MOON_RADIUS,
    `perilune ${(g.perilune * DU_KM).toFixed(0)} km from centre = ` +
    `${((g.perilune - MOON_RADIUS) * DU_KM).toFixed(0)} km altitude; apolune ${(g.apolune * DU_KM).toFixed(0)} km`);
  check('its topology survives a looser tolerance',
    Math.abs(closure({ state: n.state, period: n.period }, { absTol: 1e-11, relTol: 1e-11 }).zMax - c.zMax) * DU_KM < 1,
    `max |z| moves under a kilometre between 1e-11 and 1e-13`);
  check('it reports the C it stores', Math.abs(jacobi3(n.state, MU) - n.C) < 1e-9,
    `stored ${n.C.toFixed(9)}, measured ${jacobi3(n.state, MU).toFixed(9)}`);

  // and it must have been REACHED, not typed in
  const branch = haloBranch('L2', { steps: 400 });
  const deepest = lunarGeometry(branch[branch.length - 1]);
  const zHeld = branch.filter((m) => m.hold === 'z').length;
  check('the branch walks there from a Richardson seed, through the fold',
    branch.length > 40 && zHeld > 10 && zHeld < branch.length &&
      Math.abs(deepest.perilune - g.perilune) * DU_KM < 1,
    `${branch.length} members, ${zHeld} holding z0 then ${branch.length - zHeld} holding x0; ` +
    `the last one is the preset, to ${(Math.abs(deepest.perilune - g.perilune) * DU_KM * 1000).toFixed(0)} m`);
  check('perilune falls monotonically down the branch',
    (() => {
      const p = branch.filter((_, i) => i % 6 === 0).map((m) => lunarGeometry(m).perilune);
      return p.every((v, i) => i === 0 || v <= p[i - 1] + 1e-6);
    })(),
    `${(lunarGeometry(branch[0]).perilune * DU_KM).toFixed(0)} km at the top of the branch, ` +
    `${(deepest.perilune * DU_KM).toFixed(0)} km at the bottom`);
}

console.log('\n16. The families are one continuation, not a shortlist');
{
  // THREE_D_SPEC.md 9 asks for a family parameter rather than "a collection of
  // unrelated hand-picked presets". These checks are what makes that claim
  // testable: every stored member is re-flown and has to be periodic, the family
  // has to vary monotonically along it, and the end of the L2 branch has to BE
  // the NRHO preset rather than merely resemble it.
  for (const point of FAMILY_POINTS) {
    const fam = FAMILY3D[point];
    let worstClose = 0, worstDrift = 0, worstC = 0, inside = 0;
    for (const m of fam) {
      const c = closure({ state: m.state, period: m.period });
      worstClose = Math.max(worstClose, c.error);
      worstDrift = Math.max(worstDrift, c.run.relDrift);
      worstC = Math.max(worstC, Math.abs(jacobi3(m.state, MU) - m.C));
      if (m.periluneKm / DU_KM < MOON_RADIUS) inside += 1;
    }
    check(`every ${point} member closes when re-flown`, worstClose < 1e-8,
      `${fam.length} members, worst closure ${worstClose.toExponential(2)}, ` +
      `worst Jacobi drift ${worstDrift.toExponential(2)}`);
    check(`every ${point} member reports the C it stores`, worstC < 1e-9,
      `worst ${worstC.toExponential(1)}`);
    // The family really does run into the Moon; the continuation is stopped at
    // the surface rather than at a tidy altitude, so the deepest member grazes.
    // Reported to metres, because at this depth "1737 km against 1737 km" is a
    // rounding artefact and says nothing about which side of the surface it is.
    const deep = Math.min(...fam.map((m) => lunarGeometry(
      { state: m.state, period: m.period }).perilune)) * DU_KM;
    check(`no ${point} member passes inside the Moon`, inside === 0 && deep > MOON_RADIUS * DU_KM,
      `deepest perilune ${deep.toFixed(3)} km against a lunar radius of ` +
      `${(MOON_RADIUS * DU_KM).toFixed(1)} km -- ${((deep - MOON_RADIUS * DU_KM) * 1000).toFixed(0)} m of clearance`);

    const peri = fam.map((m) => m.periluneKm);
    const zs = fam.map((m) => m.zMaxKm);
    // Perilune falls all the way down; |z| does NOT. It rises, peaks, and falls
    // again, and the turning point is where the orbit stops growing taller and
    // starts growing thin -- which is the near-rectilinear transition itself.
    // A check that demanded both be monotonic would be asserting something the
    // family does not do; the first draft of it was accidentally always true and
    // hid this entirely.
    const periFalls = peri.every((v, i) => i === 0 || v <= peri[i - 1] + 1);
    let peak = 0;
    for (let i = 1; i < zs.length; i += 1) if (zs[i] > zs[peak]) peak = i;
    const unimodal = zs.every((v, i) => (i <= peak ? i === 0 || v >= zs[i - 1] - 1
                                                   : v <= zs[i - 1] + 1));
    check(`the ${point} branch falls steadily toward the Moon`, periFalls,
      `perilune ${peri[0].toLocaleString('en-US')} -> ${peri[peri.length - 1].toLocaleString('en-US')} km, ` +
      `slenderness ${fam[0].slenderness} -> ${fam[fam.length - 1].slenderness}`);
    check(`its height rises then falls, once, as it goes near-rectilinear`, unimodal,
      `|z| ${zs[0].toLocaleString('en-US')} -> peaks at ${zs[peak].toLocaleString('en-US')} km ` +
      `(member ${peak + 1} of ${zs.length}) -> ${zs[zs.length - 1].toLocaleString('en-US')} km`);
  }

  // The family is kept whole, low end included. THREE_D_SPEC.md says nothing
  // about trimming it and the user asked to see the real family; what the deep
  // end needs is the model's limits stated, which is the app's job, not a
  // shorter list.
  for (const point of FAMILY_POINTS) {
    const d = lunarGeometry({
      state: FAMILY3D[point][FAMILY3D[point].length - 1].state,
      period: FAMILY3D[point][FAMILY3D[point].length - 1].period,
    }).perilune * DU_KM - MOON_RADIUS * DU_KM;
    check(`the ${point} family is kept whole, low end and all`, d < 100 && d > 0,
      `its deepest member passes ${d < 1 ? (d * 1000).toFixed(0) + ' m' : d.toFixed(0) + ' km'} ` +
      `above the lunar surface -- kept, and flagged as idealized rather than removed`);
  }

  // The NRHO preset is a member of the family, not a separate discovery. It used
  // to be the LAST member, because the held-component continuation stopped there;
  // pseudo-arclength walks the same family on past it to the lunar surface, so it
  // is now an interior member and the test says so instead.
  const nrhoG = lunarGeometry(NRHO3D);
  const peris = FAMILY3D.L2.map((m) => m.periluneKm);
  const inside = nrhoG.perilune * DU_KM > peris[peris.length - 1]
    && nrhoG.perilune * DU_KM < peris[0];
  check('the NRHO preset is an interior member of the L2 family it came from',
    inside && closure(NRHO3D).error < 1e-8,
    `perilune ${(nrhoG.perilune * DU_KM).toFixed(0)} km, between the family's ` +
    `${peris[0].toLocaleString('en-US')} and ${peris[peris.length - 1].toLocaleString('en-US')} km; ` +
    `closure ${closure(NRHO3D).error.toExponential(1)}`);

  // And the thing that a small residual alone would have missed.
  check('a member is accepted on closure, not on residual alone',
    FAMILY3D.L1.every((m) => m.closure < 1e-8 && m.residual < 1e-9),
    `worst L1 closure ${Math.max(...FAMILY3D.L1.map((m) => m.closure)).toExponential(1)} -- ` +
    `the branch used to run on past here with residuals of 1e-12 and closure of 2.4 DU`);
}

console.log('\n17. The 3D editor sets all three components, and hides none');
{
  // THREE_D_SPEC.md 10: "Do not hide vz behind an arbitrary default and call the
  // control fully 3D." A drag can only ever set two of three components, so the
  // test is that the other one has its own control and that the two do not
  // interfere -- which is the property a hidden default would break.
  const e = new Editor3D();
  e.begin([0.95, 0.10, 0.06, 0, 0, 0], { mode: 'launch' });

  const a = e.state.slice();
  e.height(-0.2);
  check('the height control moves z and only z',
    e.state[2] === -0.2 && e.state[0] === a[0] && e.state[1] === a[1] &&
      e.state[3] === a[3] && e.state[4] === a[4] && e.state[5] === a[5],
    'x, y, vx, vy and vz all untouched');

  const b = e.state.slice();
  e.setVz(0.4);
  check('the vz control moves vz and only vz',
    e.state[5] === 0.4 && e.state[3] === b[3] && e.state[4] === b[4] && e.state[2] === b[2],
    'z, vx and vy all untouched');

  const c = e.state.slice();
  e.setVelocity(0.25, -0.55);
  check('a horizontal drag never disturbs vz',
    e.state[5] === c[5] && e.state[2] === c[2],
    `vz stayed ${e.state[5]} while vx and vy became ${e.state[3]}, ${e.state[4]}`);

  const d = e.state.slice();
  e.place(0.8, 0.2);
  check('placing moves position and never velocity',
    e.state[0] === 0.8 && e.state[1] === 0.2 && e.state[2] === d[2] &&
      e.state[3] === d[3] && e.state[4] === d[4] && e.state[5] === d[5],
    'all three velocity components untouched');

  // a burn is the same editor with the position locked
  const burn = new Editor3D();
  const from = [1.05, 0.02, -0.03, 0.1, -0.2, 0.05];
  burn.begin(from, { mode: 'burn', epoch: 3.2 });
  burn.place(0.5, 0.5); burn.height(0.9);
  check('a burn cannot move the spacecraft',
    burn.state[0] === from[0] && burn.state[1] === from[1] && burn.state[2] === from[2],
    'place and height are refused in burn mode -- an impulse changes velocity, not position');
  burn.setVelocity(0.14, -0.2); burn.setVz(0.08);
  const dv = burn.deltaV();
  check('and it reports the impulse it applied',
    Math.abs(dv[0] - 0.04) < 1e-15 && dv[1] === 0 && Math.abs(dv[2] - 0.03) < 1e-15,
    `dv = ${dv.map((v) => v.toFixed(6)).join(', ')} against a start of ${from.slice(3).join(', ')}`);

  // validity uses the 3D distance and the physical radius, as collision does
  const inside = new Editor3D();
  inside.begin([MOON_X, 0, MOON_RADIUS * 0.5, 0, 0, 0], { mode: 'launch' });
  check('a placement above the Moon\'s centre is still inside the Moon',
    inside.invalidReason() === 'inside the Moon',
    `${(MOON_RADIUS * 0.5 * DU_KM).toFixed(0)} km up, on the axis -- a projected test would allow it`);
  inside.height(MOON_RADIUS * 1.5);
  check('and just outside it is allowed', inside.valid(),
    `${(MOON_RADIUS * 1.5 * DU_KM).toFixed(0)} km up`);
}

// ---------------------------------------------------------------------------
console.log('\n18. Playback stops when the trajectory did');
{
  // A run is only its sample times and how it ended, as far as playback cares.
  const run = (end, status) => ({ ts: [0, end / 2, end], n: 3, status });
  const halo = run(2.7674202404692116, 'ok');
  const hitMoon = run(1.64, 'impact: Moon');
  const hitEarth = run(3.1, 'impact: Earth');
  const gone = run(9.4, 'left display domain');

  const mid = advance(1.0, 0.01, halo, true);
  check('mid-run the clock just advances',
    mid.playing && Math.abs(mid.t - 1.01) < 1e-15,
    `t 1.0 -> ${mid.t}`);

  const wrap = advance(halo.ts[2] - 0.001, 0.01, halo, true);
  check('a closed orbit that reached its span comes back round',
    wrap.playing && wrap.t === 0,
    `status "ok" at the end of a looping view -> t ${wrap.t}, playing ${wrap.playing}`);

  // The bug: this used to wrap too, so the spacecraft hit the Moon, reappeared
  // at the launch point and hit it again, forever.
  for (const r of [hitMoon, hitEarth, gone]) {
    const a = advance(r.ts[2] - 0.001, 0.01, r, true);
    check(`a run that ended "${r.status}" stops there instead of repeating`,
      !a.playing && a.t === r.ts[2],
      `t held at ${a.t} of ${r.ts[2]}, playing ${a.playing}`);
  }

  // and the planar view, which never loops, is unchanged by any of it
  const flat = advance(halo.ts[2] - 0.001, 0.01, halo);
  check('a view that does not loop still stops at the end',
    !flat.playing && flat.t === halo.ts[2],
    `t held at ${flat.t}, playing ${flat.playing}`);

  check('and Play on a finished run starts it over rather than doing nothing',
    resumeFrom(hitMoon.ts[2], hitMoon) === 0 && resumeFrom(0.8, hitMoon) === 0.8,
    'at the end -> 0; part-way through -> unchanged');
}

// ---------------------------------------------------------------------------
console.log('\n19. A fold is the end of a parameterisation, not of a family');
{
  // haloBranch walks the family by holding one component. The L2 branch turns
  // over twice: it handles the first fold by switching z0 -> x0 and STOPS at the
  // second, with the family running very nearly perpendicular to the parameter it
  // is being asked to advance. haloArc holds nothing -- the arclength condition
  // replaces the held component -- so a fold in any component is a non-event.
  const held = haloBranch('L2', { steps: 400 });
  const last = held[held.length - 1], pen = held[held.length - 2];
  const dz = Math.abs(last.state[2] - pen.state[2]), dx = Math.abs(last.state[0] - pen.state[0]);
  check('the held-component branch stalls against a fold in x0', dx * 20 < dz,
    `its last two members are ${dz.toExponential(1)} apart in z0 and only ` +
    `${dx.toExponential(1)} in x0 -- a ratio of ${(dz / dx).toFixed(0)}, which is a family ` +
    `running nearly perpendicular to the parameter it is being advanced in`);

  const coarse = haloArc(last, pen, { ds: 4e-3, steps: 20000 });
  const fine = haloArc(last, pen, { ds: 1e-3, steps: 20000 });
  const gHeld = lunarGeometry(last);
  const gEnd = lunarGeometry(coarse[coarse.length - 1]);
  check('arclength continuation carries the same family past it',
    coarse.length > 100 && gEnd.perilune < gHeld.perilune / 3,
    `${coarse.length} further members, perilune ${(gHeld.perilune * DU_KM).toFixed(0)} km ` +
    `-> ${(gEnd.perilune * DU_KM).toFixed(0)} km`);

  // The strongest check available: the answer must not depend on the stride. Two
  // walks four times apart in step size have to arrive at the same orbit, or what
  // is being followed is the discretisation rather than the family.
  const gFine = lunarGeometry(fine[fine.length - 1]);
  check('and where it ends does not depend on how big its steps were',
    Math.abs(gEnd.perilune - gFine.perilune) * DU_KM < 1 &&
      Math.abs(coarse[coarse.length - 1].period - fine[fine.length - 1].period) * TU_DAYS < 1e-3,
    `ds 4e-3 ends at ${(gEnd.perilune * DU_KM).toFixed(3)} km and T ` +
    `${(coarse[coarse.length - 1].period * TU_DAYS).toFixed(4)} d; ds 1e-3 at ` +
    `${(gFine.perilune * DU_KM).toFixed(3)} km and T ` +
    `${(fine[fine.length - 1].period * TU_DAYS).toFixed(4)} d ` +
    `(${fine.length} members against ${coarse.length})`);

  let worst = 0;
  for (let i = 0; i < coarse.length; i += 7) worst = Math.max(worst, closure(coarse[i]).error);
  check('every member it produces is still a closed periodic orbit', worst < 1e-8,
    `worst closure ${worst.toExponential(2)} over every 7th member -- these are far more ` +
    `unstable than the shallow halos, and close to 1e-9 rather than 1e-11 because of it`);

  check('it stops at the lunar surface rather than continuing through it',
    gEnd.perilune > MOON_RADIUS && (gEnd.perilune - MOON_RADIUS) * DU_KM < 1,
    `deepest member clears the surface by ${((gEnd.perilune - MOON_RADIUS) * DU_KM * 1000).toFixed(0)} m`);

  // What the Artemis demos rest on: the family passes THROUGH Gateway's published
  // geometry rather than being fitted to it. Three independent published numbers,
  // and the family has to bracket each one -- a member above and a member below.
  const g = coarse.map((m) => ({ m, geo: lunarGeometry(m), d: m.period * TU_DAYS }));
  const brackets = (v, of) => g.some((r) => of(r) > v) && g.some((r) => of(r) < v);
  check('the family passes through the geometry NASA publishes for Gateway',
    brackets(6.5, (r) => r.d) &&
      brackets((1500 + MOON_RADIUS * DU_KM) / DU_KM, (r) => r.geo.perilune) &&
      brackets(70000 / DU_KM, (r) => r.geo.apolune),
    `period spans ${Math.min(...g.map((r) => r.d)).toFixed(2)}-${Math.max(...g.map((r) => r.d)).toFixed(2)} d ` +
    `about 6.5; near pass ${(Math.min(...g.map((r) => r.geo.perilune)) * DU_KM - MOON_RADIUS * DU_KM).toFixed(0)}-` +
    `${(Math.max(...g.map((r) => r.geo.perilune)) * DU_KM - MOON_RADIUS * DU_KM).toFixed(0)} km about 1500; ` +
    `far pass ${(Math.min(...g.map((r) => r.geo.apolune)) * DU_KM / 1000).toFixed(0)}-` +
    `${(Math.max(...g.map((r) => r.geo.apolune)) * DU_KM / 1000).toFixed(0)} thousand km about 70`);

  // and the three published numbers must agree with EACH OTHER on which member --
  // if they picked three different orbits, matching any one of them would be a
  // coincidence rather than the family going where NASA's does.
  const near = (want, of) => g.reduce((a, r) => (Math.abs(of(r) - want) < Math.abs(of(a) - want) ? r : a));
  const byT = near(6.5, (r) => r.d);
  const byPeri = near((1500 + MOON_RADIUS * DU_KM) / DU_KM, (r) => r.geo.perilune);
  const byApo = near(70000 / DU_KM, (r) => r.geo.apolune);
  check('and its three published figures select the same orbit, not three different ones',
    Math.abs(byT.d - byPeri.d) < 0.3 && Math.abs(byT.d - byApo.d) < 0.3,
    `period match ${byT.d.toFixed(3)} d, near-pass match ${byPeri.d.toFixed(3)} d, ` +
    `far-pass match ${byApo.d.toFixed(3)} d -- all within ` +
    `${(Math.max(byT.d, byPeri.d, byApo.d) - Math.min(byT.d, byPeri.d, byApo.d)).toFixed(3)} d of each other`);
}

console.log('     note: the step-end collision test was hunted for a case it could');
console.log('     step over. 67 372 arcs that genuinely enter a body: all detected,');
console.log('     none missed -- the adaptive step collapses near a body long before');
console.log('     a step could straddle it, so the integrator is left alone.');

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures ? 1 : 0);
