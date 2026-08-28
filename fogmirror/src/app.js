// app.js — orchestration: sizes the simulation, runs the clock, wires the
// controls. The physics lives in condensation.js and droplets.js; the optics
// live in render.js; gravity comes from orientation.js unchanged.

import { Surface } from './condensation.js';
import { FlowSystem } from './droplets.js';
import { MirrorRenderer } from './render.js';
import { MirrorCamera } from './camera.js';
import { GravitySensor } from './orientation.js';
import { PointerPaths } from './input.js';

const GRID_SHORT = 208;      // simulation cells across the shorter axis
const STEP = 1 / 60;
const MAX_STEPS = 3;
const FINGER_PX = 19;        // contact radius of a fingertip, in CSS pixels

const el = {
  app: document.getElementById('app'),
  canvas: document.getElementById('glass'),
  video: document.getElementById('video'),
  surface: document.getElementById('surface'),
  start: document.getElementById('start'),
  message: document.getElementById('message'),
  diag: document.getElementById('diag'),
  steamBtn: document.getElementById('steamBtn'),
  freshBtn: document.getElementById('freshBtn'),
  cameraBtn: document.getElementById('cameraBtn'),
  infoBtn: document.getElementById('infoBtn'),
};

const surface = new Surface(GRID_SHORT, GRID_SHORT);
const flows = new FlowSystem(surface);
const renderer = new MirrorRenderer(el.canvas);
const camera = new MirrorCamera(el.video);
const gravity = new GravitySensor();

let cellSize = 1;
let viewW = 1;
let viewH = 1;
let started = false;
let running = false;
let last = 0;
let accumulator = 0;
let steamUntil = 0;
let messageTimer = null;
let showDiag = false;
let wantCamera = true;

// ---------------------------------------------------------------- layout

function layout() {
  const rect = el.app.getBoundingClientRect();
  viewW = Math.max(1, rect.width);
  viewH = Math.max(1, rect.height);
  const short = Math.min(viewW, viewH);
  cellSize = short / GRID_SHORT;
  const cols = Math.max(32, Math.round(viewW / cellSize));
  const rows = Math.max(32, Math.round(viewH / cellSize));
  surface.resize(cols, rows);
  surface.setScale(cellSize);
  flows.setScale(cellSize);
  renderer.setSurfaceSize(cols, rows);
  // Cap the backing store: refraction is per-pixel, and a retina tablet at full
  // density is a lot of pixels for a phone GPU to blur nine times over.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const budget = 2.6e6;
  const scale = Math.min(dpr, Math.sqrt(budget / (viewW * viewH)));
  renderer.resize(viewW, viewH, Math.max(1, scale));
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 150);
});
window.addEventListener('orientationchange', () => setTimeout(layout, 250));

// ---------------------------------------------------------------- input

new PointerPaths(el.surface, (stroke) => {
  if (!started) return;
  const g = gravity.vector();
  const r = FINGER_PX / cellSize;
  const x0 = stroke.x0 / cellSize;
  const y0 = stroke.y0 / cellSize;
  const x1 = stroke.x1 / cellSize;
  const y1 = stroke.y1 / cellSize;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.55)));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    surface.wipe(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, g, stroke.speed);
  }
  wake();
});

// ---------------------------------------------------------------- loop

function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  accumulator = 0;
  requestAnimationFrame(frame);
}

function frame(now) {
  if (!running) return;
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += dt;

  const g = gravity.vector();
  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    if (now < steamUntil) surface.steam(0.55 * STEP);
    surface.tick(STEP, g);
    flows.update(STEP, g);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  renderer.draw(surface, flows.heads, el.video);
  if (showDiag) updateDiag(g);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- controls

function showMessage(text) {
  el.message.textContent = text || '';
  el.message.classList.toggle('show', !!text);
  clearTimeout(messageTimer);
  if (text) messageTimer = setTimeout(() => el.message.classList.remove('show'), 4200);
}

function updateControls() {
  const live = camera.enabled;
  el.cameraBtn.setAttribute('aria-pressed', live ? 'true' : 'false');
  el.cameraBtn.textContent = live ? 'Camera on' : 'Camera off';
  el.infoBtn.setAttribute('aria-pressed', showDiag ? 'true' : 'false');
}

function updateDiag(g) {
  const d = gravity.debug();
  el.diag.textContent = [
    `gravity  ${g.x >= 0 ? ' ' : ''}${g.x.toFixed(2)}, ${g.y >= 0 ? ' ' : ''}${g.y.toFixed(2)}   plane ${g.plane.toFixed(2)}`,
    `raw      ${d.raw.x.toFixed(2)}, ${d.raw.y.toFixed(2)}, ${d.raw.z.toFixed(2)}`,
    `sensor   ${d.enabled ? 'devicemotion' : 'off (screen down)'}`,
    `heads    ${flows.heads.length}   merges ${flows.merges}`,
    `water    surface ${surface.totalWater().toFixed(0)}  moving ${flows.totalMass().toFixed(0)}`,
    `renderer ${renderer.ok ? 'webgl' : '2d fallback'}`,
  ].join('\n');
}

el.steamBtn.addEventListener('click', () => {
  steamUntil = performance.now() + 1600;
  wake();
});

// Not the same as Steam: this clears the glass of water, streaks and memory and
// puts an even sheet of fresh condensation back on it.
el.freshBtn.addEventListener('click', () => {
  surface.refresh();
  flows.reset();
  steamUntil = 0;
  wake();
});

el.cameraBtn.addEventListener('click', async () => {
  if (camera.enabled) {
    camera.stop();
    wantCamera = false;
  } else {
    wantCamera = true;
    const ok = await camera.start();
    if (!ok) showMessage('No camera — the glass still works');
  }
  updateControls();
});

el.infoBtn.addEventListener('click', () => {
  showDiag = !showDiag;
  el.diag.hidden = !showDiag;
  updateControls();
});

// ---------------------------------------------------------------- start

async function begin() {
  if (started) return;
  started = true;
  el.start.hidden = true;
  layout();

  const cam = await camera.start();
  if (!cam) showMessage('No camera — the glass still works');
  const motion = await gravity.start();
  if (!motion) showMessage('No motion sensor — water runs down the screen');

  surface.steam(0.35);
  updateControls();
  wake();
}

el.start.addEventListener('click', begin);
el.start.addEventListener('pointerdown', (e) => e.preventDefault());

// ---------------------------------------------------------------- lifecycle

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    camera.stop();
    running = false;
  } else if (started) {
    if (wantCamera) camera.start().then(updateControls);
    wake();
  }
});

window.addEventListener('pagehide', () => { camera.stop(); gravity.stop(); });

// ---------------------------------------------------------------- boot

layout();
renderer.draw(surface, flows.heads, el.video);

// Handy from Safari's inspector on a real device; it cannot capture anything.
window.fogMirror = { surface, flows, gravity, renderer, camera, layout, cellSize: () => cellSize };
