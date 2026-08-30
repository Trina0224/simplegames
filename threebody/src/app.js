// app.js — the clock, the controls, and nothing else.
//
// The division of labour matters here and is the one the spec asks for. The
// worker computes physical states; this file plays back what it has at whatever
// rate the user asked for; render.js draws. Playback speed changes how quickly
// cached states are shown and never touches the integration, so a trajectory
// watched at 5 days a second is the same trajectory watched at one.

import { MU, TU_DAYS, DU_KM, MOON_X, EARTH_X, MOON_RADIUS, MOON_RADIUS_KM, vuToMs, msToVu } from './constants.js?v=20260830n';
import { jacobi } from './cr3bp.js?v=20260830n';
import { lagrangePoints } from './lagrange.js?v=20260830n';
import { propagate } from './trajectory.js?v=20260830n';
import { zeroVelocityCurves } from './zvc.js?v=20260830n';
import { planTransfer } from './targeting.js?v=20260830n';
import { PRESETS, byId } from './presets.js?v=20260830n';
import { Scene } from './render.js?v=20260830n';
import { FRAMES, FRAME_LABEL, displayPos, displayState, displayToRotating, burnToRotating } from './display.js?v=20260830n';
import { FreeLaunch, PREVIEW_TU } from './freelaunch.js?v=20260830n';
import { EDITOR_HIT_PX, spriteHandle } from './render.js?v=20260830n';
import { Scene3D, VIEWS } from './render3d.js?v=20260830n';
import { propagate3 } from './trajectory3d.js?v=20260830n';
import { jacobi3 } from './cr3bp3d.js?v=20260830n';
import { PRESETS3D, NRHO3D, LISSAJOUS3D, ALL3D, byId3d } from './presets3d.js?v=20260830n';
import { FAMILY3D, FAMILY_POINTS } from './family3d.js?v=20260830n';
import { Editor3D, PREVIEW3_TU } from './freelaunch3d.js?v=20260830n';
import { advance, resumeFrom } from './playback.js?v=20260830n';
import { extrema3 } from './events3.js?v=20260830n';
import { ARTEMIS3D, GATEWAY_NRHO, LOW_LUNAR, NASA_REFERENCE, GATEWAY_ON_FAMILY,
         ORION_DEPARTURE } from './artemis.js?v=20260830n';
import { planRendezvous3, targetAt } from './targeting3d.js?v=20260830n';

// The build stamp is compared against this module's own URL rather than simply
// declared, because the thing it is there to catch is the browser having served
// something other than what was published. STAMP is what this file was built as
// and tools/stamp.mjs keeps it in step with every import; the query is what the
// browser actually asked for. When they agree the readout says so in one word.
// When they do not, the readout says that instead of quietly reporting a version
// that is not running -- which is the failure this whole mechanism exists for.
const STAMP = '20260830n';
const LOADED = new URL(import.meta.url).searchParams.get('v');
const BUILD = LOADED === STAMP ? STAMP : `${STAMP} — but loaded as ${LOADED || 'unversioned'}, so the page is cached`;
const POINTS = lagrangePoints(MU);
const el = (id) => document.getElementById(id);
// what the co-orbital region needs; presets that live somewhere smaller say so
const DEFAULT_VIEW = { span: 3.7, centre: [0.06, -0.20] };

const ui = {
  canvas: el('view'), preset: el('preset'), frame: el('frame'), speed: el('speed'),
  play: el('play'), reset: el('reset'), zvc: el('zvc'), vel: el('vel'),
  target: el('target'), plan: el('plan'), execute: el('execute'), fit: el('fit'),
  free: el('free'), launch: el('launch'), cancel: el('cancel'), zeroV: el('zeroV'),
  launchbar: el('launchbar'), aim: el('aim'), hint: document.querySelector('.hint'),
  caution: el('caution'), artemis: el('artemis'), artemisbar: el('artemisbar'),
  artemisRead: el('artemisRead'),
  cmpNrho: el('cmpNrho'), cmpLlo: el('cmpLlo'), cmpBoth: el('cmpBoth'),
  seekNear: el('seekNear'), seekFar: el('seekFar'),
  rendezvousbar: el('rendezvousbar'), planRv: el('planRv'), rvNear: el('rvNear'),
  rvRead: el('rvRead'),
  spatial: el('spatial'), spatialbar: el('spatialbar'), preset3d: el('preset3d'),
  viewTop: el('viewTop'), viewSide: el('viewSide'), viewEnd: el('viewEnd'), viewObl: el('viewObl'),
  plane: el('plane'), track: el('track'),
  familybar: el('familybar'), famSlider: el('famSlider'), famRead: el('famRead'),
  free3: el('free3'), burn3: el('burn3'), launch3: el('launch3'), cancel3: el('cancel3'),
  launch3bar: el('launch3bar'), zSlider: el('zSlider'), vzSlider: el('vzSlider'), aim3: el('aim3'),
  readout: el('readout'), note: el('note'), title: el('title'), blurb: el('blurb'),
  panel: document.querySelector('.controls'),
  diag: el('diag'),
};

// The diagnostics panel folds away on a phone, where it and the blurb and the
// controls together are the entire screen. It is collapsed, never dropped --
// SPEC.md 9 is explicit that they are not to be removed to tidy the small view,
// and one tap is not removal. Forced open again the moment there is room, since
// a `details` that is closed stays closed even where its summary is hidden.
const NARROW = window.matchMedia('(max-width: 640px)');
const foldDiagnostics = (m) => { ui.diag.open = !m.matches; };
foldDiagnostics(NARROW);
NARROW.addEventListener('change', foldDiagnostics);

const scene = new Scene(ui.canvas);
let run = null;        // { xs, ys, ts, n, C0, status, drift }
let clock = 0;         // playback time, in TU
let playing = true;
let speedDaysPerSec = 8;
let frame = 'rotating';
let zvcSegs = null;
let zvcFor = null;
let pending = null;    // a planned burn awaiting Execute
let dragging = null;
let worker = null;
// The framing the current preset asked for. Fit returns to it without touching
// the trajectory: resetting the camera must never cost an integration.
let currentView = { ...DEFAULT_VIEW };

// ---------------------------------------------------------------- free launch
//
// The editor holds ONE candidate, in rotating coordinates, at epoch t = 0. See
// freelaunch.js for why both of those are the way they are. Everything below is
// input handling and preview plumbing; none of it computes a trajectory itself.
const editor = new FreeLaunch();

// How fast a drag makes the spacecraft go: metres per second per screen pixel.
// Screen-space on purpose -- FREE_LAUNCH_SPEC.md asks that zooming must not make
// the same hand gesture mean a radically different speed, and in model units it
// would. Chosen so a comfortable 300 px drag spans 0 to about 1.8 km/s, which
// covers escape, capture and the interesting failures.
const LAUNCH_MS_PER_PX = 6;

// ---------------------------------------------------------------- 3D mode
//
// A second scene over the same canvas, not a second app. THREE_D_SPEC.md 3 is
// that 3D must not destabilise the validated 2D core, so the planar mode keeps
// its own Scene, its own presets and its own run; entering 3D swaps which of the
// two is drawn and which run is playing, and leaves the other exactly as it was.
const scene3d = new Scene3D(ui.canvas);
let spatial = false;
let run3 = null;          // { xs, ys, zs, vxs, vys, vzs, ts, n, ... }
let clock3 = 0;
let preset3 = null;

// The 3D editor, shared by free launch and impulsive burns. See freelaunch3d.js
// for why they are one object.
const ed3 = new Editor3D();
// Metres per second per screen pixel, as in 2D and for the same reason: the same
// gesture must mean the same speed at every zoom. Larger here because a spatial
// sandbox wants lunar-orbit speeds within a comfortable drag.
const LAUNCH3_MS_PER_PX = 8;

// ---------------------------------------------------------------- solving

function makeWorker() {
  try {
    const w = new Worker(new URL('./worker.js?v=20260830n', import.meta.url), { type: 'module' });
    w.onerror = () => { worker = null; };
    return w;
  } catch (_) {
    return null;   // no module workers: fall back to the main thread
  }
}

let jobId = 0;
function integrate(state, duration, onDone) {
  const sample = Math.max(duration / 20000, 0.002);
  const id = ++jobId;
  if (!worker) worker = makeWorker();
  if (worker) {
    const handler = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', handler);
      if (e.data.error) { onDone(null, e.data.error); return; }
      onDone(e.data);
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ id, state, duration, sample, absTol: 1e-11, relTol: 1e-11 });
  } else {
    const r = propagate(state, duration, { sample, absTol: 1e-11, relTol: 1e-11 });
    onDone({ xs: r.xs, ys: r.ys, vxs: r.vxs, vys: r.vys, ts: r.ts, state: r.state, status: r.status, C0: r.C0, C: r.C, drift: r.drift, relDrift: r.relDrift, accepted: r.accepted, rejected: r.rejected });
  }
}

/**
 * What to say under the title once a run has been computed.
 *
 * This exists for a specific confusion. A targeted burn can arrive cleanly and
 * then, still coasting, hit something later -- arriving at a libration point is
 * not stopping there. The note said "miss 0.0 km", the readout said
 * "impact: Moon", and nothing on screen connected the two or said which came
 * first, so it read as a planner that had accepted a colliding transfer. It had
 * not: in the reported case the spacecraft reached L5 at 21.7 days and hit the
 * Moon at 29.7. Arrival and what happens afterwards are two different events, so
 * the note names both, with their times.
 */
function noteFor(label, status, tEnd, arrival) {
  if (!label || status === 'ok' || !Number.isFinite(tEnd)) return label || '';
  const when = `${(tEnd * TU_DAYS).toFixed(1)} d`;
  if (!arrival) return `${label}   ·   ${status} at ${when}`;
  const gap = Math.max(0, tEnd - arrival.t) * TU_DAYS;
  return `${label}   ·   then, still coasting, ${status} at ${when} — ${gap.toFixed(1)} d after arriving`;
}

// ---------------------------------------------------------------- previewing
//
// Dragging the arrow produces a new candidate every frame. Only the newest one
// is worth integrating, so a stale job is ignored rather than queued -- the
// solver's tolerances are never lowered to make the editor feel quick, which
// FREE_LAUNCH_SPEC.md forbids explicitly and which would be trading the one
// thing this app is for against a scroll bar.
let previewToken = 0;
function refreshPreview() {
  if (!editor.active || !editor.dirty || !editor.valid()) return;
  // One in flight at a time. Without this a drag posts a job every frame and
  // the worker -- which is a queue, not a pool -- works through all of them in
  // order, so the preview falls further behind the finger the longer you drag.
  // Holding the newest state and starting it when the last one lands means the
  // work done is bounded by how fast the solver is, not by how fast the pointer
  // moves, and what finally appears is always the state actually being held.
  if (editor.pending) return;
  editor.dirty = false;
  editor.pending = true;
  const token = ++previewToken;
  const state = editor.state.slice();
  integrate(state, PREVIEW_TU, (data, err) => {
    if (token !== previewToken) return;          // a newer candidate won
    editor.pending = false;
    if (err || !data) { editor.preview = null; return; }
    editor.preview = { ...data, n: data.xs.length };
  });
}

/** The candidate's screen position, and the tip of its velocity arrow. */
function editorHandles() {
  const [x, y, vx, vy] = displayState(
    editor.state[0], editor.state[1], editor.state[2], editor.state[3], 0, frame);
  const craft = scene.toScreen(x, y);
  const speed = Math.hypot(vx, vy);
  const tip = speed > 1e-9
    ? scene.toScreen(x + vx * arrowScale(), y + vy * arrowScale())
    : [craft[0] + Math.cos(editor.aim) * 46, craft[1] + Math.sin(editor.aim) * 46];
  return { craft, tip, speed };
}

/**
 * Model units per unit of velocity when drawing the arrow.
 *
 * The arrow has to end where the finger is, at any zoom, or the handle drifts
 * out from under the pointer. So it is the exact inverse of the pixels-to-speed
 * rule: a velocity of v draws an arrow of v / (msPerVu) pixels.
 */
function arrowScale() {
  return vuToMs(1) / LAUNCH_MS_PER_PX / scene.scale;
}

function load(state, duration, label, view, arrival = null) {
  ui.note.textContent = 'integrating…';
  // Stop playing the OLD trajectory while the new one is being computed. Without
  // this the loop runs off the end of the previous run during the gap and pauses
  // itself, so the new preset arrives already stopped at t = 0.
  run = null;
  integrate(state, duration, (data, err) => {
    if (err) { ui.note.textContent = 'integration failed: ' + err; return; }
    run = { ...data, n: data.xs.length, start: state.slice(), duration };
    clock = 0;
    if (view) { currentView = { span: view.span, centre: view.centre.slice() }; scene.setView(view); }
    playing = true;
    ui.play.textContent = 'Pause';
    zvcFor = null;
    pending = null;
    ui.execute.disabled = true;
    ui.note.textContent = noteFor(label, data.status, data.ts[data.ts.length - 1], arrival);
  });
}

// ---------------------------------------------------------------- playback

function stateAt(tu) {
  if (!run || !run.n) return null;
  const ts = run.ts;
  const last = ts[run.n - 1];
  const t = Math.min(tu, last);
  // binary search the sample times; they are uniform but the last one is not
  let lo = 0, hi = run.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  const span = ts[hi] - ts[lo] || 1;
  const f = (t - ts[lo]) / span;
  const x = run.xs[lo] + (run.xs[hi] - run.xs[lo]) * f;
  const y = run.ys[lo] + (run.ys[hi] - run.ys[lo]) * f;
  const vx = run.vxs[lo] + (run.vxs[hi] - run.vxs[lo]) * f;
  const vy = run.vys[lo] + (run.vys[hi] - run.vys[lo]) * f;
  return { t, x, y, vx, vy, index: hi };
}

function frameLoop(ms) {
  requestAnimationFrame(frameLoop);
  const dt = Math.min(0.05, (ms - (frameLoop.last || ms)) / 1000);
  frameLoop.last = ms;
  if (spatial) {
    if (playing && run3) {
      // loop: a 3D preset is a periodic orbit and is meant to keep going round.
      // playback.js decides what "keep going round" may apply to.
      const a = advance(clock3, dt * speedDaysPerSec / TU_DAYS, run3, true);
      clock3 = a.t;
      if (!a.playing) { playing = false; ui.play.textContent = 'Play'; }
    }
    render3();
    return;
  }
  if (playing && run) {
    const a = advance(clock, dt * speedDaysPerSec / TU_DAYS, run);
    clock = a.t;
    if (!a.playing) { playing = false; ui.play.textContent = 'Play'; }
  }
  render();
}

function render() {
  scene.resize();
  const s = stateAt(clock);
  const head = s ? [s.x, s.y, s.vx, s.vy] : null;
  const C = head ? jacobi(head, MU) : null;

  // While a candidate is being edited the zero-velocity curve is ITS boundary,
  // not the running trajectory's -- that is the point of showing it, since the
  // speed you are choosing is what opens and closes the necks. The readout says
  // `candidate` at the same time, so the app never draws one state's boundary
  // while quoting another state's C.
  const editC = editor.active && editor.valid() ? editor.jacobi() : null;
  const forC = editC !== null ? editC : (run ? run.C0 : null);
  if (ui.zvc.checked && forC !== null) {
    const key = forC.toFixed(6);
    if (zvcFor !== key) { zvcSegs = zeroVelocityCurves(forC); zvcFor = key; }
  }

  if (editor.active) refreshPreview();

  // Where the controls panel sits, in canvas pixels, so the scale bar can stay
  // out from under it. Layout only -- the renderer uses it for one corner.
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();

  scene.draw({
    avoid: { left: pr.left - vr.left, top: pr.top - vr.top },
    frame,
    // Pinned to the launch epoch while editing. editorHandles() computes its hit
    // targets at t = 0, so drawing the same candidate at a running clock would
    // put the sprite somewhere the finger cannot reach it.
    t: editor.active ? 0 : clock,
    points: POINTS,
    trail: run && s ? { xs: run.xs, ys: run.ys, ts: run.ts, n: Math.max(2, s.index + 1) } : null,
    // the live marker steps aside while editing: two spacecraft on screen, one
    // of them not the one you are dragging, is a picture nobody can read
    head: editor.active ? null : head,
    zvc: zvcSegs, showZvc: ui.zvc.checked, showVel: ui.vel.checked,
    plan: pending ? pending.path : null,
    burn: dragging,
    edit: editor.active
      ? { state: editor.state, preview: editor.preview, valid: editor.valid(),
          aim: editor.aim, arrowScale: arrowScale() }
      : null,
  });

  if (editor.active) { updateEditorReadout(); return; }

  if (run && s) {
    const drift = Math.abs((C ?? run.C0) - run.C0);
    ui.readout.textContent = [
      `t        ${(clock * TU_DAYS).toFixed(2)} days   (${clock.toFixed(3)} TU)`,
      `position ${s.x.toFixed(5)}, ${s.y.toFixed(5)} DU`,
      `speed    ${vuToMs(Math.hypot(s.vx, s.vy)).toFixed(1)} m/s`,
      `C0       ${run.C0.toFixed(9)}`,
      `C now    ${(C ?? 0).toFixed(9)}`,
      `drift    ${drift.toExponential(2)}   relative ${(drift / Math.max(1, Math.abs(run.C0))).toExponential(2)}`,
      `solver   ${run.accepted} steps, ${run.rejected} rejected   sim drift ${run.relDrift.toExponential(1)}`,
      `frame    ${FRAME_LABEL[frame] || frame}`,
      `status   ${run.status}`,
      `build    ${BUILD}`,
    ].join('\n');
  }
}

/**
 * The readout while a candidate is being edited.
 *
 * Ten lines, the same ten, because FREE_LAUNCH_SPEC.md and SPEC.md 9 both say
 * the diagnostics are not to be thinned out -- and because a candidate deserves
 * the same scrutiny as a run. What changes is that every value says `candidate`,
 * so nothing here can be mistaken for the trajectory still loaded behind it.
 */
function updateEditorReadout() {
  const st = editor.state;
  const why = editor.invalidReason();
  const pv = editor.preview;
  const c = editor.valid() ? editor.jacobi() : null;

  // Two speeds, and they are genuinely different numbers. The chip beside the
  // arrow reports the speed IN THE DISPLAYED FRAME, because that is the thing
  // the drag is setting and the thing the arrow is drawn from -- 1 km/s aimed in
  // the Earth-following view is not 1 km/s of rotating-frame velocity. The
  // readout keeps quoting rotating speed, as it does for a live run, so the two
  // panels stay comparable. Saying "in this frame" on the chip is not decoration.
  const [, , dvx, dvy] = displayState(st[0], st[1], st[2], st[3], 0, frame);
  const shown = vuToMs(Math.hypot(dvx, dvy));
  const speed = vuToMs(Math.hypot(st[2], st[3]));
  const heading = ((Math.atan2(dvy, dvx) * 180 / Math.PI) + 360) % 360;

  ui.aim.textContent = why
    ? why
    : `${shown < 1000 ? shown.toFixed(1) + ' m/s' : (shown / 1000).toFixed(3) + ' km/s'}`
      + `   ${shown > 1e-6 ? heading.toFixed(0) + '°' : '—'} in this frame`;

  ui.readout.textContent = [
    `t        candidate at 0.00 days   (0.000 TU)`,
    `position ${st[0].toFixed(5)}, ${st[1].toFixed(5)} DU   candidate`,
    `speed    ${speed.toFixed(1)} m/s   candidate`,
    `C0       ${c === null ? '   —' : c.toFixed(9)}   candidate`,
    `C now    ${c === null ? '   —' : c.toFixed(9)}   candidate`,
    `drift    —   not launched yet`,
    `solver   ${pv ? `${pv.accepted} steps, ${pv.rejected} rejected   preview ${pv.relDrift.toExponential(1)}` : 'preview pending'}`,
    `frame    ${FRAME_LABEL[frame] || frame}`,
    `status   ${why ? 'INVALID: ' + why : (pv ? `preview over ${PREVIEW_TU} TU: ${pv.status}` : 'previewing…')}`,
    `build    ${BUILD}`,
  ].join('\n');
}

// ---------------------------------------------------------------- 3D playback

// The family entries are not orbits, they are the whole continuation with a
// handle on it -- THREE_D_SPEC.md 9 asks for a family parameter rather than a
// collection of unrelated hand-picked presets, and these are that handle.
const FAMILY_ENTRIES = FAMILY_POINTS.map((p) => ({
  id: `family-${p}`, name: `${p} family — browse`, point: p, family: p,
}));

/**
 * The same L2 continuation, entered from the Artemis side.
 *
 * Not a second family and not a second set of curves: it is FAMILY3D.L2, the
 * data the ordinary slider already browses, with a different framing and the
 * Gateway-like orbit drawn alongside so the reader can watch a small halo turn
 * into the thing NASA is putting a station on. ARTEMIS_DEMO_SPEC.md forbids
 * hand-authored mission curves, and the way to keep that promise is to have no
 * curve of its own at all.
 */
const ARTEMIS_FAMILY = {
  id: 'artemis-family', name: 'Artemis — halo → NRHO family',
  point: 'L2', family: 'L2', artemisFamily: true,
};

/** One member of a continued family, dressed as something load3 can play. */
function familyMember(point, i, artemis = false) {
  const list = FAMILY3D[point];
  const idx = Math.max(0, Math.min(list.length - 1, i));
  const m = list[idx];
  const atGateway = artemis && point === GATEWAY_ON_FAMILY.point && idx === GATEWAY_ON_FAMILY.index;
  return {
    ...m,
    id: artemis ? 'artemis-family' : `family-${point}`,
    name: artemis
      ? `Artemis — halo → NRHO, member ${idx + 1} of ${list.length}`
      : `${point} family, member ${idx + 1} of ${list.length}`,
    family: point, index: idx, artemisFamily: artemis, atGateway,
    duration: m.period * 3,
    blurb: artemis
      ? 'One continuation, not a shortlist, and not a set of mission curves. Drag the '
        + 'slider and watch a small halo around L2 grow, lean over and go '
        + 'near-rectilinear — the Gateway-like orbit is drawn alongside, and the family '
        + 'passes through it on the way down. Nothing here was drawn to look like a '
        + 'NASA diagram; it is the corrector walked from a Richardson seed to the '
        + 'lunar surface.'
      : 'One continuation, not a shortlist. Every member here was corrected from '
        + 'the one before it, and the slider walks the family from a small halo down to '
        + 'a near-rectilinear orbit that all but grazes the Moon.',
    expect: `|z| ${m.zMaxKm.toLocaleString('en-US')} km, perilune ${Math.round(m.periluneKm).toLocaleString('en-US')} km, `
      + `slenderness ${m.slenderness.toFixed(2)}`,
  };
}

/**
 * An altitude above the lunar surface, in the unit that says what it is.
 *
 * The family now continues to the surface itself, and its deepest members clear
 * it by single metres. Rounded to whole kilometres those read "0 km over the
 * Moon", which is not a small altitude -- it is no altitude at all.
 */
function altText(km) {
  if (km < 1) return `${(km * 1000).toFixed(0)} m over the Moon`;
  return `${km.toFixed(0)} km over the Moon`;
}

/**
 * The closest the run actually gets to each body, measured from the propagated
 * samples rather than taken from a stored field.
 *
 * Measured, because a stored perilune is a claim about a state and this is a
 * claim about the trajectory on screen -- and once 3D Free Launch exists there
 * will be runs with no stored anything.
 */
function closest3(run) {
  let moon = Infinity, earth = Infinity;
  const at = (x, y, z) => {
    const dm = Math.hypot(x - MOON_X, y, z);
    const de = Math.hypot(x - EARTH_X, y, z);
    if (dm < moon) moon = dm;
    if (de < earth) earth = de;
  };
  for (let i = 0; i < run.xs.length; i += 1) at(run.xs[i], run.ys[i], run.zs[i]);
  // The samples stop at the last multiple of the sample stride; the run does
  // not. An arc that ends inside the Moon breaks mid-step, and that final state
  // is exactly where it came closest. Reading the samples alone reported
  // "closest 2379 km over the Moon" beside a status line saying "impact: Moon"
  // -- a distance measured past the event that ended the run, which is the same
  // defect RESEARCH.md records for the planar miss distance.
  if (run.state) at(run.state[0], run.state[1], run.state[2]);
  return { moon, earth, moonAltKm: (moon - MOON_RADIUS) * DU_KM };
}

/**
 * How to name a run's closest approach in one readout column.
 *
 * A run that hit says it hit. An altitude for such a run is at best zero and at
 * worst negative, and either would read as a flyby.
 */
function closestLabel3(run, near) {
  if (run.status === 'impact: Moon') return 'hit the Moon';
  if (run.status === 'impact: Earth') return 'hit the Earth';
  if (!near || !(near.moonAltKm < 1e5)) return 'not near the Moon';
  return altText(near.moonAltKm) + (near.moonAltKm < LOW_LUNAR_KM ? '   (idealized)' : '');
}

// The altitude below which the model's own limits are worth stating outright.
const LOW_LUNAR_KM = 100;

/**
 * Say what the model does not contain, when it starts to matter.
 *
 * The deep end of the L1 family passes 51 km above the lunar surface. That is a
 * true member of the continued family and it is kept -- the family is not
 * trimmed for presentation -- but at that altitude the difference between this
 * and a real orbit stops being academic, so the page says so rather than letting
 * the number stand unqualified.
 */
function updateCaution(run) {
  const c = closest3(run);
  // A run that went BELOW the surface did not fly a low orbit; it crashed, and
  // the status line already says so. The caution is for an orbit low enough that
  // the model's omissions start to matter, not for a hole in the Moon.
  const low = c.moonAltKm >= 0 && c.moonAltKm < LOW_LUNAR_KM;
  ui.caution.hidden = !low;
  if (low) {
    ui.caution.textContent =
      `Closest approach ${c.moonAltKm < 1 ? (c.moonAltKm * 1000).toFixed(0) + ' m' : c.moonAltKm.toFixed(0) + ' km'} above the Moon. This is an idealized `
      + `CR3BP result: the Moon is a point mass here, and lunar mascons, nonspherical `
      + `gravity and terrain are not modeled. A real orbit this low would not behave `
      + `like this and would not stay.`;
  }
  return c;
}

// --- Artemis mission context -------------------------------------------------
//
// The one rule ARTEMIS_DEMO_SPEC.md returns to over and over: a published
// program figure and a measured one must never be mistakable for each other.
// So they are never in the same sentence, never in the same typeface, and the
// measured line always says where it came from.

/** The LLO comparison run, propagated once and kept while it is being shown. */
let lloRun = null;

/**
 * The Gateway-like orbit, drawn as a reference beside something else.
 *
 * One propagation, reused: it is the same stored state every time and nothing
 * about the view changes it, so re-integrating it per frame would be work for
 * no answer.
 */
let gatewayRef = null;
function gatewayReference() {
  if (!gatewayRef) {
    const r = propagate3(GATEWAY_NRHO.state, GATEWAY_NRHO.period,
      { sample: GATEWAY_NRHO.period / 4000, absTol: 1e-13, relTol: 1e-13 });
    gatewayRef = { ...r, n: r.xs.length };
  }
  return gatewayRef;
}

/**
 * Which of the two orbits the comparison is about.
 *
 * A checkbox could not carry this. The honest picture -- both orbits, one scale
 * -- is unwatchable: a 100 km lunar orbit is 3474 km across against the NRHO's
 * 141 000 km, so it draws as a two-pixel dot. That is TRUE and it teaches nothing.
 * Rather than shrink one or inflate the other, each gets a view where it is
 * legible, and `both` shows the wide orbit whole with a magnified bubble over the
 * Moon. Nothing is rescaled; the same arrays are drawn twice at two scales, and
 * the magnification is printed on the bubble.
 */
let cmpMode = 'nrho';          // 'nrho' | 'llo' | 'both'
const INSET_R = 92;            // radius of the magnified bubble, in CSS pixels
// Wide enough to hold the low orbit with room round it. Fixed rather than fitted
// so the magnification factor printed on the bubble stays a stable number.
const INSET_SPAN = 0.022;      // DU across the bubble -- about 8 500 km

/**
 * Go to one end of the orbit and frame it.
 *
 * The camera matters as much as the clock here. Seeking to perilune on a view
 * fitted to a 141 000 km orbit puts the spacecraft on top of a three-pixel Moon;
 * seeking to apolune on a view fitted to the Moon puts it off the screen. So each
 * event gets a span chosen from the event itself -- the distance to the Moon at
 * that instant -- rather than a fixed one.
 */
function seekPass(which) {
  if (!run3) return;
  const pass = extrema3(run3);
  clock3 = pass[which];
  playing = false; ui.play.textContent = 'Play';
  const km = which === 'near' ? pass.lowKm : pass.highKm;
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  // Centred between the Moon and the spacecraft, spanning enough to hold both
  // with room -- so a near pass shows the Moon as a disc and a far pass shows how
  // far out it is against the Moon still in frame.
  const st = state3At(clock3);
  const centre = st
    ? [(MOON_X + st.s[0]) / 2, st.s[1] / 2, st.s[2] / 2]
    : [MOON_X, 0, 0];
  const span = Math.max(4 * MOON_RADIUS, (km / DU_KM) * 2.6) * (vr.height / usable);
  scene3d.setView({ ...VIEWS.oblique, span, centre });
  liftAbovePanel();
  updatePassRead(which, pass);
}

/** What the event actually is: how far, when, and where in three components. */
function updatePassRead(which, pass) {
  const st = state3At(clock3);
  if (!st) return;
  const km = which === 'near' ? pass.lowKm : pass.highKm;
  const phase = run3 && preset3 && preset3.period ? (clock3 % preset3.period) / preset3.period : 0;
  ui.artemisRead.textContent =
    `${which === 'near' ? 'near pass' : 'far pass'}   `
    + `${altText(km - MOON_RADIUS_KM)}   `
    + `${(km / 1000).toFixed(1)} thousand km from centre   `
    + `t ${(clock3 * TU_DAYS).toFixed(2)} d (phase ${(phase * 100).toFixed(0)}%)   `
    + `at ${st.s[0].toFixed(4)}, ${st.s[1].toFixed(4)}, ${st.s[2].toFixed(4)} DU   `
    + `${vuToMs(Math.hypot(st.s[3], st.s[4], st.s[5])).toFixed(0)} m/s`;
}

function updateArtemis(p, run) {
  const fam = !!(p && p.artemisFamily);
  const rv = !!(p && p.rendezvous);
  const on = !!(p && (p.artemis || p.capstone));
  ui.artemis.hidden = !(on || fam || rv);
  ui.artemisbar.hidden = !on;
  ui.rendezvousbar.hidden = !rv;
  if (fam) { lloRun = null; return updateFamilyContext(p); }
  if (rv) { lloRun = null; return updateRendezvousContext(p); }
  if (!on) { lloRun = null; return; }

  const ref = p.capstone ? NASA_REFERENCE.capstone : NASA_REFERENCE.gateway;
  const m = p.measured;
  const pass = extrema3(run);
  // Measured from the run on screen, not read back out of the stored record --
  // the stored figures come from one period and this is three, so if they ever
  // disagreed it would be visible here rather than hidden behind a field name.
  const L = LOW_LUNAR.measured;
  ui.artemisRead.textContent = cmpMode === 'nrho'
    ? `near ${(pass.lowKm - MOON_RADIUS_KM).toFixed(0)} km   `
      + `far ${(pass.highKm / 1000).toFixed(1)} thousand km   ${(p.period * TU_DAYS).toFixed(2)} d`
    // The scale contrast, in the two units a reader can hold at once: how long
    // each goes round in, and how many times one does it while the other does it
    // once. Both measured -- the ratio is the periods divided, not a round number.
    : `LLO ${L.periodHours.toFixed(2)} h/orbit   `
      + `NRHO ${(p.period * TU_DAYS).toFixed(2)} d/orbit   `
      + `${L.revsPerGateway.toFixed(0)} LLO revolutions to one NRHO`;

  ui.artemis.innerHTML = '';
  const line = (label, text, sim) => {
    const b = document.createElement('b');
    b.textContent = label + ' ';
    const span = document.createElement('span');
    if (sim) span.className = 'sim';
    span.textContent = text;
    ui.artemis.appendChild(b);
    ui.artemis.appendChild(span);
    ui.artemis.appendChild(document.createTextNode('\n'));
  };
  line('simulated CR3BP member', `${m.periodDays.toFixed(3)} d   `
    + `near pass ${m.nearKm.toFixed(0)} km   far pass ${m.apoluneKm.toFixed(0)} km`, true);
  line(p.capstone ? 'NASA CAPSTONE reference' : 'NASA Gateway reference',
    `about ${ref.periodDays} d, about ${ref.nearKm.toLocaleString('en-US')} km at the near pass `
    + `and about ${ref.farKm.toLocaleString('en-US')} km at the far one`);
  ui.artemis.appendChild(document.createTextNode(
    'Earth–Moon CR3BP educational model; the mission context is real, the trajectory is '
    + 'not an operational ephemeris. This member was selected from the continued halo '
    + 'family by period — it was not shaped to match the reference figures.'));

  if (cmpMode !== 'nrho') {
    // Same integrator, same equations, same frame -- so the comparison is one
    // model throughout and needs no "illustration only" label. Sampled finely:
    // at 79 revolutions per NRHO period a coarse sample draws a spirograph
    // instead of an orbit.
    const r = propagate3(LOW_LUNAR.state, p.duration,
      { sample: p.duration / 24000, absTol: 1e-13, relTol: 1e-13 });
    lloRun = { ...r, n: r.xs.length };
  } else lloRun = null;
}

/**
 * The Artemis family view's own context line.
 *
 * It says where on the family the slider is, and -- when it reaches the member
 * nearest the Gateway-like orbit -- that it has, along with how near "nearest"
 * is. The two are 30 samples of 3087 apart, so calling them the same orbit would
 * be a small lie for no gain.
 */
function updateFamilyContext(p) {
  const g = GATEWAY_ON_FAMILY;
  ui.artemis.innerHTML = '';
  const line = (label, text, sim) => {
    const b = document.createElement('b');
    b.textContent = label + ' ';
    const span = document.createElement('span');
    if (sim) span.className = 'sim';
    span.textContent = text;
    ui.artemis.appendChild(b); ui.artemis.appendChild(span);
    ui.artemis.appendChild(document.createTextNode('\n'));
  };
  line('this member', `${(p.period * TU_DAYS).toFixed(3)} d   `
    + `near pass ${altText(p.periluneKm - MOON_RADIUS_KM)}   `
    + `|z| ${p.zMaxKm.toLocaleString('en-US')} km   slenderness ${p.slenderness.toFixed(2)}`, true);
  line('Gateway-like member', `${GATEWAY_NRHO.measured.periodDays.toFixed(3)} d   `
    + `near pass ${GATEWAY_NRHO.measured.nearKm.toFixed(0)} km   `
    + `drawn in amber, member ${g.index + 1} of ${g.of} is the closest the slider comes`, true);
  ui.artemis.appendChild(document.createTextNode(p.atGateway
    ? 'This is that member — it differs from the Gateway-like orbit by '
      + `${g.periodGapDays.toFixed(3)} d and ${g.periluneGapKm.toFixed(0)} km, because the slider samples `
      + `${g.of} of the family's 3 087 members. The two are neighbours on one continuation, not the same orbit.`
    : 'Earth–Moon CR3BP educational model. Every member was corrected from the one '
      + 'before it; none was drawn, adjusted or chosen to resemble a diagram.'));
  ui.famRead.classList.toggle('hit', !!p.atGateway);
}

// --- the Orion approach ------------------------------------------------------
//
// ARTEMIS_DEMO_SPEC.md E: a CONCEPT demonstration, not a reconstruction of an
// Artemis IV operational trajectory, and the point it exists to make is that the
// destination is a state in motion. Gateway keeps going round its NRHO while
// Orion crosses; the arrival condition compares the two states at the same
// future instant, never Orion's position against where Gateway is now.

/** The epoch the approach departs at, on Gateway's clock. */
let rvEpoch = 0;
/** The live re-solve, when the reader has asked for one. */
let rvLive = null;

function updateRendezvousContext(p) {
  const sol = rvLive || p.solution;
  ui.artemis.innerHTML = '';
  const line = (label, text, sim) => {
    const b = document.createElement('b');
    b.textContent = label + ' ';
    const span = document.createElement('span');
    if (sim) span.className = 'sim';
    span.textContent = text;
    ui.artemis.appendChild(b); ui.artemis.appendChild(span);
    ui.artemis.appendChild(document.createTextNode('\n'));
  };
  // The four numbers the spec asks for, plus the word they earn. Relative speed
  // is quoted BEFORE the arrival burn, because that is the number that says
  // whether the approach is a rendezvous or a fly-past: after the burn it is
  // zero by construction and would say nothing.
  line(sol.kind === 'rendezvous' ? 'rendezvous — position and velocity matched'
                                 : 'intercept — position only',
    `relative position ${(sol.posErr * DU_KM * 1000).toFixed(1)} m   `
    + `relative speed at arrival ${vuToMs(sol.relSpeedBefore).toFixed(1)} m/s, `
    + `${vuToMs(sol.relSpeedAfter).toExponential(1)} m/s after the arrival burn`, true);
  line('the two burns', `${vuToMs(sol.dv1Mag).toFixed(1)} m/s departure + `
    + `${vuToMs(sol.dv2Mag).toFixed(1)} m/s arrival = ${vuToMs(sol.dvTotal).toFixed(1)} m/s   `
    + `over ${(sol.timeOfFlight * TU_DAYS).toFixed(2)} days   status ${sol.status}`, true);
  ui.artemis.appendChild(document.createTextNode(
    'Earth–Moon CR3BP educational concept, not an Artemis IV trajectory. Gateway is '
    + 'targeted where it WILL be at arrival, not where it is at departure — that is '
    + 'what makes this a moving-target problem rather than aiming at a marker.'));

  ui.rvRead.textContent = `${sol.kind}   `
    + `${vuToMs(sol.dvTotal).toFixed(0)} m/s   ${(sol.timeOfFlight * TU_DAYS).toFixed(2)} d   `
    + `miss ${(sol.posErr * DU_KM * 1000).toFixed(1)} m`;
}

/**
 * Show an approach: the arc Orion actually flies, with Gateway still moving.
 *
 * `run3` becomes the POST-BURN arc -- the departure state with the solved
 * impulse added, propagated for the flight time and no longer. Playing past the
 * arrival would show Orion sailing through Gateway, which is exactly what the
 * arrival burn exists to prevent, so the run stops when the approach does.
 */
function loadRendezvous(sol) {
  const d = ORION_DEPARTURE.state;
  const departed = [d[0], d[1], d[2], d[3] + sol.dv1[0], d[4] + sol.dv1[1], d[5] + sol.dv1[2]];
  const T = sol.timeOfFlight;
  const r = propagate3(departed, T, { sample: T / 6000, absTol: 1e-13, relTol: 1e-13 });
  run3 = { ...r, n: r.xs.length };
  run3.closest = updateCaution(r);
  clock3 = 0;
  playing = true; ui.play.textContent = 'Pause';
  updateRendezvousContext(preset3);
  fitApproach();
}

/** Frame the whole approach: Earth end, Moon end, and Gateway's orbit. */
function fitApproach() {
  if (!run3) return;
  const g = gatewayReference();
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const src of [run3, g]) {
    for (const [a, col] of [[0, src.xs], [1, src.ys], [2, src.zs]]) {
      for (const v of col) { if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    }
  }
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  scene3d.setView({ ...VIEWS.oblique, span: extent * 1.35 * (vr.height / usable), centre });
  liftAbovePanel();
}

/** And frame the moment it is about: the two states, side by side. */
function fitArrival() {
  if (!run3) return;
  const sol = rvLive || (preset3 && preset3.solution);
  if (!sol) return;
  const goal = targetAt(GATEWAY_NRHO, rvEpoch + sol.timeOfFlight);
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  // Wide enough to hold the arrival point and the Moon, so "it arrived AT
  // Gateway" is checkable against something rather than a dot in empty space.
  const d = Math.hypot(goal[0] - MOON_X, goal[1], goal[2]);
  scene3d.setView({ ...VIEWS.oblique, span: Math.max(4 * MOON_RADIUS, d * 2.8) * (vr.height / usable),
                    centre: [(goal[0] + MOON_X) / 2, goal[1] / 2, goal[2] / 2] });
  liftAbovePanel();
}

/** Frame the low lunar orbit: the Moon, filling the view. */
function fitLlo() {
  const r = LOW_LUNAR.state[0] - MOON_X;             // the orbit's own radius
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  scene3d.setView({ ...VIEWS.oblique, span: r * 5.2 * (vr.height / usable),
                    centre: [MOON_X, 0, 0] });
  liftAbovePanel();
}

function setCmpMode(mode) {
  cmpMode = mode;
  for (const [b, m] of [[ui.cmpNrho, 'nrho'], [ui.cmpLlo, 'llo'], [ui.cmpBoth, 'both']]) {
    b.setAttribute('aria-pressed', String(m === mode));
  }
  if (!preset3 || !run3) return;
  updateArtemis(preset3, run3);
  if (mode === 'llo') fitLlo(); else fitSpatial();
}

function load3(p) {
  if (p && p.family && p.index === undefined) {
    // an entry from the menu: start at whatever the slider is showing
    ui.familybar.hidden = false;
    ui.famSlider.max = String(FAMILY3D[p.family].length - 1);
    load3(familyMember(p.family, Number(ui.famSlider.value), !!p.artemisFamily));
    return;
  }
  ui.familybar.hidden = !(p && p.family);
  preset3 = p;
  ui.title.textContent = p.name;
  ui.blurb.textContent = p.blurb;
  ui.note.textContent = 'integrating…';
  if (p.rendezvous) {
    // Not a periodic orbit and not a free launch: an arc with a start, an end
    // and a reason. It gets its own loader because "three periods" means nothing
    // here and the run must stop at arrival.
    rvEpoch = p.epoch; rvLive = null;
    ui.artemis.hidden = false; ui.artemisbar.hidden = true; ui.rendezvousbar.hidden = false;
    loadRendezvous(p.solution);
    ui.note.textContent = p.expect ? 'expect: ' + p.expect : '';
    return;
  }
  // Three periods, so the orbit is seen to CLOSE rather than merely to be drawn
  // once. A halo that did not repeat would be obvious here.
  const r = propagate3(p.state, p.duration, { sample: p.duration / 6000, absTol: 1e-13, relTol: 1e-13 });
  run3 = { ...r, n: r.xs.length };
  run3.closest = updateCaution(r);
  updateArtemis(p, r);
  clock3 = 0;
  playing = true;
  ui.play.textContent = 'Pause';
  ui.note.textContent = p.expect ? 'expect: ' + p.expect : '';
  if (p.family) {
    // altitude, not distance from the centre: "1 788 km from the Moon" sounds
    // roomy and "51 km above it" does not, and the second one is the one that
    // tells you what you are looking at.
    const alt = p.periluneKm - MOON_RADIUS_KM;
    ui.famRead.textContent = `|z| ${p.zMaxKm.toLocaleString('en-US')} km   `
      + `${altText(alt)}   ${(p.period * TU_DAYS).toFixed(2)} d`;
  }
  fitSpatial();
}

// One tap to each end of the orbit. ARTEMIS_DEMO_SPEC.md F: seek the extrema
// MEASURED from the trajectory on screen, never a predetermined timestamp --
// which also means these keep working when the family member changes.
for (const [btn, which] of [[ui.seekNear, 'near'], [ui.seekFar, 'far']]) {
  btn.addEventListener('click', () => seekPass(which));
}
for (const [btn, mode] of [[ui.cmpNrho, 'nrho'], [ui.cmpLlo, 'llo'], [ui.cmpBoth, 'both']]) {
  btn.addEventListener('click', () => setCmpMode(mode));
}

// Re-derive the approach on screen, live, rather than trusting the stored one.
// The scan is about two seconds -- fourteen flight times, each a damped Newton
// on a finite-difference Jacobian, each residual a full propagation -- so it goes
// behind a button and says so, instead of freezing the page on load.
ui.planRv.addEventListener('click', () => {
  if (!preset3 || !preset3.rendezvous) return;
  ui.planRv.disabled = true;
  ui.rvRead.textContent = 'solving — fourteen flight times…';
  setTimeout(() => {
    const plan = planRendezvous3(ORION_DEPARTURE.state, rvEpoch, GATEWAY_NRHO);
    ui.planRv.disabled = false;
    if (!plan.best) {
      ui.rvRead.textContent = 'no flight time in the scan reached it'
        + (plan.blocked.length ? `  (${plan.blocked.map(([w, n]) => `${n}x ${w}`).join(', ')})` : '');
      return;
    }
    rvLive = plan.best;
    loadRendezvous(plan.best);
    ui.note.textContent = `expect: ${plan.all.length} of ${plan.tried} flight times converged; `
      + `cheapest ${vuToMs(plan.best.dvTotal).toFixed(0)} m/s`;
  }, 0);
});

// The arrival is the moment the demo is about, so it gets its own seek.
ui.rvNear.addEventListener('click', () => {
  if (!run3 || !preset3 || !preset3.rendezvous) return;
  clock3 = run3.ts[run3.n - 1];
  playing = false; ui.play.textContent = 'Play';
  fitArrival();
});

ui.famSlider.addEventListener('input', () => {
  if (!preset3 || !preset3.family) return;
  load3(familyMember(preset3.family, Number(ui.famSlider.value), !!preset3.artemisFamily));
});

/** Frame the orbit from its own extent, so a bigger halo is not cropped. */
function fitSpatial() {
  if (!run3) { scene3d.setView({ ...VIEWS.oblique, span: 1.6, centre: [0.9, 0, 0] }); return; }
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const cols = [run3.xs, run3.ys, run3.zs];
  for (let a = 0; a < 3; a += 1) {
    for (const v of cols[a]) { if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  }
  // include the Moon, so the orbit is always seen in its place rather than alone
  lo[0] = Math.min(lo[0], MOON_X - 0.04); hi[0] = Math.max(hi[0], MOON_X + 0.04);
  // An Artemis demo makes a claim about L1 and L2 -- that the orbit is NOT parked
  // at one of them -- so the frame has to contain them for the claim to be
  // checkable. Without this the default fit cropped L2 out of the picture while
  // the blurb said it was drawn.
  if (preset3 && (preset3.artemis || preset3.capstone)) {
    for (const n of ['L1', 'L2']) {
      const q = POINTS.find((v) => v.name === n);
      if (q) { lo[0] = Math.min(lo[0], q.x - 0.02); hi[0] = Math.max(hi[0], q.x + 0.02); }
    }
  }
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  // The controls panel covers the bottom of the canvas, so the usable height is
  // not the canvas height. Fitting to the whole canvas puts a third of the orbit
  // behind the panel, which is a fit that does not fit.
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  scene3d.setView({ ...VIEWS.oblique, span: extent * 1.9 * (vr.height / usable), centre });
  // ...and then slide the scene up into the band that is actually visible.
  // Scaling the span alone makes the orbit small enough to fit but still centres
  // it on the canvas, which is half behind the panel.
  liftAbovePanel();
}

/**
 * Slide the scene up into the band the controls panel does not cover.
 *
 * Every 3D fit needs this and each one used to do it itself, which is how the
 * comparison views got written without it and framed the Moon behind the panel.
 */
function liftAbovePanel() {
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  scene3d.resize();
  scene3d.panByPixels(0, -(vr.height / 2 - usable / 2));
}

function state3At(t) {
  if (!run3 || run3.n < 2) return null;
  const ts = run3.ts;
  const last = ts[run3.n - 1];
  const u = Math.max(0, Math.min(last, t));
  let lo = 0, hi = run3.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= u) lo = m; else hi = m; }
  const span = ts[hi] - ts[lo] || 1;
  const f = (u - ts[lo]) / span;
  const at = (a) => a[lo] + (a[hi] - a[lo]) * f;
  return { t: u, index: hi,
    s: [at(run3.xs), at(run3.ys), at(run3.zs), at(run3.vxs), at(run3.vys), at(run3.vzs)] };
}

let preview3Token = 0;
function refreshPreview3() {
  if (!ed3.active || !ed3.dirty || !ed3.valid() || ed3.pending) return;
  ed3.dirty = false;
  ed3.pending = true;
  const token = ++preview3Token;
  const state = ed3.state.slice();
  // Synchronous, like the family slider: a 12 TU 3D preview is a few thousand
  // steps and lands in a handful of milliseconds. The worker is still 4-state
  // and giving it a six-state job is a bigger change than this needs.
  setTimeout(() => {
    if (token !== preview3Token) return;
    const r = propagate3(state, PREVIEW3_TU, { sample: PREVIEW3_TU / 3000, absTol: 1e-12, relTol: 1e-12 });
    ed3.pending = false;
    ed3.preview = { ...r, n: r.xs.length };
  }, 0);
}

function arrow3Scale() {
  return vuToMs(1) / LAUNCH3_MS_PER_PX / scene3d.scale;
}

const KM = (v) => (v * DU_KM).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Ten lines again, every value labelled as a candidate. */
function updateEditor3Readout() {
  const s = ed3.state;
  const why = ed3.invalidReason();
  const pv = ed3.preview;
  const c = ed3.valid() ? ed3.jacobi() : null;
  const speed = vuToMs(Math.hypot(s[3], s[4], s[5]));
  const dv = ed3.deltaV();
  const dvMs = vuToMs(Math.hypot(dv[0], dv[1], dv[2]));
  const near = pv ? closest3(pv) : null;

  ui.aim3.textContent = why
    ? why
    : (ed3.mode === 'burn'
        ? `Δv ${dvMs < 1000 ? dvMs.toFixed(1) + ' m/s' : (dvMs / 1000).toFixed(3) + ' km/s'}`
        : `${speed < 1000 ? speed.toFixed(1) + ' m/s' : (speed / 1000).toFixed(3) + ' km/s'}`)
      + `   z ${KM(s[2])} km   vz ${vuToMs(s[5]).toFixed(0)} m/s`;

  ui.readout.textContent = [
    `t        candidate at ${(ed3.epoch * TU_DAYS).toFixed(2)} days   (${ed3.epoch.toFixed(3)} TU)`,
    `position ${s[0].toFixed(5)}, ${s[1].toFixed(5)}, ${s[2].toFixed(5)} DU   candidate`,
    `speed    ${speed.toFixed(1)} m/s   vz ${vuToMs(s[5]).toFixed(1)}   candidate`,
    `closest  ${pv ? closestLabel3(pv, near) : '—'}`,
    `C0       ${c === null ? '   —' : c.toFixed(9)}   candidate`,
    `C now    ${c === null ? '   —' : c.toFixed(9)}   candidate`,
    ed3.mode === 'burn'
      ? `Δv       ${dvMs.toFixed(1)} m/s   ${dv.map((v) => vuToMs(v).toFixed(1)).join(', ')}`
      : `drift    —   not launched yet`,
    `solver   ${pv ? `${pv.accepted} steps, ${pv.rejected} rejected   preview ${pv.relDrift.toExponential(1)}` : 'preview pending'}`,
    `status   ${why ? 'INVALID: ' + why : (pv ? `preview over ${PREVIEW3_TU} TU: ${pv.status}` : 'previewing…')}`,
    `build    ${BUILD}`,
  ].join('\n');
  if (near) {
    const low = near.moonAltKm < LOW_LUNAR_KM;
    ui.caution.hidden = !low;
    if (low) {
      ui.caution.textContent = `This candidate passes ${near.moonAltKm.toFixed(0)} km above the Moon. `
        + `Idealized CR3BP: the Moon is a point mass here, and lunar mascons, nonspherical `
        + `gravity and terrain are not modeled.`;
    }
  }
}

/**
 * The second curve on screen, whatever it is this view.
 *
 * There is only ever one, and it is always amber and dashed against the
 * trajectory's solid blue, so "the other one" means the same thing in every
 * Artemis view: the low lunar orbit in the comparison, the Gateway-like orbit
 * beside the family and beside the approach.
 */
function compareLayer() {
  if (lloRun) return { run: lloRun, label: '100 km lunar orbit', head: lloAt(clock3) };
  if (preset3 && (preset3.artemisFamily || preset3.rendezvous)) {
    const g = gatewayReference();
    return { run: g, label: 'Gateway-like NRHO',
             head: preset3.rendezvous ? targetAt(GATEWAY_NRHO, rvEpoch + clock3) : null };
  }
  return null;
}

/**
 * The magnified bubble, when there is something in it worth magnifying.
 *
 * Only in `both`: `nrho` has no second orbit and `llo` is already framed on the
 * Moon, so a bubble there would magnify what is already large.
 */
function insetView() {
  if (cmpMode !== 'both' || !lloRun || !run3) return null;
  const st = state3At(clock3);
  const times = scene3d.span / INSET_SPAN;
  // Bottom right of the band the controls do not cover. The first placement was
  // the top right, which is where the diagnostics panel lives -- the bubble was
  // drawn correctly and entirely behind it.
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const floor = Math.max(2 * INSET_R + 40, pr.top - vr.top - 16);
  return {
    centre: [MOON_X, 0, 0], span: INSET_SPAN, radius: INSET_R,
    at: [scene3d.w - INSET_R - 20, floor - INSET_R - 26],
    paths: [
      { run: run3, color: 'rgba(150, 222, 255, 0.55)', width: 1.4 },
      { run: lloRun, color: 'rgba(255, 196, 92, 0.95)', width: 1.6, dash: [5, 3] },
    ],
    marks: [
      st ? { at: st.s, color: 'rgba(190, 236, 255, 0.95)', r: 3 } : null,
      { at: lloAt(clock3), color: 'rgba(255, 214, 130, 0.95)', r: 3 },
    ].filter(Boolean),
    label: `×${times < 10 ? times.toFixed(1) : times.toFixed(0)} on the Moon`,
  };
}

/** Where the comparison orbit is at the same instant, by the same interpolation. */
function lloAt(t) {
  if (!lloRun) return null;
  const ts = lloRun.ts;
  if (t <= ts[0]) return [lloRun.xs[0], lloRun.ys[0], lloRun.zs[0]];
  if (t >= ts[lloRun.n - 1]) t = ts[lloRun.n - 1];
  let lo = 0, hi = lloRun.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  const f = (t - ts[lo]) / Math.max(1e-15, ts[hi] - ts[lo]);
  return [lloRun.xs[lo] + (lloRun.xs[hi] - lloRun.xs[lo]) * f,
          lloRun.ys[lo] + (lloRun.ys[hi] - lloRun.ys[lo]) * f,
          lloRun.zs[lo] + (lloRun.zs[hi] - lloRun.zs[lo]) * f];
}

function render3() {
  scene3d.resize();
  const st = state3At(clock3);
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  scene3d.draw({
    avoid: { left: pr.left - vr.left, top: pr.top - vr.top },
    frame, t: clock3, points: POINTS,
    trail: run3 && st ? { xs: run3.xs, ys: run3.ys, zs: run3.zs, ts: run3.ts,
                          n: Math.max(2, st.index + 1) } : null,
    whole: run3 ? { xs: run3.xs, ys: run3.ys, zs: run3.zs, ts: run3.ts, n: run3.n } : null,
    head: st ? st.s : null,
    compare: compareLayer(),
    inset: insetView(),
    showPlane: ui.plane.checked, showTrack: ui.track.checked,
    sprite: spriteHandle(),
    edit: ed3.active
      ? { state: ed3.state, preview: ed3.preview, valid: ed3.valid(),
          aim: ed3.aim, arrowScale: arrow3Scale() }
      : null,
  });

  if (ed3.active) { refreshPreview3(); updateEditor3Readout(); return; }
  if (!run3 || !st) return;
  const near3 = run3.closest || { moonAltKm: Infinity };
  const C = jacobi3(st.s, MU);
  const drift = Math.abs(C - run3.C0);
  ui.readout.textContent = [
    `t        ${(clock3 * TU_DAYS).toFixed(2)} days   (${clock3.toFixed(3)} TU)`,
    `position ${st.s[0].toFixed(5)}, ${st.s[1].toFixed(5)}, ${st.s[2].toFixed(5)} DU`,
    `speed    ${vuToMs(Math.hypot(st.s[3], st.s[4], st.s[5])).toFixed(1)} m/s   z ${(st.s[2] * DU_KM).toFixed(0)} km`,
    // Terse: the caution panel carries the full statement, and a readout line
    // that wraps past 53 characters costs a whole extra row for a word.
    `closest  ${closestLabel3(run3, near3)}`,
    `C0       ${run3.C0.toFixed(9)}`,
    `C now    ${C.toFixed(9)}`,
    // Two drifts, and they are different measurements. `drift` is computed from
    // the state being DISPLAYED, which is interpolated between samples, so it
    // carries that interpolation's own error -- about 1e-7 here. `sim drift` is
    // what the solver actually held, 5e-14. Showing only the first would be the
    // diagnostics reporting their own arithmetic instead of the integrator's,
    // which is the mistake RESEARCH.md records from the 2D readout; showing only
    // the second would hide what is on screen. The planar readout names both for
    // the same reason.
    `drift    ${drift.toExponential(2)} shown   sim ${run3.relDrift.toExponential(2)}`,
    // An approach is not a periodic orbit and has no closure to quote: it starts
    // somewhere, ends somewhere else, and the number that says whether it worked
    // is the arrival miss. Asking it for `closure` is what threw here every frame.
    `solver   ${run3.accepted} steps, ${run3.rejected} rejected`
      + `${preset3.quasi || preset3.rendezvous ? '' : `   closes ${preset3.closure.toExponential(1)}`}`,
    `frame    ${FRAME_LABEL[frame] || frame}`,
    // A quasi-periodic trajectory has no period and no closure residual, so it
    // is given neither. Quoting a "period" for the in-plane frequency would be
    // exactly the mislabelling THREE_D_SPEC.md 9 forbids.
    preset3.rendezvous
      ? (() => {
          const sol = rvLive || preset3.solution;
          return `status   ${sol.kind}, miss ${(sol.posErr * DU_KM * 1000).toFixed(1)} m, `
            + `arrival Δv ${vuToMs(sol.dv2Mag).toFixed(0)} m/s`;
        })()
      : preset3.quasi
      ? (preset3.id === 'free3'
          // A run that ended early was NOT propagated for the requested span, so
          // it is given the time it actually ended at. "impact: Moon, over 40 TU"
          // read as forty tidy units of flight that happened to end in a crash.
          ? (run3.status === 'ok'
              ? `status   ok, over ${preset3.duration} TU`
              : `status   ${run3.status} at ${run3.t.toFixed(2)} TU `
                + `(${(run3.t * TU_DAYS).toFixed(1)} d)`)
          : `status   quasi-periodic, ${(preset3.inPlane / preset3.outOfPlane).toFixed(4)}:1, holds ${preset3.lifetime.toFixed(0)} TU`)
      : `status   period ${preset3.period.toFixed(6)} TU, residual ${preset3.residual.toExponential(1)}`,
    `build    ${BUILD}`,
  ].join('\n');
}

// ---------------------------------------------------------------- controls

for (const [label, list] of [['Periodic — halo', PRESETS3D],
  ['Periodic — near-rectilinear', [NRHO3D]],
  ['Quasi-periodic — Lissajous', LISSAJOUS3D],
  ['The whole family', FAMILY_ENTRIES],
  // Separately grouped and named, so nobody has to guess which entries are
  // orbit families and which are mission context. ARTEMIS_DEMO_SPEC.md asks
  // for exactly that, and for the word Artemis to stay visible.
  ['Artemis demos — mission context', [...ARTEMIS3D, ARTEMIS_FAMILY]]]) {
  // Grouped, and labelled by what they ARE. A Lissajous sitting in the same flat
  // list as a halo would be read as another orbit; it is not an orbit at all.
  const g = document.createElement('optgroup');
  g.label = label;
  for (const p of list) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    g.appendChild(o);
  }
  ui.preset3d.appendChild(g);
}

for (const p of PRESETS) {
  const o = document.createElement('option');
  o.value = p.id; o.textContent = p.name;
  ui.preset.appendChild(o);
}
for (const p of POINTS) {
  const o = document.createElement('option');
  o.value = p.name; o.textContent = p.name + (p.unstable ? ' (unstable)' : '');
  ui.target.appendChild(o);
}

function choosePreset(id) {
  const p = byId(id);
  if (!p) return;
  ui.title.textContent = p.name;
  ui.blurb.textContent = p.blurb;
  load(p.state, p.duration, p.expect ? 'expect: ' + p.expect : '', p.view || DEFAULT_VIEW);
}

ui.preset.addEventListener('change', () => choosePreset(ui.preset.value));
// Switching frames is a change of coordinates and nothing else: the clock, the
// integrated trail, the camera and every diagnostic carry straight over, and no
// integration is asked for. The one thing that does move is Fit, because the
// preset's centre is a rotating-frame offset that means nothing once the
// picture turns — see fitView.
ui.frame.addEventListener('change', () => {
  frame = FRAMES.includes(ui.frame.value) ? ui.frame.value : 'rotating';
});
ui.speed.addEventListener('input', () => {
  speedDaysPerSec = Number(ui.speed.value);
  el('speedLabel').textContent = speedDaysPerSec < 1
    ? `${(speedDaysPerSec * 24).toFixed(0)} h/s`
    : `${speedDaysPerSec} d/s`;
});
ui.play.addEventListener('click', () => {
  playing = !playing;
  // Pressing Play on a run that has already reached its end -- a terminated 3D
  // arc, or any finished 2D one -- would otherwise stop again on the very next
  // frame and look like a dead button. Rewind instead: Play means play.
  if (playing) {
    const r = spatial ? run3 : run;
    if (r) { if (spatial) clock3 = resumeFrom(clock3, r); else clock = resumeFrom(clock, r); }
  }
  ui.play.textContent = playing ? 'Pause' : 'Play';
});
ui.reset.addEventListener('click', () => {
  if (spatial) { load3(preset3); return; }
  choosePreset(ui.preset.value);
});

// --- free launch ------------------------------------------------------------

// Captured before anything overwrites it, so leaving the mode restores the
// hint the page shipped with rather than a copy of it that can drift.
const NORMAL_HINT = ui.hint.textContent;

function setEditing(on) {
  ui.launchbar.hidden = !on;
  ui.free.setAttribute('aria-pressed', on ? 'true' : 'false');
  // Targeting and burns belong to a live trajectory, not to a candidate.
  for (const b of [ui.plan, ui.target, ui.preset, ui.play]) b.disabled = on;
  ui.execute.disabled = on || !pending;
  ui.hint.textContent = on
    ? 'Drag the spacecraft to place it; drag the yellow handle to aim and set speed. Launch when the dashed preview looks interesting.'
    : NORMAL_HINT;
}

function beginFreeLaunch() {
  playing = false; ui.play.textContent = 'Play';
  pending = null;
  // Somewhere with room to see what happens: out beyond the Moon, at rest.
  // Deliberately not an orbit -- FREE_LAUNCH_SPEC.md says not to choose a safe
  // velocity for the user, and a state that simply falls is a fair start.
  editor.begin([0.45, -0.62, 0, 0]);
  editor.aim = -Math.PI / 4;
  clock = 0;
  zvcFor = null;
  ui.title.textContent = 'Free launch';
  ui.blurb.textContent = 'Put the spacecraft anywhere, throw it in any direction, and the equations answer. '
    + 'The dashed path is a real propagation of exactly the state you are holding.';
  ui.note.textContent = '';
  setEditing(true);
}

function cancelFreeLaunch() {
  editor.end();
  zvcFor = null;
  setEditing(false);
  choosePreset(ui.preset.value);       // put back what was there before
}

// --- 3D mode ----------------------------------------------------------------

const SPATIAL_HINT = 'Drag to orbit the camera; pinch or scroll to zoom; two fingers to pan. '
  + 'Top is the planar projection, End looks down the Earth–Moon line where the out-of-plane '
  + 'loop opens out. The dashed line under the spacecraft is its height above z = 0.';

function setSpatial(on) {
  spatial = on;
  ui.spatialbar.hidden = !on;
  if (!on) {
    ui.familybar.hidden = true; ui.caution.hidden = true;
    ui.artemis.hidden = true; ui.artemisbar.hidden = true;
    ui.rendezvousbar.hidden = true; lloRun = null; rvLive = null;
    ed3.end(); setEditing3(false);
  }
  ui.spatial.setAttribute('aria-pressed', on ? 'true' : 'false');
  // The planar controls that have no 3D meaning yet. THREE_D_SPEC.md 4 puts 3D
  // burns, targeting, free launch and zero-velocity surfaces outside Phase 1, so
  // they are switched off rather than left to do something undefined.
  for (const b of [ui.preset, ui.plan, ui.target, ui.free, ui.zvc, ui.vel, ui.fit]) b.disabled = on;
  ui.execute.disabled = on || !pending;
  ui.hint.textContent = on ? SPATIAL_HINT : NORMAL_HINT;
  if (on) {
    if (editor.active) cancelFreeLaunch();
    load3(orbit3(ui.preset3d.value) || PRESETS3D[0]);
  } else {
    run3 = null;
    choosePreset(ui.preset.value);
  }
}

ui.spatial.addEventListener('click', () => setSpatial(!spatial));
/** The Orbit menu holds two kinds of thing: single orbits, and whole families. */
function orbit3(id) {
  return byId3d(id) || FAMILY_ENTRIES.find((f) => f.id === id)
    || (id === ARTEMIS_FAMILY.id ? ARTEMIS_FAMILY : null);
}

ui.preset3d.addEventListener('change', () => {
  const p = orbit3(ui.preset3d.value);
  if (p) load3(p);
});
ui.viewTop.addEventListener('click', () => scene3d.setView(VIEWS.top));
ui.viewSide.addEventListener('click', () => scene3d.setView(VIEWS.side));
ui.viewEnd.addEventListener('click', () => scene3d.setView(VIEWS.end));

// --- 3D free launch and impulsive burns -------------------------------------

const Z_RANGE = 400;          // slider extent for z, in thousands of km
const VZ_RANGE = 1500;        // and for vz, in m/s

function setEditing3(on) {
  ui.launch3bar.hidden = !on;
  ui.free3.setAttribute('aria-pressed', on && ed3.mode === 'launch' ? 'true' : 'false');
  ui.burn3.setAttribute('aria-pressed', on && ed3.mode === 'burn' ? 'true' : 'false');
  // Browsing an orbit and authoring one are different activities; the orbit
  // menu, the family slider and playback all step aside while editing.
  for (const b of [ui.preset3d, ui.famSlider, ui.play, ui.reset]) b.disabled = on;
  ui.launch3.textContent = ed3.mode === 'burn' ? 'Apply burn' : 'Launch';
  // Position is only editable for a launch. A burn happens where the spacecraft
  // is; moving it would not be an impulse.
  ui.zSlider.disabled = on && ed3.mode === 'burn';
  ui.hint.textContent = on
    ? (ed3.mode === 'burn'
        ? 'Drag the yellow handle to aim the burn in the plane, and the vz slider for the vertical part. The spacecraft does not move — only its velocity does.'
        : 'Drag the spacecraft to place it in the plane and the z slider for its height; drag the yellow handle to aim, and the vz slider for the vertical part. Every component is a control; none is guessed.')
    : SPATIAL_HINT;
  if (!on) ui.caution.hidden = true;
}

function syncSliders3() {
  ui.zSlider.value = String(Math.round(Math.max(-Z_RANGE, Math.min(Z_RANGE, ed3.state[2] * DU_KM / 1000))));
  ui.vzSlider.value = String(Math.round(Math.max(-VZ_RANGE, Math.min(VZ_RANGE, vuToMs(ed3.state[5])))));
}

/** Frame the candidate and the Moon together, so the edit starts somewhere. */
function fitEditor3() {
  const s = ed3.state;
  const lo = [Math.min(s[0], MOON_X) - 0.08, Math.min(s[1], 0) - 0.08, Math.min(s[2], 0) - 0.05];
  const hi = [Math.max(s[0], MOON_X) + 0.08, Math.max(s[1], 0) + 0.08, Math.max(s[2], 0) + 0.05];
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const pr = ui.panel.getBoundingClientRect();
  const vr = ui.canvas.getBoundingClientRect();
  const usable = Math.max(120, pr.top - vr.top - 16);
  scene3d.setView({ span: extent * 1.8 * (vr.height / usable), centre });
  liftAbovePanel();
}

function beginFree3() {
  playing = false; ui.play.textContent = 'Play';
  if (!scene3d.canPlace()) scene3d.setView(VIEWS.oblique);
  // Somewhere with room, above the plane, at rest. Deliberately not an orbit:
  // FREE_LAUNCH_SPEC.md says not to choose a safe velocity for the user.
  ed3.begin([0.95, 0.10, 0.06, 0, 0, 0], { mode: 'launch', epoch: 0 });
  ui.title.textContent = 'Free launch, in three dimensions';
  ui.blurb.textContent = 'Place it anywhere, at any height, and throw it in any direction. '
    + 'The z and vz sliders are real controls, not defaults — a drag can only ever set two '
    + 'of three components, so the third is on screen where you can see and change it.';
  ui.note.textContent = '';
  syncSliders3();
  setEditing3(true);
  fitEditor3();
}

function beginBurn3() {
  const st = state3At(clock3);
  if (!st) return;
  playing = false; ui.play.textContent = 'Play';
  ed3.begin(st.s, { mode: 'burn', epoch: clock3 });
  ui.title.textContent = 'Impulsive burn';
  ui.blurb.textContent = 'The position does not change; the velocity does, once. '
    + 'Everything after it is ballistic.';
  ui.note.textContent = '';
  syncSliders3();
  setEditing3(true);
  fitEditor3();
}

function cancelEdit3() {
  const was = preset3;
  ed3.end();
  setEditing3(false);
  if (was) load3(was); else load3(PRESETS3D[0]);
}

ui.free3.addEventListener('click', () => {
  if (ed3.active && ed3.mode === 'launch') cancelEdit3(); else beginFree3();
});
ui.burn3.addEventListener('click', () => {
  if (ed3.active && ed3.mode === 'burn') cancelEdit3(); else beginBurn3();
});
ui.cancel3.addEventListener('click', cancelEdit3);

ui.zSlider.addEventListener('input', () => {
  ed3.height(Number(ui.zSlider.value) * 1000 / DU_KM);
  // The height slider spans 800 000 km, which is most of the scene; without a
  // re-fit the craft simply leaves the picture and the control looks broken.
  fitEditor3();
});
ui.vzSlider.addEventListener('input', () => {
  ed3.setVz(msToVu(Number(ui.vzSlider.value)));
});

ui.launch3.addEventListener('click', () => {
  if (!ed3.active || !ed3.valid()) return;
  // Exactly the state the preview was drawn from.
  const state = ed3.state.slice();
  const wasBurn = ed3.mode === 'burn';
  const dv = vuToMs(Math.hypot(...ed3.deltaV()));
  ed3.end();
  setEditing3(false);
  preset3 = {
    id: 'free3', name: wasBurn ? 'After the burn' : 'Free launch',
    blurb: wasBurn
      ? 'Your impulse, integrated. Nothing steers it from here.'
      : 'Your initial condition, integrated. Nothing steers it from here.',
    state, period: null, duration: 40, quasi: true,
    inPlane: 1, outOfPlane: 1, lifetime: 40,
    expect: wasBurn ? `Δv ${dv.toFixed(1)} m/s applied at ${(clock3 * TU_DAYS).toFixed(2)} d` : '',
  };
  load3(preset3);
});
ui.viewObl.addEventListener('click', () => scene3d.setView(VIEWS.oblique));

ui.free.addEventListener('click', () => {
  if (editor.active) cancelFreeLaunch(); else beginFreeLaunch();
});
ui.cancel.addEventListener('click', cancelFreeLaunch);

ui.zeroV.addEventListener('click', () => {
  if (!editor.active) return;
  // Zero in THIS frame, which is not zero in the others -- so it is converted
  // through the same inverse transform as a dragged arrow rather than by
  // setting the rotating components to zero, which would mean something else.
  const d = displayState(editor.state[0], editor.state[1], editor.state[2], editor.state[3], 0, frame);
  const st = displayToRotating(d[0], d[1], 0, 0, 0, frame);
  editor.setVelocity(st[2], st[3]);
});

ui.launch.addEventListener('click', () => {
  if (!editor.active || !editor.valid()) return;
  // Exactly the state the preview was drawn from. Nothing is recomputed, chosen
  // or nudged here: acceptance test 5 is that Launch uses the state shown.
  const state = editor.state.slice();
  const speed = vuToMs(Math.hypot(state[2], state[3]));
  editor.end();
  setEditing(false);
  ui.title.textContent = 'Free launch';
  ui.blurb.textContent = 'Your initial condition, integrated. Nothing steers it from here.';
  load(state, 120,
    `launched from ${state[0].toFixed(4)}, ${state[1].toFixed(4)} DU at `
    + `${speed < 1000 ? speed.toFixed(1) + ' m/s' : (speed / 1000).toFixed(3) + ' km/s'}`,
    null);
});

// --- input ------------------------------------------------------------------
//
// Three gestures over one canvas, and the rule that separates them is where the
// pointer went down rather than what it did afterwards:
//
//   near the spacecraft -> burn
//   anywhere else       -> pan
//   two fingers, wheel  -> zoom
//
// None of them may touch the trajectory. Pan and zoom move the camera, which is
// two numbers in render.js; a burn does change the physics, but only by asking
// for a fresh integration from a new state, exactly as it always did.

// How close counts as "on the spacecraft", in screen pixels rather than model
// units. In DU the target would shrink to nothing when zoomed out and swallow
// the whole view when zoomed in.
const HIT_PX = 26;
// A drag has to travel this far before it is a drag at all, so that a tap which
// wobbles does not pan the scene out from under itself.
const SLOP_PX = 3;
// Burn scale, per pixel of drag. Deliberately gentle: SPEC.md asks that small
// burns be reachable, and the interesting behaviour is at tens of m/s. Fixed in
// pixels so the control feels the same however far the camera is zoomed.
const MS_PER_PX = 0.55;

const pointers = new Map();
let gesture = null;        // 'burn' | 'pan' | 'pinch'
let pinch = null;
let lastTap = 0;

function canvasPoint(e) {
  const r = ui.canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

/** Where the spacecraft is on screen right now, in the frame being displayed. */
function headScreen() {
  const s = stateAt(clock);
  if (!s) return null;
  const [x, y] = displayPos(s.x, s.y, clock, frame);
  return { s, model: [x, y], screen: scene.toScreen(x, y) };
}

function fitView() {
  // The preset's span is what it wants to see and holds in every frame. Its
  // centre is an offset in rotating coordinates, though, and in the
  // Earth-following view the frame is defined by holding Earth at the origin,
  // so that is where a fit belongs. Neither is a physical quantity; the camera
  // cannot reach the trajectory.
  scene.setView(frame === 'earth'
    ? { span: currentView.span, centre: [0, 0] }
    : currentView);
}

ui.canvas.addEventListener('pointerdown', (e) => {
  // Capture keeps a drag alive when the finger leaves the canvas, but a browser
  // is entitled to refuse and it must not take the gesture down with it.
  try { ui.canvas.setPointerCapture(e.pointerId); } catch (_) { /* not fatal */ }
  const p = canvasPoint(e);
  pointers.set(e.pointerId, p);

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = {
      dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
    gesture = 'pinch';
    dragging = null;                       // a second finger cancels a burn
    return;
  }
  if (pointers.size > 2) return;

  if (spatial) {
    // While editing, the two handles take priority; everything else orbits the
    // camera. The handles are hit in screen space, so they stay grabbable
    // however the scene is turned.
    if (ed3.active) {
      const h = scene3d.handles3({ state: ed3.state, arrowScale: arrow3Scale() });
      if (Math.hypot(p[0] - h.tip[0], p[1] - h.tip[1]) <= 26) { gesture = 'aim3'; return; }
      if (ed3.mode === 'launch'
          && Math.hypot(p[0] - h.craft[0], p[1] - h.craft[1]) <= 24) { gesture = 'place3'; return; }
    }
    gesture = 'orbit'; pinch = { last: p }; return;
  }

  // While editing, the spacecraft and the aim handle take priority over
  // everything except zoom -- and the in-flight drag-to-burn gesture is off,
  // because "drag the craft" would mean two different things at once.
  if (editor.active) {
    const { craft, tip } = editorHandles();
    if (Math.hypot(p[0] - tip[0], p[1] - tip[1]) <= EDITOR_HIT_PX * 0.6) { gesture = 'aim'; return; }
    if (Math.hypot(p[0] - craft[0], p[1] - craft[1]) <= EDITOR_HIT_PX / 2) { gesture = 'place'; return; }
    gesture = 'pan';
    pinch = { last: p, moved: 0 };
    return;
  }

  const h = headScreen();
  if (h && Math.hypot(p[0] - h.screen[0], p[1] - h.screen[1]) <= HIT_PX) {
    playing = false; ui.play.textContent = 'Play';
    gesture = 'burn';
    dragging = { dv: [0, 0], to: h.model, from: p, moved: 0 };
  } else {
    gesture = 'pan';
    pinch = { last: p, moved: 0 };
  }
});

ui.canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = canvasPoint(e);
  pointers.set(e.pointerId, p);

  if (gesture === 'place3') {
    // On the horizontal plane at the craft's CURRENT height, so a drag moves it
    // sideways and the z slider moves it up. Two controls, two meanings.
    const w = scene3d.toPlane(p[0], p[1], ed3.state[2]);
    if (w) ed3.place(w[0], w[1]);
    else ui.aim3.textContent = 'tilt the camera to place';
    return;
  }

  if (gesture === 'aim3') {
    // The arrow tip is dragged on the horizontal plane through its own current
    // height, which is set by the vz slider. So the drag sets vx and vy and
    // cannot silently disturb vz.
    const k = arrow3Scale();
    const tipZ = ed3.state[2] + ed3.state[5] * k;
    const w = scene3d.toPlane(p[0], p[1], tipZ);
    if (!w) { ui.aim3.textContent = 'tilt the camera to aim'; return; }
    ed3.setVelocity((w[0] - ed3.state[0]) / k, (w[1] - ed3.state[1]) / k);
    const h = scene3d.handles3({ state: ed3.state, arrowScale: k });
    const dx = h.tip[0] - h.craft[0], dy = h.tip[1] - h.craft[1];
    if (Math.hypot(dx, dy) > 2) ed3.aim = Math.atan2(dy, dx);
    return;
  }

  if (gesture === 'orbit' && spatial) {
    scene3d.orbitBy(p[0] - pinch.last[0], p[1] - pinch.last[1]);
    pinch.last = p;
    return;
  }

  if (gesture === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (spatial) {
      scene3d.zoomAt(mid[0], mid[1], dist / pinch.dist);
      scene3d.panByPixels(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
    } else {
      scene.zoomAt(mid[0], mid[1], dist / pinch.dist);
      scene.panByPixels(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
    }
    pinch = { dist, mid };
    return;
  }

  if (gesture === 'pan' && pinch) {
    const dx = p[0] - pinch.last[0], dy = p[1] - pinch.last[1];
    pinch.moved += Math.hypot(dx, dy);
    if (pinch.moved > SLOP_PX) scene.panByPixels(dx, dy);
    pinch.last = p;
    return;
  }

  if (gesture === 'place') {
    // Straight to where the finger is, in the frame on screen, then back to the
    // one canonical rotating state. The velocity rides along unchanged in the
    // DISPLAY frame, so moving the craft does not quietly re-aim it -- which for
    // the rotating frame is the same numbers and for the other two is not.
    const d = displayState(editor.state[0], editor.state[1], editor.state[2], editor.state[3], 0, frame);
    const m = scene.toModel(p[0], p[1]);
    const st = displayToRotating(m[0], m[1], d[2], d[3], 0, frame);
    editor.place(st[0], st[1]);
    editor.setVelocity(st[2], st[3]);
    return;
  }

  if (gesture === 'aim') {
    const { craft } = editorHandles();
    const dx = p[0] - craft[0], dy = p[1] - craft[1];
    const len = Math.hypot(dx, dy);
    if (len > 2) editor.aim = Math.atan2(dy, dx);
    // Screen pixels to metres per second: the same gesture means the same speed
    // at every zoom level, which is what the spec asks for.
    const speed = msToVu(len * LAUNCH_MS_PER_PX);
    const d = displayState(editor.state[0], editor.state[1], editor.state[2], editor.state[3], 0, frame);
    const vx = len > 0 ? (dx / len) * speed : 0;
    const vy = len > 0 ? (-dy / len) * speed : 0;     // screen y is down, model y is up
    const st = displayToRotating(d[0], d[1], vx, vy, 0, frame);
    editor.setVelocity(st[2], st[3]);
    return;
  }

  if (gesture === 'burn' && dragging) {
    const h = headScreen();
    if (!h) return;
    dragging.moved = Math.hypot(p[0] - dragging.from[0], p[1] - dragging.from[1]);
    // Δv in the FRAME BEING SHOWN, then rotated back into rotating coordinates,
    // because that is where the integrator lives.
    const dxPx = p[0] - h.screen[0], dyPx = p[1] - h.screen[1];
    const [dx, dy] = burnToRotating(
      msToVu(dxPx * MS_PER_PX), msToVu(-dyPx * MS_PER_PX), clock, frame);
    dragging.dv = [dx, dy];
    dragging.to = scene.toModel(p[0], p[1]);
    ui.note.textContent = `burn ${vuToMs(Math.hypot(dx, dy)).toFixed(1)} m/s — release to commit`;
  }
});

function endPointer(e) {
  const had = gesture;
  if (had === 'orbit' || had === 'place3' || had === 'aim3') {
    pointers.delete(e.pointerId); gesture = null; pinch = null; return;
  }
  if (had === 'place' || had === 'aim') {
    pointers.delete(e.pointerId);
    gesture = null;
    return;
  }
  const wasDrag = dragging;
  const movedLittle = had === 'pan' && pinch && pinch.moved <= SLOP_PX;
  pointers.delete(e.pointerId);

  if (had === 'pinch') {
    // one finger lifted: carry on as a pan rather than jumping
    if (pointers.size === 1) { gesture = 'pan'; pinch = { last: [...pointers.values()][0], moved: 99 }; }
    else { gesture = null; pinch = null; }
    return;
  }

  if (had === 'burn' && wasDrag) {
    dragging = null; gesture = null;
    const s = stateAt(clock);
    const dv = wasDrag.dv;
    if (!s || wasDrag.moved < SLOP_PX || Math.hypot(dv[0], dv[1]) < 1e-9) { ui.note.textContent = ''; return; }
    const before = [s.x, s.y, s.vx, s.vy];
    const after = [s.x, s.y, s.vx + dv[0], s.vy + dv[1]];
    const c0 = jacobi(before, MU), c1 = jacobi(after, MU);
    ui.title.textContent = 'After a burn';
    ui.blurb.textContent = 'Position unchanged, velocity changed, and the Jacobi constant with it. Everything after this is ballistic.';
    // the camera is deliberately left where the user put it
    load(after, run ? run.duration : 40,
      `burn ${vuToMs(Math.hypot(dv[0], dv[1])).toFixed(1)} m/s   C ${c0.toFixed(6)} -> ${c1.toFixed(6)}`, null);
    return;
  }

  gesture = null;
  if (pointers.size === 0) pinch = null;

  // a tap on empty space that did not move: double-tap restores the framing
  if (movedLittle) {
    const now = performance.now();
    if (now - lastTap < 320) { fitView(); lastTap = 0; } else lastTap = now;
  }
}
ui.canvas.addEventListener('pointerup', endPointer);
ui.canvas.addEventListener('pointercancel', endPointer);

// wheel / trackpad zoom, about the cursor
ui.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = canvasPoint(e);
  // trackpads send small continuous deltas and mice send large discrete ones;
  // the exponential keeps both feeling like the same control
  const factor = Math.min(2.2, Math.max(0.45,
    Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))));
  // Both views zoom about the cursor. See Scene3D.zoomAt for why the 3D one can:
  // keeping a SCREEN point fixed under an orthographic camera is a shift in the
  // projection plane and needs no depth at all.
  if (spatial) scene3d.zoomAt(p[0], p[1], factor); else scene.zoomAt(p[0], p[1], factor);
}, { passive: false });

ui.canvas.addEventListener('dblclick', (e) => {
  if (spatial) { fitSpatial(); return; }
  const p = canvasPoint(e);
  const h = headScreen();
  if (h && Math.hypot(p[0] - h.screen[0], p[1] - h.screen[1]) <= HIT_PX) return;
  fitView();
});

ui.fit.addEventListener('click', fitView);

// Safari on iOS fires its own gesture events for a pinch and will happily zoom
// the whole page instead of the scene. touch-action: none on the canvas handles
// most of it; these catch the rest.
for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
  ui.canvas.addEventListener(g, (e) => e.preventDefault());
}

// --- targeting -------------------------------------------------------------
ui.plan.addEventListener('click', () => {
  const s = stateAt(clock);
  if (!s) return;
  const tgt = POINTS.find((p) => p.name === ui.target.value);
  playing = false; ui.play.textContent = 'Play';
  ui.note.textContent = 'solving…';
  setTimeout(() => {
    const state = [s.x, s.y, s.vx, s.vy];
    const res = planTransfer(state, [tgt.x, tgt.y]);
    if (!res.best) {
      pending = null; ui.execute.disabled = true;
      // Say what got in the way when something did. "No solution" and "every
      // candidate flew into the Moon" are different answers and the second one
      // is the more useful.
      const why = (res.blocked || []).map(([what, n]) => `${n} ended in ${what}`).join(', ');
      ui.note.textContent = `no burn found to ${tgt.name} among ${res.tried} flight times`
        + (why ? ` — ${why} before arriving` : '')
        + `. That is an answer, not a failure — try moving first, or a different target.`;
      return;
    }
    const b = res.best;
    const after = [s.x, s.y, s.vx + b.dvx, s.vy + b.dvy];
    const path = propagate(after, b.timeOfFlight, { sample: b.timeOfFlight / 400 });
    pending = { burn: b, after, target: tgt.name, path: { xs: path.xs, ys: path.ys, ts: path.ts } };
    ui.execute.disabled = false;
    ui.note.textContent = [
      `${tgt.name}: Δv ${b.dvMs.toFixed(1)} m/s`,
      `flight ${(b.timeOfFlight * TU_DAYS).toFixed(2)} d`,
      `miss ${(b.residual * DU_KM).toFixed(1)} km`,
      `C ${b.C0.toFixed(6)} → ${b.C1.toFixed(6)}`,
      tgt.unstable ? '— and it will not stay there' : '',
    ].filter(Boolean).join('   ');
  }, 20);
});

ui.execute.addEventListener('click', () => {
  if (!pending) return;
  const b = pending.burn;
  ui.title.textContent = 'Targeted burn';
  ui.blurb.textContent = 'Solved by shooting, not steering: the burn happens once and the equations do the rest.';
  load(pending.after, Math.max(b.timeOfFlight * 2.2, 12),
    `executed Δv ${b.dvMs.toFixed(1)} m/s → ${pending.target} in `
      + `${(b.timeOfFlight * TU_DAYS).toFixed(2)} d, miss ${(b.residual * DU_KM).toFixed(1)} km`,
    null, { t: b.timeOfFlight, name: pending.target });
});

window.addEventListener('resize', () => scene.resize());

// ---------------------------------------------------------------- boot
scene.resize();
ui.preset.value = 'horseshoe';
choosePreset('horseshoe');
requestAnimationFrame(frameLoop);

window.threebody = {
  POINTS, get run() { return run; }, stateAt, scene, load, propagate, planTransfer,
  fitView, get view() { return { span: scene.span, centre: scene.centre.slice() }; },
  get clock() { return clock; }, get frame() { return frame; },
  // for the acceptance checks: the candidate and where its handles are
  editor, editorHandles,
  // 3D, for the acceptance checks
  scene3d, get run3() { return run3; }, get clock3() { return clock3; }, fitSpatial,
  ed3, arrow3Scale,
  get intendedView() { return currentView; },
};
