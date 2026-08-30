// stamp.mjs — puts one version on every local module reference, and checks it.
//
// Shared by every app in the repo that ships ES modules. It started in
// threebody/ and moved here the day rainpane was found serving a MIXED build on
// main -- index.html and app.js at ...c, flows.js and impact.js and render.js
// still importing surface.js at ...b, so the same module was fetched twice under
// two URLs and either copy could come from the cache independently. One tool,
// one rule, all three apps.
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
//   node --experimental-default-type=module tools/stamp.mjs                  # check every app
//   node --experimental-default-type=module tools/stamp.mjs threebody        # check one
//   node --experimental-default-type=module tools/stamp.mjs threebody 20260901a   # set one
//
// Check mode is the one that matters day to day: it fails if any local module
// reference is missing a version or disagrees with the others, which is the
// "bumped eleven files out of twelve" mistake this whole mechanism exists to
// avoid making silently.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every app that ships modules. An app is a directory with an index.html and a
// src/; tools/ is optional.
const APPS = ['threebody', 'rainpane', 'fogmirror'];

// Anything that looks like a quoted path to a local module: import specifiers,
// the worker's `new URL`, and the entry point in index.html.
const REF = /(['"])((?:\.{1,2}\/|src\/)[A-Za-z0-9_./-]+\.(?:js|mjs))(\?v=[^'"]*)?\1/g;

// And app.js's own copy of the version, which it compares against the query the
// browser actually used. It is included here for the obvious reason: a stamp
// that the stamper forgets to move is a readout that lies about being cached.
const OWN = /(const STAMP = ')([^']*)(')/g;

const listFiles = (app) => {
  const root = join(repo, app);
  const out = ['index.html'];
  for (const f of readdirSync(join(root, 'src'))) if (f.endsWith('.js')) out.push(`src/${f}`);
  try {
    // stamp.mjs itself is not in any app any more, but keep the guard: the
    // patterns above appear in it as data and must never be rewritten.
    for (const f of readdirSync(join(root, 'tools'))) {
      if (f.endsWith('.mjs') && f !== 'stamp.mjs') out.push(`tools/${f}`);
    }
  } catch (_) { /* no tools/ in this app */ }
  return out;
};

const argApp = process.argv[2] && APPS.includes(process.argv[2]) ? process.argv[2] : null;
const want = argApp ? process.argv[3] : process.argv[2];
if (process.argv[2] && !argApp && !/^[0-9a-z]+$/.test(process.argv[2])) {
  console.error(`\nstamp: "${process.argv[2]}" is neither an app (${APPS.join(', ')}) nor a version.\n`);
  process.exit(2);
}
if (want && !/^[0-9a-z]+$/.test(want)) {
  console.error(`\nstamp: "${want}" is not a version. Use something like 20260901a.\n`);
  process.exit(2);
}
if (want && !argApp) {
  console.error('\nstamp: name the app to stamp -- versions are per app, not per repo.\n');
  process.exit(2);
}

const targets = argApp ? [argApp] : APPS;
let bad = 0;
for (const app of targets) bad += run(app, want) ? 0 : 1;
process.exit(bad ? 1 : 0);

function run(app, want) {
const root = join(repo, app);
const files = listFiles(app);

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
  console.log(`\n${app}: stamped ${want} across ${changed} file(s) of ${files.length}\n`);
  return true;
}

const versions = [...seen.keys()];
if (missing.length) {
  console.log(`\n${app}: unversioned module references:`);
  for (const m of missing) console.log(`  ${m}`);
}
if (versions.length === 1 && !missing.length) {
  const n = [...seen.values()][0].length;
  console.log(`ok    ${app.padEnd(10)} every local module reference carries ?v=${versions[0]}   (${n} of them, ${files.length} files)`);
  return true;
}
if (versions.length > 1) {
  // Print the odd ones out, not the whole project. When one file is left behind
  // on a bump the useful output is that file's name, and a list of forty-three
  // correct references buries it.
  const byCount = [...seen.entries()].sort((a, b) => b[1].length - a[1].length);
  const [main, count] = [byCount[0][0], byCount[0][1].length];
  console.log(`\n${app}: MIXED VERSIONS -- a build like this behaves like neither.`);
  console.log(`  ?v=${main} on ${count} reference(s), and then:`);
  for (const [v, where] of byCount.slice(1)) for (const w of where) console.log(`    ?v=${v}   ${w}`);
  console.log(`\n  fix with:  node --experimental-default-type=module tools/stamp.mjs ${app} ${main}`);
}
console.log('');
return false;
}
