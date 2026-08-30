// app.js — the clock, the controls, and nothing else.
//
// The division of labour matters here and is the one the spec asks for. The
// worker computes physical states; this file plays back what it has at whatever
// rate the user asked for; render.js draws. Playback speed changes how quickly
// cached states are shown and never touches the integration, so a trajectory
// watched at 5 days a second is the same trajectory watched at one.

import { MU, TU_DAYS, DU_KM, vuToMs, msToVu } from './constants.js';
import { jacobi } from './cr3bp.js';
import { lagrangePoints } from './lagrange.js';
import { propagate } from './trajectory.js';
import { zeroVelocityCurves } from './zvc.js';
import { planTransfer } from './targeting.js';
import { PRESETS, byId } from './presets.js';
import { Scene } from './render.js';
import { FRAMES, FRAME_LABEL, displayPos, burnToRotating } from './display.js';

const BUILD = '20260830c';
const POINTS = lagrangePoints(MU);
const el = (id) => document.getElementById(id);
// what the co-orbital region needs; presets that live somewhere smaller say so
const DEFAULT_VIEW = { span: 3.7, centre: [0.06, -0.20] };

const ui = {
  canvas: el('view'), preset: el('preset'), frame: el('frame'), speed: el('speed'),
  play: el('play'), reset: el('reset'), zvc: el('zvc'), vel: el('vel'),
  target: el('target'), plan: el('plan'), execute: el('execute'), fit: el('fit'),
  readout: el('readout'), note: el('note'), title: el('title'), blurb: el('blurb'),
};

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

// ---------------------------------------------------------------- solving

function makeWorker() {
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
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

function load(state, duration, label, view) {
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
    ui.note.textContent = label || '';
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

  if (ui.zvc.checked && run) {
    const key = (run.C0).toFixed(6);
    if (zvcFor !== key) { zvcSegs = zeroVelocityCurves(run.C0); zvcFor = key; }
  }

  scene.draw({
    frame, t: clock, points: POINTS,
    trail: run && s ? { xs: run.xs, ys: run.ys, ts: run.ts, n: Math.max(2, s.index + 1) } : null,
    head, zvc: zvcSegs, showZvc: ui.zvc.checked, showVel: ui.vel.checked,
    plan: pending ? pending.path : null,
    burn: dragging,
  });

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
      ui.note.textContent = `no burn found to ${tgt.name} among ${res.tried} flight times. That is an answer, not a failure — try moving first, or a different target.`;
      return;
    }
    const b = res.best;
    const after = [s.x, s.y, s.vx + b.dvx, s.vy + b.dvy];
    const path = propagate(after, b.timeOfFlight, { sample: b.timeOfFlight / 400 });
    pending = { burn: b, after, path: { xs: path.xs, ys: path.ys, ts: path.ts } };
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
    `executed Δv ${b.dvMs.toFixed(1)} m/s, miss ${(b.residual * DU_KM).toFixed(1)} km`, null);
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
  get intendedView() { return currentView; },
};
