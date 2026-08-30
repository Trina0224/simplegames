// app.js — orchestration: sizes the pane, runs the clock, wires the one control
// this prototype has. The physics lives in surface.js, impact.js, rain.js and
// flows.js; the optics live in render.js; gravity comes from gravity.js
// unchanged and must stay that way.
//
// This is the first physics prototype. There is deliberately no camera mode, no
// audio, no thunder, no airborne rain and no decoration: the point is that the
// water on the glass can be judged on a real device.

import { Surface, MM } from './surface.js?v=20260830g';
import { FlowSystem } from './flows.js?v=20260830g';
import { ImpactField } from './impact.js?v=20260830g';
import { Rainfall, INTENSITIES } from './rain.js?v=20260830g';
import { PaneRenderer } from './render.js?v=20260830g';
import { Scene } from './scene.js?v=20260830g';
import { GravitySensor } from './gravity.js?v=20260830g';
import { AudioEngine } from './audio.js?v=20260830g';

// The grid follows a physical cell size, not a fixed count. Fixing the count
// means a phone quietly simulates at twice the resolution of a tablet and pays
// for it, while a millimetre of glass covers a different number of cells on
// each — the one thing this project keeps insisting must never happen.
// Bump this on every ship, and keep it identical to the ?v= on every import
// and on the script tag in index.html.
//
// GitHub Pages serves modules with a cache lifetime, and Safari holds on to
// them hard: a fix can be live on the server while the device quietly runs the
// previous build, which cost two rounds of debugging a bug that was already
// fixed. A query string makes each version a different URL, so there is nothing
// to invalidate. The diagnostics show it, which is the point — "which build am
// I actually looking at" should never again be something to reason about.
//
// It stopped being a bare constant after this app was found serving a MIXED
// build on main: index.html and app.js at ...c while flows.js, impact.js and
// render.js still imported surface.js at ...b, so the same module was fetched
// twice under two URLs and either copy could come from the cache on its own.
// STAMP is what this file was built as and tools/stamp.mjs moves it with every
// import; LOADED is what the browser actually asked for. When they disagree the
// diagnostics say so instead of reporting a version that is not running.
const STAMP = '20260830g';
const LOADED = new URL(import.meta.url).searchParams.get('v');
const BUILD = LOADED === STAMP ? STAMP : `${STAMP} (loaded as ${LOADED || 'unversioned'} — cached)`;

const CELL_MM = 0.22;        // about a fifth of a millimetre of glass per cell
const MAX_CELLS = 130000;    // ...unless that would cost too much
const STEP = 1 / 60;
const MAX_STEPS = 3;

const el = {
  app: document.getElementById('app'),
  canvas: document.getElementById('pane'),
  start: document.getElementById('start'),
  message: document.getElementById('message'),
  diag: document.getElementById('diag'),
  intensity: document.getElementById('intensity'),
  intensityName: document.getElementById('intensityName'),
  infoBtn: document.getElementById('infoBtn'),
  soundBtn: document.getElementById('soundBtn'),
};

const surface = new Surface(64, 64);
const flows = new FlowSystem(surface);
const impacts = new ImpactField(surface);
const rainfall = new Rainfall();
const renderer = new PaneRenderer(el.canvas);
const scene = new Scene();
const gravity = new GravitySensor();
const audio = new AudioEngine();
impacts.onImpact = (ev) => audio.handleImpact(ev);

let cellSize = 1;
let started = false;
let running = false;
let last = 0;
let accumulator = 0;
let showDiag = false;
let messageTimer = null;
let frames = 0;
let fps = 0;
let fpsAt = 0;
let metricsAt = 0;
const drops = [];

function layout() {
  const rect = el.app.getBoundingClientRect();
  const viewW = Math.max(1, rect.width);
  const viewH = Math.max(1, rect.height);
  cellSize = CELL_MM * MM;
  const over = (viewW * viewH) / (cellSize * cellSize) / MAX_CELLS;
  if (over > 1) cellSize *= Math.sqrt(over);
  const cols = Math.max(32, Math.round(viewW / cellSize));
  const rows = Math.max(32, Math.round(viewH / cellSize));
  surface.resize(cols, rows);
  surface.setScale(cellSize);
  flows.setScale(cellSize);
  impacts.setScale(cellSize);
  const paneArea = cols * rows * surface.cellMm * surface.cellMm;
  rainfall.setPane(paneArea);
  audio.setPane(paneArea);
  renderer.setSurfaceSize(cols, rows);
  renderer.setCellSize(surface.cellMm);
  renderer.setThicknessScale(0.62 * Math.cbrt(flows.maxMass / (Math.PI * 0.52)), surface.beadFilm);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(dpr, Math.sqrt(2.6e6 / (viewW * viewH)));
  renderer.resize(viewW, viewH, Math.max(1, scale));
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 150);
});
window.addEventListener('orientationchange', () => setTimeout(layout, 250));

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  accumulator = 0;
  requestAnimationFrame(frame);
}

function stepOnce(dt, g) {
  rainfall.step(dt, drops);
  for (const drop of drops) {
    const x = Math.random() * surface.cols;
    const y = Math.random() * surface.rows;
    impacts.add(x, y, drop, g);
  }
  impacts.update(dt);
  surface.tick(dt, g);
  flows.update(dt, g);
}

function frame(now) {
  if (!running) return;
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += dt;

  const g = gravity.vector();
  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    stepOnce(STEP, g);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  renderer.draw(surface, flows.heads);

  if (now - metricsAt > 60) {
    metricsAt = now;
    audio.updateMetrics(surface.metrics());
  }
  audio.update(now);

  frames += 1;
  if (now - fpsAt > 500) {
    fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
    if (showDiag) updateDiag(g);
  }
  requestAnimationFrame(frame);
}

function showMessage(text) {
  el.message.textContent = text || '';
  el.message.classList.toggle('show', !!text);
  clearTimeout(messageTimer);
  if (text) messageTimer = setTimeout(() => el.message.classList.remove('show'), 4200);
}

function setIntensity(index) {
  const step = INTENSITIES[Math.max(0, Math.min(INTENSITIES.length - 1, index | 0))];
  rainfall.setRate(step.rate);
  audio.setRate(step.rate);
  renderer.setWeather(step.rate);
  el.intensityName.textContent = `${step.name}${step.rate ? ` · ${step.rate} mm/h` : ''}`;
}

function updateDiag(g) {
  const d = gravity.debug();
  const onGlass = surface.totalWater() + flows.totalMass();
  const mm3 = onGlass * surface.cellMm ** 3;
  el.diag.textContent = [
    `fps      ${fps}`,
    `gravity  ${g.x >= 0 ? ' ' : ''}${g.x.toFixed(2)}, ${g.y >= 0 ? ' ' : ''}${g.y.toFixed(2)}   plane ${g.plane.toFixed(2)}`,
    `raw      ${d.raw.x.toFixed(2)}, ${d.raw.y.toFixed(2)}, ${d.raw.z.toFixed(2)}`,
    `sensor   ${d.enabled ? 'devicemotion' : 'off (screen down)'}`,
    `screen   angle ${d.reported === null ? '-' : d.reported}  ${d.kind || '-'}  legacy ${d.legacy === null ? '-' : d.legacy}`,
    `         ${d.viewport}  ->  read ${d.angle}°  turn ${d.rotation}°${d.locked ? '   ROTATION LOCKED' : ''}`,
    `rain     ${rainfall.rate} mm/h   ${rainfall.massFlux().toFixed(1)} mm3/s`,
    `impacts  ${impacts.live.length} spreading`,
    `landed   ${(impacts.landed * surface.cellMm ** 3).toFixed(0)} mm3 in total`,
    `heads    ${flows.heads.length}   merges ${flows.merges}`,
    `on glass ${mm3.toFixed(0)} mm3   ran off ${(surface.drained * surface.cellMm ** 3).toFixed(0)}   dried ${(surface.evaporated * surface.cellMm ** 3).toFixed(0)}`,
    `cell     ${surface.cellMm.toFixed(3)} mm   grid ${surface.cols}x${surface.rows}`,
    `sound    ${audio.ready ? (audio.muted ? 'muted' : 'on') : 'off'}   ${audio.voices} voices   x${audio.multiplier.toFixed(0)} pane`,
    `veil     ${renderer.veil ? 'on' : 'OFF'}   sigma ${renderer.sigma.toFixed(3)}   ${renderer.maskUploaded ? 'masks ok' : 'no masks'}`,
    `renderer ${renderer.ok ? 'webgl' : '2d fallback'}   build ${BUILD}`,
  ].join('\n');
}

el.intensity.addEventListener('input', () => {
  setIntensity(Number(el.intensity.value));
  wake();
});

el.soundBtn.addEventListener('click', async () => {
  if (!audio.ready) await audio.start();
  audio.setMuted(!audio.muted);
  updateSound();
});

function updateSound() {
  const on = audio.ready && !audio.muted;
  el.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  el.soundBtn.textContent = on ? 'Sound on' : 'Sound off';
}

el.diag.addEventListener('click', () => {
  renderer.setVeil(!renderer.veil);
  showMessage(renderer.veil ? 'Rain veil on' : 'Rain veil off');
});

el.infoBtn.addEventListener('click', () => {
  showDiag = !showDiag;
  el.diag.hidden = !showDiag;
  el.infoBtn.setAttribute('aria-pressed', showDiag ? 'true' : 'false');
  if (showDiag) updateDiag(gravity.vector());
});

async function begin() {
  if (started) return;
  started = true;
  el.start.hidden = true;
  layout();

  const heard = await audio.start();
  updateSound();

  const ok = await scene.load();
  renderer.setScene(scene);
  if (!ok) showMessage('The scene image did not load — the pane still works');

  const motion = await gravity.start();
  if (!motion) showMessage('No motion sensor — water runs down the screen');
  if (!heard) showMessage('This browser would not start the audio — tap Sound');

  setIntensity(Number(el.intensity.value));
  wake();
}

el.start.addEventListener('click', begin);
el.start.addEventListener('pointerdown', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; audio.suspend(); }
  else if (started) { audio.resume(); wake(); }
});

window.addEventListener('pagehide', () => { gravity.stop(); audio.suspend(); });

layout();
setIntensity(Number(el.intensity.value));
scene.load().then(() => { renderer.setScene(scene); renderer.draw(surface, flows.heads); });

window.rainpane = {
  surface, flows, impacts, rainfall, renderer, gravity, scene, audio, layout,
  cellSize: () => cellSize,
  step: stepOnce,
  mmPerPx: 1 / MM,
};
