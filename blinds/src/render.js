// render.js — builds the slats and writes their transforms. Nothing else touches the DOM.

import { MAX_ANGLE } from './blind.js';

const TARGET_PITCH = 60;   // CSS px between slat centre lines
const MIN_SLATS = 6;
const MAX_SLATS = 22;
const EPSILON = 0.05;      // degrees; below this a slat is not worth rewriting

export function slatCountFor(height) {
  const raw = Math.round(height / TARGET_PITCH);
  return Math.max(MIN_SLATS, Math.min(MAX_SLATS, raw));
}

export class BlindView {
  constructor(container) {
    this.container = container;
    this.slats = [];
    this.written = new Float32Array(0);
    this.height = 0;
    this.pitch = 0;
  }

  /** Build (or rebuild) the slats for the current container size. */
  build(height, count) {
    this.height = height;
    this.count = count;
    this.pitch = height / count;
    const frag = document.createDocumentFragment();
    this.slats = [];
    for (let i = 0; i < count; i += 1) {
      const slat = document.createElement('div');
      slat.className = 'slat';
      // A hair of overlap so sub-pixel rounding never opens a seam when shut.
      slat.style.height = `${this.pitch * 1.02}px`;
      slat.style.top = `${i * this.pitch - this.pitch * 0.01}px`;
      frag.append(slat);
      this.slats.push(slat);
    }
    this.container.replaceChildren(frag);
    this.written = new Float32Array(count).fill(NaN);
  }

  /** Write only transforms and filters — never anything that costs layout. */
  draw(angles) {
    const { slats, written } = this;
    for (let i = 0; i < slats.length; i += 1) {
      const angle = angles[i];
      if (Math.abs(angle - written[i]) < EPSILON) continue;
      written[i] = angle;
      const cos = Math.cos((angle * Math.PI) / 180);
      const slat = slats[i];
      slat.style.transform = `rotateX(${angle.toFixed(2)}deg)`;
      // Face-on catches the light; edge-on falls into shadow.
      slat.style.filter = `brightness(${(0.58 + 0.42 * cos).toFixed(3)})`;
      slat.style.setProperty('--open', (1 - cos).toFixed(3));
    }
  }

  /** Promote the slats only while they are actually moving. */
  setAnimating(on) {
    this.container.classList.toggle('animating', on);
  }
}

export { MAX_ANGLE };
