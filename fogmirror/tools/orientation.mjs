// orientation.mjs — does the water run the same way in the world, however the
// display is turned?
//
// This test exists because the first harness written for this bug PASSED while
// the device failed. It did so by assuming what the accelerometer reports in
// landscape and then checking the formula against that assumption — so it was
// testing my belief, not the device. Rainpane's water still ran uphill.
//
// So this one assumes nothing about the sensor convention. It cannot: the
// mapping in _onMotion was verified on a real iPad and nothing headless can
// re-derive it. What it tests instead is the property the bug actually violated,
// which needs no convention at all:
//
//   The sensor reading depends only on how the device is held. The page turns
//   with the display. So for ONE fixed reading, the direction the water is drawn
//   in must rotate by exactly the display rotation -- leaving the direction in
//   the WORLD unchanged. Water does not care which way you are holding your
//   iPad.
//
// That is what broke: the page rotated and the answer did not. It is checked
// here for a phone (natural orientation portrait) and an iPad (natural
// orientation landscape), which report DIFFERENT angles for the same physical
// orientation and are the reason the obvious fix was wrong.
//
//   node --experimental-default-type=module fogmirror/tools/orientation.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
};

// A display: what screen.orientation reports and what shape the viewport is.
// A phone's natural orientation is portrait, an iPad's is landscape, so the
// same physical orientation gives different angles on the two.
const PHONE = [
  ['upright', 0, 400, 800], ['turned left', 90, 800, 400],
  ['upside down', 180, 400, 800], ['turned right', 270, 800, 400],
];
const IPAD = [
  ['upright', 90, 800, 1000], ['turned left', 180, 1000, 800],
  ['upside down', 270, 800, 1000], ['turned right', 0, 1000, 800],
];

// Load the class with a stubbed window, so the real file is under test rather
// than a copy of it.
const src = readFileSync(join(here, '..', 'src', 'orientation.js'), 'utf8');
const make = async (angle, w, h) => {
  globalThis.window = {
    screen: { orientation: { angle, type: h >= w ? 'portrait-primary' : 'landscape-primary' } },
    innerWidth: w, innerHeight: h,
    orientation: undefined,
    DeviceMotionEvent: function () {},
    addEventListener() {}, removeEventListener() {},
  };
  const { GravitySensor } = await import(
    'data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const g = new GravitySensor();
  g.enabled = true;
  return g;
};

const deg = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
const wrap = (a) => (((a % 360) + 360) % 360);

console.log('\nfogmirror: the display rotation\n');

for (const [device, list] of [['phone (natural portrait)', PHONE], ['iPad (natural landscape)', IPAD]]) {
  console.log(`${device}`);

  // 1. In portrait the rotation must be the identity on BOTH devices, because
  //    portrait is the one orientation the frozen mapping was verified in.
  const up = await make(list[0][1], list[0][2], list[0][3]);
  check(`held upright, the frozen mapping is untouched`, up.rotation() === 0,
    `screen.orientation.angle reads ${up.angle()}, turn ${up.rotation()}deg`);

  // 2. One fixed sensor reading, every display orientation. The drawn direction
  //    must turn with the display so that the world direction never moves.
  const RAW = { gx: 0.44, gy: 0.88 };           // some arbitrary tilt, held still
  const world = [];
  for (const [name, angle, w, h] of list) {
    const g = await make(angle, w, h);
    g.gx = RAW.gx; g.gy = RAW.gy;
    const drawn = deg(g.vector());
    // undo the display's own rotation to get back to the world
    world.push([name, wrap(drawn - g.rotation()), drawn, g.rotation()]);
  }
  const spread = Math.max(...world.map((r) => r[1])) - Math.min(...world.map((r) => r[1]));
  check('the same tilt points the same way in the world, in all four orientations',
    spread < 1e-9, world.map(([n, , d, r]) => `${n}: drawn ${d.toFixed(0)}deg (turn ${r})`).join(', '));

  // 3. and the four rotations really are the four quarter turns, not all zero:
  //    a fix that did nothing would pass check 2 as well.
  const turns = new Set(list.map((_, i) => world[i][3]));
  check('and it actually rotates -- all four quarter turns appear',
    turns.size === 4 && [...turns].every((t) => t % 90 === 0),
    `turns seen: ${[...turns].sort((a, b) => a - b).join(', ')}`);
  console.log('');
}

// 4. The failure that started it: rotating by screen.orientation.angle at face
//    value. Shown here to prove the test can tell the two apart -- a test that
//    cannot fail on the old bug is not a test.
{
  const naive = [];
  for (const [, angle, w, h] of IPAD) {
    const g = await make(angle, w, h);
    g.gx = 0.44; g.gy = 0.88;
    naive.push(wrap(deg(g.vector()) - angle));      // as if turn === angle
  }
  const spread = Math.max(...naive) - Math.min(...naive);
  check('rotating by the reported angle instead would fail this test', spread > 1,
    `world direction would wander over ${spread.toFixed(0)}deg on an iPad`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures ? 1 : 0);
