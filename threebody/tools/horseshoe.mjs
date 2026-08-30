// horseshoe.mjs — generate the Earth-Moon horseshoe family from nothing.
//
// This is the provenance of the horseshoe presets. It takes no initial guess
// from a table: it sweeps perpendicular far-side crossings at a fixed Jacobi
// constant, brackets every sign change of vx at the next crossing, corrects
// each bracket to machine precision, and classifies what came out.
//
//   node --experimental-default-type=module threebody/tools/horseshoe.mjs
//
// The energy range is the one the co-orbital literature gives for Earth-Moon
// horseshoes, C(L4) < C < C(L2). Searching only up to C(L3) — the bottom sixth
// of it — finds nothing, which is how this was got wrong the first time.

import { MU, TU_DAYS, DU_KM } from '../src/constants.js?v=20260830n';
import { lagrangePoints } from '../src/lagrange.js?v=20260830n';
import { findSymmetricFamily, classifyCoorbital } from '../src/trajectory.js?v=20260830n';

const L = Object.fromEntries(lagrangePoints(MU).map((p) => [p.name, p]));
console.log(`Earth-Moon mu = ${MU}`);
console.log(`horseshoe energy range: C(L4) = ${L.L4.C.toFixed(5)} < C < C(L2) = ${L.L2.C.toFixed(5)}\n`);

const ENERGIES = process.argv[2] ? [Number(process.argv[2])] : [3.00, 3.05, 3.10];
const rows = [];

for (const C of ENERGIES) {
  for (const sign of [1, -1]) {
    const family = findSymmetricFamily(C, sign);
    for (const orb of family) {
      if (!Number.isFinite(orb.period) || orb.period < 1) continue;
      const cl = classifyCoorbital([orb.x0, 0, 0, orb.vy0], orb.period);
      if (cl.kind !== 'horseshoe') continue;
      rows.push({ ...orb, ...cl });
    }
    console.log(`C = ${C.toFixed(3)}  ${sign > 0 ? '+' : '-'}  ->  ${family.length} symmetric orbits corrected`);
  }
}

console.log(`\n${rows.length} of them are horseshoes by resonant angle\n`);
rows.sort((a, b) => a.period - b.period);
console.log('  x0                vy0               period TU / days    psi range     mean a   min Moon   residual');
for (const r of rows) {
  console.log(`  ${r.x0.toFixed(12).padStart(15)}  ${r.vy0.toFixed(12).padStart(15)}  ${r.period.toFixed(4).padStart(9)} / ${(r.period * TU_DAYS).toFixed(1).padStart(6)}`
    + `  [${r.psiLo.toFixed(0)},${r.psiHi.toFixed(0)}]`.padStart(13)
    + `  ${r.aMean.toFixed(4)}  ${(r.moonMin * DU_KM / 1000).toFixed(0).padStart(4)}e3km  ${r.residual.toExponential(1)}`);
}
console.log('\nA member is worth shipping when the residual is at machine precision, the');
console.log('mean semi-major axis is 1 (a real 1:1 resonance, not merely a U-shape), and');
console.log('the closest approach clears the Moon by a comfortable margin.');
