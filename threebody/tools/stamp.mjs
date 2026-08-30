// stamp.mjs — puts one version on every local module reference, and checks it.
//
// Safari caches ES modules hard, and GitHub Pages serves them with a lifetime of
// its own. Rainpane cost an afternoon to that once: a bug was fixed, pushed, and
// still reproduced on the device, because the browser was running the old file.
// A `?v=` on every import makes a new build a new URL, so there is nothing to
// serve from the cache.
//
// It has to be EVERY reference, and that is the part worth being careful about.
// Versioning only the entry point buys a worse failure than versioning nothing:
// a fresh app.js next to a cached cr3bp.js is a MIXED build, which behaves like
// neither version and reports the new one. In particular the worker cannot be
// reached from the page's import map -- workers do not get one -- so worker.js
// and everything it imports has to carry the query in the source itself. That is
// why the stamp is written into the files rather than injected by the HTML.
//
// The tools are stamped too, for a different reason: Node treats `x.js` and
// `x.js?v=1` as two modules and would otherwise load the shared ones twice.
//
//   node --experimental-default-type=module threebody/tools/stamp.mjs           # check
//   node --experimental-default-type=module threebody/tools/stamp.mjs 20260901a  # set
//
// Check mode is the one that matters day to day: it fails if any local module
// reference is missing a version or disagrees with the others, which is the
// "bumped eleven files out of twelve" mistake this whole mechanism exists to
// avoid making silently.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Anything that looks like a quoted path to a local module: import specifiers,
// the worker's `new URL`, and the entry point in index.html.
const REF = /(['"])((?:\.{1,2}\/|src\/)[A-Za-z0-9_./-]+\.(?:js|mjs))(\?v=[^'"]*)?\1/g;

// And app.js's own copy of the version, which it compares against the query the
// browser actually used. It is included here for the obvious reason: a stamp
// that the stamper forgets to move is a readout that lies about being cached.
const OWN = /(const STAMP = ')([^']*)(')/g;

const files = [
  'index.html',
  ...readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
  // stamp.mjs is left alone: the patterns above appear in it as data
  ...readdirSync(join(root, 'tools')).filter((f) => f.endsWith('.mjs') && f !== 'stamp.mjs')
    .map((f) => `tools/${f}`),
];

const want = process.argv[2];
if (want && !/^[0-9a-z]+$/.test(want)) {
  console.error(`\nstamp: "${want}" is not a version. Use something like 20260901a.\n`);
  process.exit(2);
}

const seen = new Map();          // version -> [where]
const missing = [];
let changed = 0;

for (const rel of files) {
  const path = join(root, rel);
  const before = readFileSync(path, 'utf8');
  const note = (v, what) => {
    if (v === null || v === '') missing.push(`${rel} -> ${what}`);
    else (seen.get(v) || seen.set(v, []).get(v)).push(`${rel} -> ${what}`);
  };
  const after = before
    .replace(REF, (whole, q, target, query) => {
      if (want) return `${q}${target}?v=${want}${q}`;
      note(query ? query.slice(3) : null, target);
      return whole;
    })
    .replace(OWN, (whole, head, v, tail) => {
      if (want) return `${head}${want}${tail}`;
      note(v, 'its own STAMP');
      return whole;
    });
  if (want && after !== before) { writeFileSync(path, after); changed += 1; }
}

if (want) {
  console.log(`\nstamped ${want} across ${changed} file(s) of ${files.length}\n`);
  process.exit(0);
}

const versions = [...seen.keys()];
if (missing.length) {
  console.log('\nunversioned module references:');
  for (const m of missing) console.log(`  ${m}`);
}
if (versions.length === 1 && !missing.length) {
  const n = [...seen.values()][0].length;
  console.log(`\nok   every local module reference carries ?v=${versions[0]}   (${n} of them, ${files.length} files)\n`);
  process.exit(0);
}
if (versions.length > 1) {
  // Print the odd ones out, not the whole project. When one file is left behind
  // on a bump the useful output is that file's name, and a list of forty-three
  // correct references buries it.
  const byCount = [...seen.entries()].sort((a, b) => b[1].length - a[1].length);
  const [main, count] = [byCount[0][0], byCount[0][1].length];
  console.log('\nMIXED VERSIONS -- a build like this behaves like neither.');
  console.log(`  ?v=${main} on ${count} reference(s), and then:`);
  for (const [v, where] of byCount.slice(1)) for (const w of where) console.log(`    ?v=${v}   ${w}`);
  console.log(`\n  fix with:  node --experimental-default-type=module threebody/tools/stamp.mjs ${main}`);
}
console.log('');
process.exit(1);
