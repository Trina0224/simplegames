// halo.mjs — generates the halo family from nothing, and reports the provenance
// THREE_D_AGENT.md's acceptance list demands.
//
//   node --experimental-default-type=module threebody/tools/halo.mjs
//
// Nothing here is hand-tuned. The Richardson seed lands in the basin, the
// corrector produces the orbit, and continuation produces the family; every
// number below is measured from the propagator afterwards.

import { MU, DU_KM, TU_DAYS, TU_S, VU_KMS } from '../src/constants.js?v=20260830k';
import { lagrangePoints } from '../src/lagrange.js?v=20260830k';
import { richardsonSeed, correctHalo, closure, legendre } from '../src/halo.js?v=20260830k';
import { propagate3 } from '../src/trajectory3d.js?v=20260830k';

const f = (v, n = 12) => (v >= 0 ? ' ' : '') + v.toFixed(n);

for (const point of ['L1', 'L2']) {
  const g = legendre(point, MU);
  console.log(`\n=== Earth-Moon ${point} halo ===`);
  console.log(`  gamma ${g.gamma.toFixed(12)}   c2 ${g.c2.toFixed(9)}  c3 ${g.c3.toFixed(9)}  c4 ${g.c4.toFixed(9)}`);

  const az = 0.02;
  const seed = richardsonSeed(point, az, {});
  console.log(`  Richardson seed  Ax ${(seed.Ax * DU_KM).toFixed(0)} km  Az ${(az * DU_KM).toFixed(0)} km  T ${seed.period.toFixed(6)} TU  lambda ${seed.lambda.toFixed(6)}`);
  console.log(`    [${seed.state.map((v) => f(v)).join(', ')}]`);

  const o = correctHalo(seed.state, {});
  const c = closure(o);
  console.log(`\n  corrected in ${o.iterations} iterations`);
  console.log(`    initial six-state   [${o.state.map((v) => f(v)).join(', ')}]`);
  console.log(`    period              ${o.period.toFixed(12)} TU  = ${(o.period * TU_DAYS).toFixed(6)} days`);
  console.log(`    Jacobi constant     ${o.C.toFixed(12)}`);
  console.log(`    correction residual ${o.residual.toExponential(3)}   (|vx|,|vz| at the half-period crossing)`);
  console.log(`    closure error       ${c.error.toExponential(3)} after one full period`);
  console.log(`    integrator tolerance 1e-13 absolute and relative`);
  console.log(`    Jacobi drift        ${c.run.drift.toExponential(3)} absolute, ${c.run.relDrift.toExponential(3)} relative`);
  console.log(`    steps               ${c.run.accepted} accepted, ${c.run.rejected} rejected`);
  console.log(`    out-of-plane        max |z| ${(c.zMax * DU_KM).toFixed(0)} km`);

  // tolerance study: the topology must not move
  console.log('\n  tightening the integrator:');
  for (const tol of [1e-9, 1e-11, 1e-13, 1e-14]) {
    const oo = correctHalo(seed.state, { absTol: tol, relTol: tol });
    const cc = closure(oo, { absTol: tol, relTol: tol });
    console.log(`    ${tol.toExponential(0)}  T ${oo.period.toFixed(9)}  C ${oo.C.toFixed(9)}  residual ${oo.residual.toExponential(1)}  closure ${cc.error.toExponential(1)}  max|z| ${(cc.zMax * DU_KM).toFixed(0)} km`);
  }

  // continuation: the family, not a hand-picked pair
  console.log('\n  continuation in out-of-plane amplitude:');
  let prev = null;
  for (const a of [0.010, 0.020, 0.030, 0.040, 0.050, 0.060]) {
    const s0 = prev ? [prev.state[0], 0, a, 0, prev.state[4], 0] : (richardsonSeed(point, a, {}) || {}).state;
    if (!s0) { console.log(`    Az ${(a * DU_KM).toFixed(0)} km  no real Ax`); continue; }
    const oo = correctHalo(s0, {});
    if (!oo || !oo.converged) { console.log(`    Az ${(a * DU_KM).toFixed(0).padStart(6)} km  did not converge`); continue; }
    const cc = closure(oo);
    prev = oo;
    console.log(`    Az ${(a * DU_KM).toFixed(0).padStart(6)} km  x0 ${oo.state[0].toFixed(9)}  vy0 ${oo.state[4].toFixed(9)}  T ${oo.period.toFixed(6)}  C ${oo.C.toFixed(9)}  residual ${oo.residual.toExponential(1)}  max|z| ${(cc.zMax * DU_KM).toFixed(0)} km`);
  }

  // the mirror pair
  const north = correctHalo(richardsonSeed(point, az, { northern: true }).state, {});
  const south = correctHalo(richardsonSeed(point, az, { northern: false }).state, {});
  const mirror = Math.max(
    Math.abs(north.state[0] - south.state[0]), Math.abs(north.state[2] + south.state[2]),
    Math.abs(north.state[4] - south.state[4]), Math.abs(north.period - south.period));
  console.log(`\n  northern/southern mirror: states agree with z negated to ${mirror.toExponential(2)}`);
}
