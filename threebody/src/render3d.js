// render3d.js — an orthographic look at a six-state history.
//
// Orthographic on purpose. THREE_D_RESEARCH.md argues for it and the reason is
// specific: under perspective the apparent size of a loop depends on how far
// away it is, so you cannot judge whether the far side of a halo is the same
// width as the near side. Orthographically you can, and judging orbit shape is
// the entire job. Perspective would look better and tell you less.
//
// The camera is azimuth, elevation, centre and span, and it is presentation
// only -- THREE_D_AGENT.md rule 8. It receives states; it never makes them.
//
// The two things that make out-of-plane motion legible, and they matter more
// than the shading:
//
//   the z = 0 grid      something to be above and below. Without a reference
//                       plane a tilted loop just looks like a loop.
//   the ground track    the orbit projected straight down onto that plane, plus
//                       a dropline from the spacecraft. This is what SPEC.md 6
//                       asks for when it says a user should be able to check how
//                       the 3D orbit projects into the planar geometry -- except
//                       it is visible from every angle, not only from the top.

import { EARTH_RADIUS, MOON_RADIUS, DU_KM } from './constants.js?v=20260830n';
import { displayPos3, displayState3, bodies3 } from './frames3d.js?v=20260830n';
import { spriteHandle } from './render.js?v=20260830n';

// Bodies are drawn at their PHYSICAL radius, with a floor and a ceiling in
// screen pixels. The planar view inflates them because the whole Earth-Moon
// system is in frame and Earth is three pixels at true scale; a halo view is
// zoomed into a region 0.15 DU across, where the Moon's real 1737 km is already
// 27 px and the inflated radius would swallow the orbit. Same rule, opposite
// consequence: the marker must stay a marker.
const BODY_MIN_PX = 3;
const BODY_MAX_PX = 90;
export const MIN_SPAN3 = 0.05;
export const MAX_SPAN3 = 14;

/** The named viewpoints. Azimuth and elevation in degrees. */
// The three orthogonal projections halo work is normally read in, plus a tilt.
//
// `side` looking along -y turns out to be the LEAST useful of the three for a
// halo: x and z co-vary along the orbit, so the x-z projection collapses to
// nearly a straight line. Measured on the L1 preset, it is 74 px wide against
// 177 tall. That is physically correct and visually useless, which is why `end`
// exists -- looking along the Earth-Moon line, where the out-of-plane loop opens
// out and the z excursion is the thing you are looking at.
export const VIEWS = {
  // x to the right, y up: lands exactly on the 2D picture
  top: { az: -90, el: 90 },
  // x right, z up, looking along -y
  side: { az: -90, el: 0 },
  // y right, z up, looking down the Earth-Moon line: the halo's own loop
  end: { az: 0, el: 0 },
  // enough tilt to read the plane as a plane
  oblique: { az: -62, el: 26 },
};

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 1; this.h = 1; this.dpr = 1; this.scale = 1;
    this.span = 1.6;
    this.centre = [0.9, 0, 0];
    this.az = VIEWS.oblique.az;
    this.el = VIEWS.oblique.el;
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.w = w; this.h = h; this.dpr = dpr;
    this.scale = Math.min(w, h) / this.span;
  }

  /** The camera basis. `fwd` points from the scene toward the viewer. */
  basis() {
    const a = (this.az * Math.PI) / 180, e = (this.el * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const fwd = [ce * ca, ce * sa, se];
    const right = [-sa, ca, 0];
    const up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
    return { fwd, right, up };
  }

  /** World -> screen, plus the depth that decides what is drawn in front. */
  project(x, y, z, b = this.basis()) {
    const dx = x - this.centre[0], dy = y - this.centre[1], dz = z - this.centre[2];
    const sx = dx * b.right[0] + dy * b.right[1] + dz * b.right[2];
    const sy = dx * b.up[0] + dy * b.up[1] + dz * b.up[2];
    const d = dx * b.fwd[0] + dy * b.fwd[1] + dz * b.fwd[2];
    return [this.w / 2 + sx * this.scale, this.h / 2 - sy * this.scale, d];
  }

  /**
   * The world point on the horizontal plane z = h that projects to this pixel.
   *
   * The whole difficulty of editing in 3D with a 2D pointer, in one function: a
   * screen point is a LINE through the scene, not a point, so something has to
   * pick the depth. Choosing a horizontal plane is the choice that stays
   * understandable -- the user is placing a thing at a height they set
   * separately, which is why z and vz get their own controls rather than being
   * inferred from a drag.
   *
   * Returns null when the camera is edge-on to that plane, because then the line
   * never meets it and any answer would be invented.
   */
  toPlane(px, py, h, minTilt = 0.2) {
    const b = this.basis();
    if (Math.abs(b.fwd[2]) < minTilt) return null;      // camera too close to level
    const u = (px - this.w / 2) / this.scale;
    const v = -(py - this.h / 2) / this.scale;
    const a = [0, 1, 2].map((i) => this.centre[i] + b.right[i] * u + b.up[i] * v);
    const d = (h - a[2]) / b.fwd[2];
    return [a[0] + b.fwd[0] * d, a[1] + b.fwd[1] * d, h];
  }

  /** Is the camera tilted enough for in-plane dragging to mean anything? */
  canPlace(minTilt = 0.2) { return Math.abs(this.basis().fwd[2]) >= minTilt; }

  setView({ az, el, span, centre }) {
    if (Number.isFinite(az)) this.az = az;
    if (Number.isFinite(el)) this.el = Math.max(-89.9, Math.min(89.9, el));
    if (Number.isFinite(span)) this.span = Math.max(MIN_SPAN3, Math.min(MAX_SPAN3, span));
    if (centre) this.centre = centre.slice();
  }

  orbitBy(dxPx, dyPx) {
    this.az -= dxPx * 0.4;
    this.el = Math.max(-89.9, Math.min(89.9, this.el + dyPx * 0.35));
  }

  zoomBy(factor) {
    this.span = Math.max(MIN_SPAN3, Math.min(MAX_SPAN3, this.span / factor));
    this.resize();
  }

  /**
   * Zoom about a point on the SCREEN, keeping whatever is there where it is.
   *
   * The wheel handler used to zoom about the scene centre, on the reasoning that
   * "the point under the pointer" is a whole line through an orthographic scene
   * and choosing a depth for it would be a guess. That reasoning is about picking
   * a model point, and this needs no model point: keeping a screen point fixed is
   * a shift within the projection plane, which is exactly what panByPixels does,
   * and no depth enters it.
   *
   * It matters because fitSpatial deliberately puts the orbit ABOVE the scene
   * centre -- the controls cover the bottom of the canvas -- so a zoom about the
   * centre pushed the orbit off the top of the screen. Seven wheel clicks in on a
   * fitted view left an empty canvas.
   */
  zoomAt(px, py, factor) {
    const before = this.span;
    this.zoomBy(factor);
    const k = before / this.span;          // what the zoom actually did, after clamping
    if (k === 1) return;
    this.panByPixels(-(px - this.w / 2) * (k - 1), -(py - this.h / 2) * (k - 1));
  }

  /** Pan across the screen plane, so dragging moves what is under the finger. */
  panByPixels(dxPx, dyPx) {
    const b = this.basis();
    const k = 1 / this.scale;
    for (let i = 0; i < 3; i += 1) {
      this.centre[i] -= dxPx * k * b.right[i];
      this.centre[i] += dyPx * k * b.up[i];
    }
  }

  draw(view) {
    const { ctx } = this;
    const { frame, t, points, trail, whole, head, showPlane, showTrack, sprite, compare, inset } = view;
    this.resize();
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, this.w, this.h);
    const b = this.basis();
    const P = (x, y, z) => this.project(x, y, z, b);

    // --- the reference plane ------------------------------------------------
    if (showPlane) this._plane(P);

    const bod = bodies3(t, frame);

    // --- the whole orbit, faintly ------------------------------------------
    //
    // A halo is periodic, and the point of showing one is that it CLOSES. Drawing
    // only the part flown so far means the closure is visible for one frame and
    // then playback wraps and the evidence is gone. The complete propagated path
    // stays under the travelled one, so the loop is always there to be checked
    // against -- and it is the same integrated history, not a second curve.
    if (whole && whole.n > 1) {
      ctx.strokeStyle = 'rgba(120, 180, 240, 0.22)';
      ctx.lineWidth = 1;
      this._path(P, whole, frame, (i) => whole.zs[i]);
      ctx.stroke();
    }

    // --- a second orbit, for comparison --------------------------------------
    //
    // Drawn in its own colour and never in the trajectory's, because it is a
    // different trajectory and the whole point of the demo is telling them apart.
    // Same equations, same integrator, same frame -- so this is a comparison
    // within one model rather than an illustration laid over one.
    // Amber and DASHED against the trajectory's solid blue. Colour alone would be
    // the only thing separating them on a colour-blind reader's screen and on a
    // printout, and these two curves are the whole point of the demo.
    const compareStroke = (side) => {
      ctx.save();
      ctx.strokeStyle = side > 0 ? 'rgba(255, 196, 92, 0.85)' : 'rgba(255, 196, 92, 0.42)';
      ctx.lineWidth = side > 0 ? 1.6 : 1.2;
      ctx.setLineDash([5, 3]);
      this._path(P, compare.run, frame, (i) => compare.run.zs[i], side,
                 P(bodies3(t, frame).moon[0], bodies3(t, frame).moon[1], bodies3(t, frame).moon[2])[2]);
      ctx.stroke();
      ctx.restore();
    };
    if (compare && compare.run && compare.run.n > 1) {
      compareStroke(-1);              // the far half, before the bodies
    }

    // --- the ground track: the orbit flattened onto z = 0 --------------------
    if (showTrack && whole && whole.n > 1) {
      ctx.strokeStyle = 'rgba(120, 170, 220, 0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      this._path(P, whole, frame, () => 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- the primaries, drawn behind or in front by their own depth ---------
    const drawBodies = (wantFront) => {
      for (const [name, p, r, fill, rim] of [
        ['Earth', bod.earth, EARTH_RADIUS, '#2a5f96', 'rgba(120, 180, 240, 0.5)'],
        ['Moon', bod.moon, MOON_RADIUS, '#8f949c', 'rgba(200, 205, 215, 0.5)'],
      ]) {
        const q = P(p[0], p[1], p[2]);
        if ((q[2] >= 0) !== wantFront) continue;
        const rad = Math.max(BODY_MIN_PX, Math.min(BODY_MAX_PX, r * this.scale));
        const g = ctx.createRadialGradient(q[0] - rad * 0.3, q[1] - rad * 0.3, rad * 0.1, q[0], q[1], rad);
        g.addColorStop(0, fill);
        g.addColorStop(1, 'rgba(10, 16, 26, 1)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rim; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(200, 214, 232, 0.72)';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(name, q[0] + rad + 6, q[1] + 4);
      }
    };
    drawBodies(false);

    // ...and the near half of the comparison orbit, over them
    if (compare && compare.run && compare.run.n > 1) {
      compareStroke(1);
      if (compare.head) {
        const q = P(compare.head[0], compare.head[1], compare.head[2]);
        ctx.fillStyle = 'rgba(255, 214, 130, 0.95)';
        ctx.beginPath(); ctx.arc(q[0], q[1], 3.4, 0, Math.PI * 2); ctx.fill();
      }
      if (compare.label) {
        const m = bodies3(t, frame).moon;
        const q = compare.head ? P(compare.head[0], compare.head[1], compare.head[2])
                               : P(m[0], m[1], m[2]);
        ctx.fillStyle = 'rgba(255, 214, 130, 0.85)';
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(compare.label, q[0] + 8, q[1] - 6);
      }
    }

    // --- the equilibria ------------------------------------------------------
    if (points) {
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      for (const p of points) {
        const [px, py, pz] = displayPos3(p.x, p.y, 0, t, frame);
        const q = P(px, py, pz);
        const un = p.unstable;
        ctx.strokeStyle = un ? 'rgba(226, 148, 106, 0.55)' : 'rgba(126, 206, 164, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (un) {
          ctx.moveTo(q[0] - 3.4, q[1] - 3.4); ctx.lineTo(q[0] + 3.4, q[1] + 3.4);
          ctx.moveTo(q[0] + 3.4, q[1] - 3.4); ctx.lineTo(q[0] - 3.4, q[1] + 3.4);
        } else ctx.arc(q[0], q[1], 3.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = un ? 'rgba(226, 160, 120, 0.62)' : 'rgba(140, 214, 176, 0.62)';
        ctx.fillText(p.name, q[0] + 6, q[1] - 5);
      }
    }

    // --- the trajectory ------------------------------------------------------
    if (trail && trail.n > 1) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(96, 190, 255, 0.10)';
      ctx.lineWidth = 5;
      this._path(P, trail, frame, (i) => trail.zs[i]);
      ctx.stroke();
      // brightening toward now, and the near side drawn heavier than the far
      const N = trail.n, step = Math.max(1, Math.floor(N / 2400));
      let prev = null;
      for (let i = 0; i < N; i += step) {
        const [x, y, z] = frame === 'rotating'
          ? [trail.xs[i], trail.ys[i], trail.zs[i]]
          : displayPos3(trail.xs[i], trail.ys[i], trail.zs[i], trail.ts[i], frame);
        const q = P(x, y, z);
        if (prev) {
          const age = i / N;
          const near = Math.max(0, Math.min(1, 0.5 + q[2] / this.span));
          ctx.strokeStyle = `rgba(150, 222, 255, ${(0.16 + 0.8 * age * age) * (0.45 + 0.55 * near)})`;
          ctx.lineWidth = 1.2 + 1.4 * near;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
        prev = q;
      }
    }

    drawBodies(true);

    // --- the spacecraft, and its dropline to the plane -----------------------
    if (head) {
      const [x, y, z, vx, vy, vz] = displayState3(
        head[0], head[1], head[2], head[3], head[4], head[5], t, frame);
      const q = P(x, y, z);
      const foot = P(x, y, 0);
      ctx.strokeStyle = 'rgba(150, 222, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150, 222, 255, 0.5)';
      ctx.beginPath(); ctx.arc(foot[0], foot[1], 2, 0, Math.PI * 2); ctx.fill();

      const halo = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 16);
      halo.addColorStop(0, 'rgba(180, 236, 255, 0.32)');
      halo.addColorStop(1, 'rgba(180, 236, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(q[0], q[1], 16, 0, Math.PI * 2); ctx.fill();

      // the sprite points along the screen projection of the velocity
      const vq = P(x + vx * 0.02, y + vy * 0.02, z + vz * 0.02);
      const ang = Math.atan2(vq[1] - q[1], vq[0] - q[0]);
      this._craft(q[0], q[1], ang, 13);
    }

    if (view.edit) this._editor3(view.edit, P, b);

    if (inset) this._inset(inset, b, frame, t);
    this._scaleBar(view.avoid);
    ctx.restore();
  }

  /**
   * A magnified circle over one part of the scene.
   *
   * It exists because the honest comparison is unwatchable at one scale. A 100 km
   * lunar orbit is 3474 km across and the Gateway-like NRHO is 141 000 km; framed
   * together the low orbit is a dot two pixels wide, which is TRUE and tells the
   * reader nothing. Shrinking the NRHO or inflating the low orbit would fix the
   * picture by lying about it, so instead the same trajectories are drawn twice,
   * at two scales, and the magnification is stated on the bubble.
   *
   * Same camera angle, same frame, same propagated arrays -- only the centre and
   * the scale differ. There is no second integration and no second geometry.
   */
  _inset(ins, b, frame, t) {
    const { ctx } = this;
    const { centre, span, radius, paths = [], marks = [], label } = ins;
    const cx = ins.at ? ins.at[0] : this.w - radius - 18;
    const cy = ins.at ? ins.at[1] : radius + 18;
    const scale = (2 * radius) / span;
    const P = (x, y, z) => {
      const dx = x - centre[0], dy = y - centre[1], dz = z - centre[2];
      return [
        cx + (dx * b.right[0] + dy * b.right[1] + dz * b.right[2]) * scale,
        cy - (dx * b.up[0] + dy * b.up[1] + dz * b.up[2]) * scale,
        dx * b.fwd[0] + dy * b.fwd[1] + dz * b.fwd[2],
      ];
    };

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#070b14';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // the Moon at its physical radius, which at this scale is a disc rather than
    // the minimum-size dot the wide view has to draw it as
    const bod = bodies3(t, frame);
    const q = P(bod.moon[0], bod.moon[1], bod.moon[2]);
    const rad = MOON_RADIUS * scale;
    const g = ctx.createRadialGradient(q[0] - rad * 0.3, q[1] - rad * 0.3, rad * 0.1, q[0], q[1], rad);
    g.addColorStop(0, '#8f949c'); g.addColorStop(1, 'rgba(10, 16, 26, 1)');

    // Far halves first, then the Moon is already drawn, then near halves -- same
    // depth split as the main view, so an orbit that goes round the Moon looks
    // like it goes round the Moon rather than over it.
    for (const side of [-1, 1]) {
      for (const pa of paths) {
        if (!pa.run || pa.run.n < 2) continue;
        ctx.strokeStyle = side > 0 ? pa.color : (pa.far || pa.color);
        ctx.lineWidth = (pa.width || 1.2) * (side > 0 ? 1 : 0.8);
        ctx.globalAlpha = side > 0 ? 1 : 0.45;
        if (pa.dash) ctx.setLineDash(pa.dash);
        this._path(P, pa.run, frame, (i) => pa.run.zs[i], side, q[2]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (side < 0) {
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(200, 205, 215, 0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const m of marks) {
      if (!m.at) continue;
      const p = P(m.at[0], m.at[1], m.at[2]);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(p[0], p[1], m.r || 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(170, 190, 214, 0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    if (label) {
      ctx.fillStyle = 'rgba(190, 208, 230, 0.8)';
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + radius + 13);
      ctx.textAlign = 'left';
    }
  }

  /**
   * The 3D editor: a preview, a craft on a dropline, and a velocity arrow that
   * also has one.
   *
   * Both droplines are the point. A loose arrow in an orthographic 3D scene is
   * unreadable -- you cannot tell whether it is pointing up and away or down and
   * toward you -- so every handle is tied to the z = 0 plane by a vertical line
   * and a foot marker. The foot says where it is; the line says how high.
   */
  _editor3(edit, P, b) {
    const { ctx } = this;
    const s = edit.state;
    const craft = P(s[0], s[1], s[2]);
    const foot = P(s[0], s[1], 0);

    if (edit.preview && edit.preview.n > 1) {
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = edit.valid ? 'rgba(126, 240, 190, 0.75)' : 'rgba(255, 128, 110, 0.7)';
      ctx.lineWidth = 1.6;
      this._path(P, edit.preview, 'rotating', (i) => edit.preview.zs[i]);
      ctx.stroke();
      ctx.restore();
    }

    const drop = (a, f, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(f[0], f[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(f[0], f[1], 2.5, 0, Math.PI * 2); ctx.fill();
    };
    drop(craft, foot, 'rgba(150, 222, 255, 0.5)');

    // the velocity arrow, and its own dropline
    const k = edit.arrowScale;
    const tipW = [s[0] + s[3] * k, s[1] + s[4] * k, s[2] + s[5] * k];
    const tip = P(...tipW);
    const tipFoot = P(tipW[0], tipW[1], 0);
    const moving = Math.hypot(s[3], s[4], s[5]) > 1e-9;
    ctx.strokeStyle = 'rgba(255, 214, 92, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash(moving ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(craft[0], craft[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.setLineDash([]);
    if (moving) drop(tip, tipFoot, 'rgba(255, 214, 92, 0.4)');
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 214, 92, 0.18)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 92, 0.85)'; ctx.lineWidth = 1.2; ctx.stroke();

    const halo = ctx.createRadialGradient(craft[0], craft[1], 0, craft[0], craft[1], 26);
    halo.addColorStop(0, edit.valid ? 'rgba(150, 220, 255, 0.26)' : 'rgba(255, 120, 100, 0.3)');
    halo.addColorStop(1, 'rgba(150, 220, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(craft[0], craft[1], 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = edit.valid ? 'rgba(150, 220, 255, 0.5)' : 'rgba(255, 120, 100, 0.85)';
    ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(craft[0], craft[1], 20, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    const ang = moving ? Math.atan2(tip[1] - craft[1], tip[0] - craft[0]) : edit.aim;
    this._craft(craft[0], craft[1], ang, 30);
  }

  /**
   * The spacecraft at a screen-pixel size, sprite or fallback.
   *
   * The same artwork the planar scene uses, loaded once and shared -- the sprite
   * is a UI marker and there is no reason for two copies of it, or for the two
   * scenes to disagree about which way its nose points.
   */
  _craft(px, py, ang, size) {
    const { ctx } = this;
    const sprite = spriteHandle();
    ctx.save();
    ctx.translate(px, py);
    if (sprite.ok) {
      ctx.rotate(ang + Math.PI / 2);          // source nose points up
      const box = size / (181 / 256);         // the artwork's share of its canvas
      ctx.drawImage(sprite.img, -box / 2, -box / 2, box, box);
    } else {
      const k = size / 14;
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(6.2 * k, 0); ctx.lineTo(-3.6 * k, 3.4 * k);
      ctx.lineTo(-1.8 * k, 0); ctx.lineTo(-3.6 * k, -3.4 * k);
      ctx.closePath();
      ctx.fillStyle = '#f2fbff'; ctx.fill();
      ctx.strokeStyle = 'rgba(120, 196, 236, 0.9)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  /** Where the editor's two handles are on screen, for hit testing. */
  handles3(edit) {
    const b = this.basis();
    const s = edit.state, k = edit.arrowScale;
    return {
      craft: this.project(s[0], s[1], s[2], b),
      tip: this.project(s[0] + s[3] * k, s[1] + s[4] * k, s[2] + s[5] * k, b),
    };
  }

  /** One polyline through the trail, with z chosen by the caller. */
  _path(P, trail, frame, zOf, side = null, ref = 0) {
    const { ctx } = this;
    const N = trail.n, step = Math.max(1, Math.floor(N / 2400));
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < N; i += step) {
      const [x, y, z] = frame === 'rotating'
        ? [trail.xs[i], trail.ys[i], zOf(i)]
        : displayPos3(trail.xs[i], trail.ys[i], zOf(i), trail.ts[i], frame);
      const q = P(x, y, z);
      // `side`, when given, keeps only the half of the path on one side of a
      // depth -- so an orbit that goes round a body can be drawn as two strokes,
      // the far half before the body and the near half after it. Without that a
      // 100 km lunar orbit vanishes into the Moon's disc for half its length and
      // reads as two disconnected slivers on the limb.
      if (side !== null && (side > 0 ? q[2] < ref : q[2] >= ref)) { open = false; continue; }
      if (!open) { ctx.moveTo(q[0], q[1]); open = true; } else ctx.lineTo(q[0], q[1]);
    }
  }

  /**
   * The z = 0 grid.
   *
   * Spaced by a round number of kilometres and centred on the Earth-Moon line,
   * so it reads as a measured floor rather than as decoration. Faded with
   * distance from the middle so it frames the scene instead of fighting it.
   */
  _plane(P) {
    const { ctx } = this;
    // A round step near a sixth of what is on screen, so the grid stays a grid
    // at every zoom instead of becoming one line across the view or a solid wash.
    const want = this.span / 6;
    const pow = Math.pow(10, Math.floor(Math.log10(want)));
    const stepDu = [1, 2, 5, 10].map((k) => k * pow)
      .reduce((a, c) => (Math.abs(c - want) < Math.abs(a - want) ? c : a));
    const n = Math.ceil(this.span / stepDu) + 2;
    const cx = Math.round(this.centre[0] / stepDu) * stepDu;
    const cy = Math.round(this.centre[1] / stepDu) * stepDu;
    ctx.lineWidth = 1;
    for (let i = -n; i <= n; i += 1) {
      for (const [a, bb] of [
        [[cx + i * stepDu, cy - n * stepDu], [cx + i * stepDu, cy + n * stepDu]],
        [[cx - n * stepDu, cy + i * stepDu], [cx + n * stepDu, cy + i * stepDu]],
      ]) {
        const p1 = P(a[0], a[1], 0), p2 = P(bb[0], bb[1], 0);
        const fade = 1 - Math.abs(i) / (n + 1);
        ctx.strokeStyle = `rgba(110, 150, 200, ${0.055 * fade + 0.012})`;
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
    }
    // the Earth-Moon line itself, a touch brighter: the scene's own axis
    const a = P(-0.4, 0, 0), b2 = P(1.6, 0, 0);
    ctx.strokeStyle = 'rgba(140, 180, 230, 0.16)';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
  }

  _scaleBar(avoid) {
    const { ctx } = this;
    const wantKm = this.span * 0.22 * DU_KM;
    const pow = Math.pow(10, Math.floor(Math.log10(wantKm)));
    const nice = [1, 2, 5, 10].map((k) => k * pow)
      .reduce((a, c) => (Math.abs(c - wantKm) < Math.abs(a - wantKm) ? c : a));
    const px = (nice / DU_KM) * this.scale;
    const y = avoid && 16 + px + 10 > avoid.left ? avoid.top - 14 : this.h - 22;
    ctx.strokeStyle = 'rgba(170, 190, 214, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, y); ctx.lineTo(16 + px, y);
    ctx.moveTo(16, y - 4); ctx.lineTo(16, y + 4);
    ctx.moveTo(16 + px, y - 4); ctx.lineTo(16 + px, y + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(170, 190, 214, 0.62)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(scaleLabel(nice), 16, y - 8);
  }
}

/**
 * A scale-bar label, thousands-separated.
 *
 * Exported because it was wrong for two years' worth of zoom levels and nothing
 * could see it: the old version divided by a thousand and appended " 000", which
 * is right for 50 000 and nonsense for 5 000 -- it drew "5.0 000 km". Only spans
 * with a round figure of ten thousand kilometres or more were ever correct, and
 * those are the ones a default fit lands on, so it took zooming in to find.
 */
export function scaleLabel(km) {
  return `${km.toLocaleString('en-US').replace(/,/g, ' ')} km`;
}

export { EARTH_RADIUS, MOON_RADIUS };
