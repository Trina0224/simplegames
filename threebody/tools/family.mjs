// family.mjs — regenerates src/family3d.js, the halo families the slider browses.
//
//   node --experimental-default-type=module threebody/tools/family.mjs > threebody/src/family3d.js
//
// Every member is corrected by the same machinery as the presets, and every
// number written out is measured from the propagator afterwards. Nothing here is
// hand-picked: that is the point of a family browser rather than a list.

import { writeFileSync } from 'node:fs';
import { MU, DU_KM, TU_DAYS } from '../src/constants.js?v=20260830m';
import { haloBranch, haloArc, lunarGeometry, closure } from '../src/halo.js?v=20260830m';

const WANT = 34;          // members kept per branch, evenly spaced along it
const out = {};

for (const point of ['L1', 'L2']) {
  // Two continuations, one family. The held-component walk gets from the
  // Richardson seed through the first fold; pseudo-arclength takes it from there
  // to the lunar surface, because past the SECOND fold there is no component
  // left to hold. See haloArc in src/halo.js. Measured: L2 stopped at a perilune
  // of 7412 km on the held-component walk alone and reaches the surface with the
  // arclength continuation, passing through Gateway's published geometry on the
  // way.
  const held = haloBranch(point, { steps: 400 });
  const branch = [...held, ...haloArc(held[held.length - 1], held[held.length - 2],
    { ds: 4e-4, steps: 20000 })];

  // Spaced by PERILUNE, not by index. The two continuations do not step at the
  // same rate along the family -- L2 is 64 members by held component and 3023 by
  // arclength -- so an evenly-indexed sample put 33 of 34 members below 7254 km
  // and jumped straight there from 50922 km. The slider is meant to walk the
  // family, and what a reader watches change is how close it comes to the Moon.
  //
  // Geometrically rather than linearly spaced, because the family's interesting
  // half is its deep end: linear spacing in perilune spends half the slider
  // between 50000 and 25000 km, where consecutive members are hard to tell apart.
  const geom = branch.map((m) => lunarGeometry(m));
  const hi = geom[0].perilune, lo = geom[geom.length - 1].perilune;
  const pick = [];
  for (let i = 0; i < WANT; i += 1) {
    const want = hi * Math.pow(lo / hi, i / (WANT - 1));
    let best = 0;
    for (let j = 1; j < geom.length; j += 1) {
      if (Math.abs(geom[j].perilune - want) < Math.abs(geom[best].perilune - want)) best = j;
    }
    if (!pick.length || pick[pick.length - 1] !== best) pick.push(best);
  }
  out[point] = pick.map((j) => {
    const m = branch[j];
    const g = geom[j];
    const c = closure(m);
    return {
      state: m.state, period: m.period, C: m.C, residual: m.residual,
      hold: m.hold, closure: c.error, drift: c.run.relDrift,
      zMaxKm: +(g.zMax * DU_KM).toFixed(0),
      // Three decimals, not none. The family runs down to the lunar surface and
      // its last members clear it by metres: rounded to whole kilometres the
      // deepest one stores 1737 against a radius of 1737.4 and reads as being
      // INSIDE the Moon, which it is not.
      periluneKm: +(g.perilune * DU_KM).toFixed(3),
      apoluneKm: +(g.apolune * DU_KM).toFixed(0),
      slenderness: +g.slenderness.toFixed(3),
    };
  });
  console.error(`${point}: ${held.length} by held component + ${branch.length - held.length} by `
    + `arclength = ${branch.length} corrected, ${out[point].length} kept, `
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
writeFileSync(new URL('../src/family3d.js?v=20260830m', import.meta.url), head.join('\n'));
console.error('wrote src/family3d.js');
