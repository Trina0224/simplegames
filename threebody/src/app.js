// app.js — the clock, the controls, and nothing else.
//
// The division of labour matters here and is the one the spec asks for. The
// worker computes physical states; this file plays back what it has at whatever
// rate the user asked for; render.js draws. Playback speed changes how quickly
// cached states are shown and never touches the integration, so a trajectory
// watched at 5 days a second is the same trajectory watched at one.

import { MU, TU_DAYS, DU_KM, vuToMs, msToVu } from './constants.js?v=20260830h';
import { jacobi } from './cr3bp.js?v=20260830h';
import { lagrangePoints } from './lagrange.js?v=20260830h';
import { propagate } from './trajectory.js?v=20260830h';
import { zeroVelocityCurves } from './zvc.js?v=20260830h';
import { planTransfer } from './targeting.js?v=20260830h';
import { PRESETS, byId } from './presets.js?v=20260830h';
import { Scene } from './render.js?v=20260830h';
import { FRAMES, FRAME_LABEL, displayPos, displayState, displayToRotating, burnToRotating } from './display.js?v=20260830h';
import { FreeLaunch, PREVIEW_TU } from './freelaunch.js?v=20260830h';
import { EDITOR_HIT_PX } from './render.js?v=20260830h';

// The build stamp is compared against this module's own URL rather than simply
// declared, because the thing it is there to catch is the browser having served
// something other than what was published. STAMP is what this file was built as
// and tools/stamp.mjs keeps it in step with every import; the query is what the
// browser actually asked for. When they agree the readout says so in one word.
// When they do not, the readout says that instead of quietly reporting a version
// that is not running -- which is the failure this whole mechanism exists for.
const STAMP = '20260830h';
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

// ---------------------------------------------------------------- solving

function makeWorker() {
  try {
    const w = new Worker(new URL('./worker.js?v=20260830h', import.meta.url), { type: 'module' });
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
  if (playing && run) {
    clock += dt * speedDaysPerSec / TU_DAYS;
    if (clock >= run.ts[run.n - 1]) { clock = run.ts[run.n - 1]; playing = false; ui.play.textContent = 'Play'; }
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

// ---------------------------------------------------------------- controls

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
  ui.play.textContent = playing ? 'Pause' : 'Play';
});
ui.reset.addEventListener('click', () => choosePreset(ui.preset.value));

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

  if (gesture === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    scene.zoomAt(mid[0], mid[1], dist / pinch.dist);
    scene.panByPixels(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
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
  const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
  scene.zoomAt(p[0], p[1], Math.min(2.2, Math.max(0.45, factor)));
}, { passive: false });

ui.canvas.addEventListener('dblclick', (e) => {
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
  get intendedView() { return currentView; },
};
