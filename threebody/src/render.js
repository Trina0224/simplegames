// render.js — drawing, and only drawing.
//
// Nothing here computes a trajectory or moves anything. It is handed physical
// states in rotating coordinates and a frame to show them in, and its whole job
// is to make the geometry legible: which regions are closed, where the
// equilibria are, what the spacecraft is doing now.
//
// The one liberty is body size. Earth at true scale on this view is three pixels
// and the Moon is under one, so both are drawn larger. SPEC.md separates
// physicalRadius from renderRadius for exactly this reason, and the enlarged
// radius never reaches the physics: collision is tested against the real one in
// trajectory.js and cannot see this file.

import { EARTH_RADIUS, MOON_RADIUS, DU_KM } from './constants.js';
import { toInertial, bodies, movePoints } from './frames.js';

const EARTH_DRAW = 0.055;
const MOON_DRAW = 0.030;

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Framed so that the co-orbital region fits and L5 is not underneath the
    // controls: the horseshoe reaches r = 1.37, and both triangular points have
    // to be visible at once or the thing it encloses cannot be seen.
    this.span = 3.7;                 // DU across the shorter axis
    this.centre = [0.06, -0.20];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.scale = Math.min(this.w, this.h) / this.span;
  }

  toScreen(x, y) {
    return [
      this.w / 2 + (x - this.centre[0]) * this.scale,
      this.h / 2 - (y - this.centre[1]) * this.scale,
    ];
  }

  toModel(px, py) {
    return [
      (px - this.w / 2) / this.scale + this.centre[0],
      -(py - this.h / 2) / this.scale + this.centre[1],
    ];
  }

  draw(view) {
    const { ctx } = this;
    const { frame, t, points, trail, head, velocity, zvc, plan, burn, showZvc, showVel } = view;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, this.w, this.h);

    const P = (x, y) => this.toScreen(x, y);

    // --- the forbidden region -------------------------------------------
    // Drawn as the curve rather than a filled area: filling needs to know which
    // side is inside, and the inside is disconnected at these energies.
    if (showZvc && zvc && zvc.length) {
      ctx.strokeStyle = 'rgba(120, 170, 255, 0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < zvc.length; i += 4) {
        let [ax, ay] = [zvc[i], zvc[i + 1]];
        let [bx, by] = [zvc[i + 2], zvc[i + 3]];
        if (frame === 'inertial') {
          const c = Math.cos(t), s = Math.sin(t);
          [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
          [bx, by] = [bx * c - by * s, bx * s + by * c];
        }
        const a = P(ax, ay), b = P(bx, by);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }

    // --- the trail --------------------------------------------------------
    if (trail && trail.n > 1) {
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // fades into the past, so a long horseshoe still reads as a direction
      const N = trail.n;
      const step = Math.max(1, Math.floor(N / 2200));
      let prev = null;
      for (let i = 0; i < N; i += step) {
        let x = trail.xs[i], y = trail.ys[i];
        if (frame === 'inertial') {
          const tt = trail.ts[i], c = Math.cos(tt), s = Math.sin(tt);
          [x, y] = [x * c - y * s, x * s + y * c];
        }
        const p = P(x, y);
        if (prev) {
          const age = i / N;
          ctx.strokeStyle = `rgba(126, 214, 255, ${0.10 + 0.75 * age * age})`;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
        prev = p;
      }
    }

    // --- primaries and barycentre ----------------------------------------
    const b = bodies(t, frame);
    const bc = P(b.barycenter[0], b.barycenter[1]);
    ctx.strokeStyle = 'rgba(190, 200, 220, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bc[0] - 5, bc[1]); ctx.lineTo(bc[0] + 5, bc[1]);
    ctx.moveTo(bc[0], bc[1] - 5); ctx.lineTo(bc[0], bc[1] + 5);
    ctx.stroke();

    const drawBody = (pos, rDraw, fill, glow, label) => {
      const p = P(pos[0], pos[1]);
      const r = Math.max(3, rDraw * this.scale);
      const g = ctx.createRadialGradient(p[0], p[1], r * 0.2, p[0], p[1], r * 2.6);
      g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(215, 228, 240, 0.85)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText(label, p[0] + r + 6, p[1] + 4);
    };
    drawBody(b.earth, EARTH_DRAW, '#4e86c6', 'rgba(78,134,198,0.30)', 'Earth');
    drawBody(b.moon, MOON_DRAW, '#b9bec7', 'rgba(185,190,199,0.22)', 'Moon');

    // --- equilibria -------------------------------------------------------
    ctx.font = '11px ui-monospace, Menlo, monospace';
    for (const p of movePoints(points, t, frame)) {
      const s = P(p.px, p.py);
      const unstable = p.unstable;
      ctx.strokeStyle = unstable ? 'rgba(255, 170, 120, 0.85)' : 'rgba(150, 240, 190, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (unstable) {                    // a cross: a saddle, nothing rests here
        ctx.moveTo(s[0] - 4, s[1] - 4); ctx.lineTo(s[0] + 4, s[1] + 4);
        ctx.moveTo(s[0] + 4, s[1] - 4); ctx.lineTo(s[0] - 4, s[1] + 4);
      } else {                           // a ring: things can stay
        ctx.arc(s[0], s[1], 4.5, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.fillStyle = unstable ? 'rgba(255, 190, 150, 0.9)' : 'rgba(170, 245, 205, 0.9)';
      ctx.fillText(p.name, s[0] + 8, s[1] - 6);
    }

    // --- the planned burn's path, before it is committed -------------------
    if (plan && plan.xs && plan.xs.length > 1) {
      ctx.strokeStyle = 'rgba(255, 214, 120, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < plan.xs.length; i += 1) {
        let x = plan.xs[i], y = plan.ys[i];
        if (frame === 'inertial') {
          const tt = t + plan.ts[i], c = Math.cos(tt), s = Math.sin(tt);
          [x, y] = [x * c - y * s, x * s + y * c];
        }
        const p = P(x, y);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- the spacecraft ----------------------------------------------------
    if (head) {
      let [x, y, vx, vy] = head;
      if (frame === 'inertial') [x, y, vx, vy] = toInertial(x, y, vx, vy, t);
      const p = P(x, y);
      if (showVel && velocity !== false) {
        const k = 0.35;
        const q = P(x + vx * k, y + vy * k);
        ctx.strokeStyle = 'rgba(126, 214, 255, 0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        ctx.beginPath();
        ctx.moveTo(q[0], q[1]);
        ctx.lineTo(q[0] - 6 * Math.cos(ang - 0.4), q[1] - 6 * Math.sin(ang - 0.4));
        ctx.lineTo(q[0] - 6 * Math.cos(ang + 0.4), q[1] - 6 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fillStyle = 'rgba(126, 214, 255, 0.8)';
        ctx.fill();
      }
      if (burn) {
        const q = P(x + burn[0] * 0.35, y + burn[1] * 0.35);
        ctx.strokeStyle = 'rgba(255, 214, 120, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.stroke();
    }

    // --- scale bar ---------------------------------------------------------
    const barDu = 0.5;
    const px = barDu * this.scale;
    ctx.strokeStyle = 'rgba(190, 205, 225, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, this.h - 20); ctx.lineTo(16 + px, this.h - 20);
    ctx.moveTo(16, this.h - 24); ctx.lineTo(16, this.h - 16);
    ctx.moveTo(16 + px, this.h - 24); ctx.lineTo(16 + px, this.h - 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190, 205, 225, 0.7)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(`${(barDu * DU_KM / 1000).toFixed(0)}e3 km`, 16, this.h - 26);

    ctx.restore();
  }
}

export { EARTH_RADIUS, MOON_RADIUS };
