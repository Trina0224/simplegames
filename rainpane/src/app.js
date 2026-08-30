// app.js — orchestration: sizes the pane, runs the clock, wires the one control
// this prototype has. The physics lives in surface.js, impact.js, rain.js and
// flows.js; the optics live in render.js; gravity comes from gravity.js
// unchanged and must stay that way.
//
// This is the first physics prototype. There is deliberately no camera mode, no
// audio, no thunder, no airborne rain and no decoration: the point is that the
// water on the glass can be judged on a real device.

import { Surface, MM } from './surface.js';
import { FlowSystem } from './flows.js';
import { ImpactField } from './impact.js';
import { Rainfall, INTENSITIES } from './rain.js';
import { PaneRenderer } from './render.js';
import { Scene } from './scene.js';
import { GravitySensor } from './gravity.js';
import { AudioEngine } from './audio.js';

// The grid follows a physical cell size, not a fixed count. Fixing the count
// means a phone quietly simulates at twice the resolution of a tablet and pays
// for it, while a millimetre of glass covers a different number of cells on
// each — the one thing this project keeps insisting must never happen.
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

// ---------------------------------------------------------------- layout

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
  // The optics need to know how thick the thickest drop is, in cells.
  renderer.setThicknessScale(0.62 * Math.cbrt(flows.maxMass / (Math.PI * 0.52)), surface.beadFilm);
  // Cap the backing store: refraction is per-pixel, and a retina tablet at full
  // density is a lot of pixels for a phone GPU.
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

// ---------------------------------------------------------------- clock

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  accumulator = 0;
  requestAnimationFrame(frame);
}

function stepOnce(dt, g) {
  // Rain arrives, spreads, and only then belongs to the pane.
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

  // The audio reads reduced numbers at a control rate, never the grid.
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

// ---------------------------------------------------------------- controls

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
  el.intensityName.textContent = `${step.name}${step.rate ? ` · ${step.rate} mm/h` : ''}`;
}

function updateDiag(g) {
  const d = gravity.debug();
  // A live splash's water is already in the thickness field; adding it again
  // here would double-count it.
  const onGlass = surface.totalWater() + flows.totalMass();
  const mm3 = onGlass * surface.cellMm ** 3;
  el.diag.textContent = [
    `fps      ${fps}`,
    `gravity  ${g.x >= 0 ? ' ' : ''}${g.x.toFixed(2)}, ${g.y >= 0 ? ' ' : ''}${g.y.toFixed(2)}   plane ${g.plane.toFixed(2)}`,
    `raw      ${d.raw.x.toFixed(2)}, ${d.raw.y.toFixed(2)}, ${d.raw.z.toFixed(2)}`,
    `sensor   ${d.enabled ? 'devicemotion' : 'off (screen down)'}`,
    `screen   angle ${d.reported === null ? '-' : d.reported}  ${d.kind || '-'}  legacy ${d.legacy === null ? '-' : d.legacy}`,
    `         ${d.viewport}  ->  read ${d.angle}°  turn ${d.rotation}°`,
    `rain     ${rainfall.rate} mm/h   ${rainfall.massFlux().toFixed(1)} mm3/s`,
    `impacts  ${impacts.live.length} spreading`,
    `landed   ${(impacts.landed * surface.cellMm ** 3).toFixed(0)} mm3 in total`,
    `heads    ${flows.heads.length}   merges ${flows.merges}`,
    `on glass ${mm3.toFixed(0)} mm3   ran off ${(surface.drained * surface.cellMm ** 3).toFixed(0)}   dried ${(surface.evaporated * surface.cellMm ** 3).toFixed(0)}`,
    `cell     ${surface.cellMm.toFixed(3)} mm   grid ${surface.cols}x${surface.rows}`,
    `sound    ${audio.ready ? (audio.muted ? 'muted' : 'on') : 'off'}   ${audio.voices} voices   x${audio.multiplier.toFixed(0)} pane`,
    `renderer ${renderer.ok ? 'webgl' : '2d fallback'}`,
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

el.infoBtn.addEventListener('click', () => {
  showDiag = !showDiag;
  el.diag.hidden = !showDiag;
  el.infoBtn.setAttribute('aria-pressed', showDiag ? 'true' : 'false');
  if (showDiag) updateDiag(gravity.vector());
});

// ---------------------------------------------------------------- start

async function begin() {
  if (started) return;
  started = true;
  el.start.hidden = true;
  layout();

  // Audio first, and before anything is awaited. Safari only unlocks an
  // AudioContext inside a user gesture, and the gesture is spent by the first
  // await — asking for motion permission ends it, so an audio start placed
  // after that prompt silently stays suspended on iOS.
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

// ---------------------------------------------------------------- lifecycle

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; audio.suspend(); }
  else if (started) { audio.resume(); wake(); }
});

window.addEventListener('pagehide', () => { gravity.stop(); audio.suspend(); });

// ---------------------------------------------------------------- boot

layout();
setIntensity(Number(el.intensity.value));
scene.load().then(() => { renderer.setScene(scene); renderer.draw(surface, flows.heads); });

// Handy from Safari's inspector on a real device.
window.rainpane = {
  surface, flows, impacts, rainfall, renderer, gravity, scene, audio, layout,
  cellSize: () => cellSize,
  step: stepOnce,
  mmPerPx: 1 / MM,
};
