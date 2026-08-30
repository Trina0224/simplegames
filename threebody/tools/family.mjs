// family.mjs — regenerates src/family3d.js, the halo families the slider browses.
//
//   node --experimental-default-type=module threebody/tools/family.mjs > threebody/src/family3d.js
//
// Every member is corrected by the same machinery as the presets, and every
// number written out is measured from the propagator afterwards. Nothing here is
// hand-picked: that is the point of a family browser rather than a list.

import { writeFileSync } from 'node:fs';
import { MU, DU_KM, TU_DAYS } from '../src/constants.js?v=20260830k';
import { haloBranch, lunarGeometry, closure } from '../src/halo.js?v=20260830k';

const WANT = 34;          // members kept per branch, evenly spaced along it
const out = {};

for (const point of ['L1', 'L2']) {
  const branch = haloBranch(point, { steps: 400 });
  const pick = [];
  for (let i = 0; i < WANT; i += 1) {
    const j = Math.round((i * (branch.length - 1)) / (WANT - 1));
    if (!pick.length || pick[pick.length - 1] !== j) pick.push(j);
  }
  out[point] = pick.map((j) => {
    const m = branch[j];
    const g = lunarGeometry(m);
    const c = closure(m);
    return {
      state: m.state, period: m.period, C: m.C, residual: m.residual,
      hold: m.hold, closure: c.error, drift: c.run.relDrift,
      zMaxKm: +(g.zMax * DU_KM).toFixed(0),
      periluneKm: +(g.perilune * DU_KM).toFixed(0),
      apoluneKm: +(g.apolune * DU_KM).toFixed(0),
      slenderness: +g.slenderness.toFixed(3),
    };
  });
  console.error(`${point}: ${branch.length} corrected, ${out[point].length} kept, `
    + `perilune ${out[point][0].periluneKm} -> ${out[point][out[point].length - 1].periluneKm} km`);
}

const member = (m) => '  { state: [' + m.state.map(String).join(', ') + '],'
  + ' period: ' + m.period + ', C: ' + m.C + ', residual: ' + m.residual.toExponential(3) + ','
  + " hold: '" + m.hold + "', closure: " + m.closure.toExponential(3) + ', drift: ' + m.drift.toExponential(3) + ','
  + ' zMaxKm: ' + m.zMaxKm + ', periluneKm: ' + m.periluneKm + ', apoluneKm: ' + m.apoluneKm
  + ', slenderness: ' + m.slenderness + ' }';

const head = [
  '// family3d.js -- GENERATED. Do not edit by hand.',
  '//',
  '//   node --experimental-default-type=module threebody/tools/family.mjs',
  '//',
  '// The halo families, corrected member by member from a Richardson seed and',
  '// continued down each branch: holding z0 while the family is a function of it,',
  '// then holding x0 past the fold where it stops being one. THREE_D_SPEC.md 9 asks',
  '// for a family parameter rather than "a collection of unrelated hand-picked',
  '// presets", and this is that -- one continuation, sampled evenly, with every',
  '// number measured from the propagator rather than asserted.',
  '//',
  '// mu = ' + MU + ', integrator tolerance 1e-13 absolute and relative.',
  '',
  'export const FAMILY3D = {',
];
for (const p of ['L1', 'L2']) {
  head.push('  ' + p + ': [');
  head.push(out[p].map((m) => '  ' + member(m)).join(',\n'));
  head.push('  ],');
}
head.push('};', '', "export const FAMILY_POINTS = ['L1', 'L2'];", '');
writeFileSync(new URL('../src/family3d.js?v=20260830k', import.meta.url), head.join('\n'));
console.error('wrote src/family3d.js');
