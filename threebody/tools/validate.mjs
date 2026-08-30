// validate.mjs — the numerical validation suite from SPEC.md section 16.
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

import { MU, TU_DAYS, DU_KM } from '../src/constants.js';
import { omega, jacobi, deriv } from '../src/cr3bp.js';
import { lagrangePoints } from '../src/lagrange.js';
import { Dopri5 } from '../src/integrator.js';
import { propagate, toAxisCrossing } from '../src/trajectory.js';

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

console.log('\n6. Rotating -> inertial -> rotating returns the same state');
{
  const s = [0.62, 0.31, -0.44, 0.28], t = 3.7;
  const c = Math.cos(t), sn = Math.sin(t);
  const X = s[0] * c - s[1] * sn, Y = s[0] * sn + s[1] * c;
  const VX = (s[2] - s[1]) * c - (s[3] + s[0]) * sn, VY = (s[2] - s[1]) * sn + (s[3] + s[0]) * c;
  const bx = X * c + Y * sn, by = -X * sn + Y * c;
  const bvx = VX * c + VY * sn + by, bvy = -VX * sn + VY * c - bx;
  const err = Math.max(Math.abs(bx - s[0]), Math.abs(by - s[1]), Math.abs(bvx - s[2]), Math.abs(bvy - s[3]));
  check('round trip at t = 3.7 TU', err < 1e-12, `worst component off by ${err.toExponential(1)}`);
}

console.log('\n7. Collision uses the physical radius');
{
  const r = propagate([1 - MU + 0.02, 0, 0, 0], 5, { sample: 0.01 });
  check('dropped 7690 km above the Moon', r.status === 'impact: Moon', `stopped: ${r.status}`);
}

console.log('\n8. The horseshoe family, across mass ratios');
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
  const em = best(MU, 900);
  check('Earth-Moon 1.215e-2: no horseshoe in this family', !em,
    em ? 'one was found -- update the README' : 'searched the co-orbital window; see README');
}

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures ? 1 : 0);
