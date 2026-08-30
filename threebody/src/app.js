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
import { toInertial } from './frames.js';

const BUILD = '20260830a';
const POINTS = lagrangePoints(MU);
const el = (id) => document.getElementById(id);
// what the co-orbital region needs; presets that live somewhere smaller say so
const DEFAULT_VIEW = { span: 3.7, centre: [0.06, -0.20] };

const ui = {
  canvas: el('view'), preset: el('preset'), frame: el('frame'), speed: el('speed'),
  play: el('play'), reset: el('reset'), zvc: el('zvc'), vel: el('vel'),
  target: el('target'), plan: el('plan'), execute: el('execute'),
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
    if (view) { scene.span = view.span; scene.centre = view.centre.slice(); }
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
    burn: dragging ? dragging.dv : null,
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
      `frame    ${frame}`,
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
ui.frame.addEventListener('change', () => { frame = ui.frame.value; });
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

// --- a burn is a change of velocity, at this position, right now -----------
ui.canvas.addEventListener('pointerdown', (e) => {
  const s = stateAt(clock);
  if (!s) return;
  const r = ui.canvas.getBoundingClientRect();
  const [mx, my] = scene.toModel(e.clientX - r.left, e.clientY - r.top);
  let hx = s.x, hy = s.y;
  if (frame === 'inertial') { const c = Math.cos(clock), sn = Math.sin(clock); [hx, hy] = [s.x * c - s.y * sn, s.x * sn + s.y * c]; }
  if (Math.hypot(mx - hx, my - hy) > 0.12) return;
  playing = false; ui.play.textContent = 'Play';
  dragging = { dv: [0, 0] };
  ui.canvas.setPointerCapture(e.pointerId);
});
ui.canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const s = stateAt(clock);
  const r = ui.canvas.getBoundingClientRect();
  const [mx, my] = scene.toModel(e.clientX - r.left, e.clientY - r.top);
  let hx = s.x, hy = s.y;
  if (frame === 'inertial') { const c = Math.cos(clock), sn = Math.sin(clock); [hx, hy] = [s.x * c - s.y * sn, s.x * sn + s.y * c]; }
  // Deliberately gentle: a full-width drag is a few hundred m/s, so that small
  // burns are reachable. The interesting behaviour is at tens of m/s.
  let dx = (mx - hx) * 0.22, dy = (my - hy) * 0.22;
  if (frame === 'inertial') { const c = Math.cos(-clock), sn = Math.sin(-clock); [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c]; }
  dragging.dv = [dx, dy];
  ui.note.textContent = `burn ${vuToMs(Math.hypot(dx, dy)).toFixed(1)} m/s — release to commit`;
});
ui.canvas.addEventListener('pointerup', () => {
  if (!dragging) return;
  const s = stateAt(clock);
  const dv = dragging.dv;
  dragging = null;
  if (!s || Math.hypot(dv[0], dv[1]) < 1e-6) { ui.note.textContent = ''; return; }
  const before = [s.x, s.y, s.vx, s.vy];
  const after = [s.x, s.y, s.vx + dv[0], s.vy + dv[1]];
  const c0 = jacobi(before, MU), c1 = jacobi(after, MU);
  ui.title.textContent = 'After a burn';
  ui.blurb.textContent = 'Position unchanged, velocity changed, and the Jacobi constant with it. Everything after this is ballistic.';
  load(after, run ? run.duration : 40,
    `burn ${vuToMs(Math.hypot(dv[0], dv[1])).toFixed(1)} m/s   C ${c0.toFixed(6)} -> ${c1.toFixed(6)}`);
});

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
    `executed Δv ${b.dvMs.toFixed(1)} m/s, miss ${(b.residual * DU_KM).toFixed(1)} km`);
});

window.addEventListener('resize', () => scene.resize());

// ---------------------------------------------------------------- boot
scene.resize();
ui.preset.value = 'horseshoe';
choosePreset('horseshoe');
requestAnimationFrame(frameLoop);

window.threebody = { POINTS, get run() { return run; }, stateAt, scene, load, propagate, planTransfer };
