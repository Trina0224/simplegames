// app.js — state, controls, and the frame loop that ties the blind to the camera.

import { Blind, MAX_ANGLE } from './blind.js';
import { BlindView, slatCountFor } from './render.js';
import { Camera, CAMERA_MESSAGES } from './camera.js';
import { Clack } from './sound.js';

const PREFS_KEY = 'blinds.prefs.v1';
const STEP = 1 / 120;
const MAX_STEPS = 6;

const el = {
  app: document.getElementById('app'),
  window: document.getElementById('window'),
  slats: document.getElementById('slats'),
  touch: document.getElementById('touch'),
  video: document.getElementById('video'),
  start: document.getElementById('start'),
  message: document.getElementById('message'),
  live: document.getElementById('live'),
  cameraBtn: document.getElementById('cameraBtn'),
  flipBtn: document.getElementById('flipBtn'),
  soundBtn: document.getElementById('soundBtn'),
  openBtn: document.getElementById('openBtn'),
};

const prefs = loadPrefs();
const blind = new Blind();
const view = new BlindView(el.slats);
const camera = new Camera(el.video);
const clack = new Clack();
clack.enabled = prefs.sound;

const pointers = new Map();
let rectTop = 0;
let running = false;
let last = 0;
let accumulator = 0;
let held = false;
let messageTimer = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
blind.overshoot = !reduceMotion.matches;
reduceMotion.addEventListener('change', () => { blind.overshoot = !reduceMotion.matches; });

// ---------------------------------------------------------------- layout

function layout() {
  const rect = el.window.getBoundingClientRect();
  rectTop = rect.top;
  const count = slatCountFor(rect.height);
  view.build(rect.height, count);
  blind.resize(count, rect.height / count);
  view.draw(blind.angles);
  wake();
}

let resizeTimer = null;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
}

// ---------------------------------------------------------------- loop

function wake() {
  if (running) return;
  running = true;
  view.setAnimating(true);
  last = performance.now();
  accumulator = 0;
  requestAnimationFrame(frame);
}

function frame(now) {
  if (!running) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;

  let steps = 0;
  let impact = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    impact = Math.max(impact, blind.step(STEP));
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === MAX_STEPS) accumulator = 0;
  if (impact > 0) clack.play(impact);

  view.draw(blind.angles);
  el.app.style.setProperty('--openness', blind.openness.toFixed(3));

  if (blind.idle) {
    running = false;
    view.setAnimating(false);
    return;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- input

function pointerYs() {
  return [...pointers.values()];
}

function syncPointers() {
  blind.setPointers(pointerYs());
  wake();
}

el.touch.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointers.set(e.pointerId, e.clientY - rectTop);
  try { el.touch.setPointerCapture(e.pointerId); } catch (_) { /* mouse fallback */ }
  syncPointers();
});

el.touch.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, e.clientY - rectTop);
  syncPointers();
});

const endPointer = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  syncPointers();
};
el.touch.addEventListener('pointerup', endPointer);
el.touch.addEventListener('pointercancel', endPointer);
el.touch.addEventListener('lostpointercapture', endPointer);
// Safety net: a pointer that ends outside the layer must not leave a gap open.
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
el.touch.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- controls

function announce(text) {
  el.live.textContent = text;
}

function showMessage(text) {
  el.message.textContent = text || '';
  el.message.classList.toggle('show', !!text);
  clearTimeout(messageTimer);
  if (text) messageTimer = setTimeout(() => el.message.classList.remove('show'), 4200);
}

function updateControls() {
  el.cameraBtn.setAttribute('aria-pressed', camera.state === 'live' ? 'true' : 'false');
  el.cameraBtn.textContent = camera.state === 'live' ? 'Camera on' : 'Camera off';
  el.soundBtn.setAttribute('aria-pressed', clack.enabled ? 'true' : 'false');
  el.soundBtn.textContent = clack.enabled ? 'Sound on' : 'Sound off';
  el.openBtn.setAttribute('aria-pressed', held ? 'true' : 'false');
  el.openBtn.textContent = held ? 'Close' : 'Open';
  el.app.classList.toggle('no-camera', camera.state !== 'live');
}

camera.onchange = (state) => {
  updateControls();
  if (state !== 'live') showMessage(CAMERA_MESSAGES[state] || '');
};

el.cameraBtn.addEventListener('click', async () => {
  if (camera.running) {
    camera.stop();
    prefs.camera = false;
  } else {
    prefs.camera = true;
    await camera.start();
  }
  savePrefs();
  updateControls();
  announce(camera.state === 'live' ? 'Camera on' : 'Camera off');
});

el.flipBtn.addEventListener('click', async () => {
  if (!camera.running) return;
  await camera.flip();
  updateControls();
});

el.soundBtn.addEventListener('click', () => {
  clack.enabled = !clack.enabled;
  prefs.sound = clack.enabled;
  savePrefs();
  updateControls();
  announce(clack.enabled ? 'Sound on' : 'Sound off');
});

el.openBtn.addEventListener('click', () => {
  held = !held;
  blind.setHeld(held ? 1 : 0);
  wake();
  updateControls();
  announce(held ? 'Blinds open' : 'Blinds closed');
});

// ---------------------------------------------------------------- start

async function begin() {
  el.start.hidden = true;
  el.touch.focus({ preventScroll: true });
  clack.start();
  if (prefs.camera) await camera.start();
  if (await camera.hasMultipleCameras()) el.flipBtn.hidden = false;
  updateControls();
}

el.start.addEventListener('click', begin);
el.start.addEventListener('pointerdown', (e) => e.preventDefault());

// ---------------------------------------------------------------- lifecycle

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Release the camera whenever the window is not being looked through.
    camera.stop();
    pointers.clear();
    blind.setPointers([]);
  } else if (prefs.camera && el.start.hidden) {
    camera.start().then(updateControls);
  }
});

window.addEventListener('pagehide', () => camera.stop());
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- prefs

function loadPrefs() {
  const defaults = { camera: true, sound: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (_) {
    return defaults;
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* private mode */ }
}

// ---------------------------------------------------------------- boot

layout();
blind.settle();
view.draw(blind.angles);
updateControls();

// Handy from a phone's web inspector; carries no capture ability of its own.
window.blinds = { blind, view, camera, clack, MAX_ANGLE };
