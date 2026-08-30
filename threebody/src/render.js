// render.js — drawing, and only drawing.
//
// Nothing here computes a trajectory or moves anything. It is handed physical
// states in rotating coordinates and a frame to show them in, and its whole job
// is to make the geometry legible: which regions are closed, where the
// equilibria are, what the spacecraft is doing now. The frame is one of three
// and this file does not know how any of them work — display.js turns a state
// and a time into a place, and everything drawn goes through it.
//
// The camera lives here too — span and centre, in model units. Zoom and pan
// change those two numbers and nothing else, so no amount of looking can alter
// what was integrated.
//
// The one liberty taken with physics is body size. Earth at true scale on the
// default view is three pixels and the Moon is under one, so both are drawn
// larger. SPEC.md separates physicalRadius from renderRadius for exactly this
// reason, and the enlarged radius never reaches the physics: collision is tested
// against the real one in trajectory.js, which cannot see this file.

import { EARTH_RADIUS, MOON_RADIUS, DU_KM } from './constants.js?v=20260830f';
import { displayPos, displayState, displayBodies, displayPoints } from './display.js?v=20260830f';

const EARTH_DRAW = 0.055;
const MOON_DRAW = 0.030;

// How far the camera may go. The lower bound is about a fifth of the Earth's
// drawn disc, which is as close as anything here is worth looking at; the upper
// is well outside L3, past which there is nothing left to see.
export const MIN_SPAN = 0.03;
export const MAX_SPAN = 14;

// Where the light comes from. There is no Sun in the CR3BP, but a body without a
// terminator reads as a sticker rather than a sphere. The direction is fixed in
// INERTIAL space, which is the honest choice: the Sun does not co-rotate with
// the Moon, so in the rotating frame the terminator sweeps round once per
// synodic period, and that slow sweep is the most physical thing on screen.
const LIGHT0 = 0.6;

// Continents, as blobs on a sphere. Not a map of Earth — a suggestion of one,
// enough that a rotating ball reads as a rotating ball.
const LAND = [
  [-1.55, 0.75, 0.34], [-1.75, 0.30, 0.30], [-1.30, 0.10, 0.20],
  [-1.10, -0.35, 0.26], [-1.20, -0.62, 0.16],
  [0.25, 0.85, 0.30], [0.35, 0.35, 0.26], [0.55, 0.10, 0.22],
  [0.45, -0.45, 0.22], [1.55, -0.45, 0.24], [2.35, -0.30, 0.18],
  [1.40, 0.55, 0.30], [2.60, 0.60, 0.22],
];
const CLOUD = [
  [-0.4, 0.5, 0.30], [0.9, -0.2, 0.34], [2.2, 0.25, 0.28],
  [-2.3, -0.5, 0.26], [1.7, 0.8, 0.24], [-1.0, -0.75, 0.22],
];
// Craters. The Moon is tidally locked, so in the rotating frame these do not
// move at all — the same face really is always turned toward the Earth.
const CRATERS = [
  [0.15, 0.35, 0.30], [-0.55, 0.10, 0.24], [0.70, -0.20, 0.20],
  [-0.20, -0.50, 0.26], [1.20, 0.45, 0.16], [0.45, 0.70, 0.14],
  [-1.10, -0.25, 0.18], [0.05, -0.05, 0.12], [0.95, -0.60, 0.13],
];

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Framed so the co-orbital region fits and L5 is not underneath the
    // controls: the horseshoe reaches r = 1.37, and both triangular points have
    // to be visible at once or the thing it encloses cannot be seen.
    this.span = 3.7;
    this.centre = [0.06, -0.20];
    this.w = 1; this.h = 1; this.dpr = 1; this.scale = 1;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(r.width * dpr));
    const ch = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
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

  // --- camera. All of it is presentation; none of it touches a trajectory. ---

  setView(view) {
    if (!view) return;
    this.span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, view.span));
    this.centre = view.centre.slice();
    this.scale = Math.min(this.w, this.h) / this.span;
  }

  /**
   * Zoom about a point on screen, keeping whatever is under it where it is.
   * Zooming about the canvas centre instead is the difference between a control
   * that feels like a map and one that feels like a slider.
   */
  zoomAt(px, py, factor) {
    const before = this.toModel(px, py);
    this.span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, this.span / factor));
    this.scale = Math.min(this.w, this.h) / this.span;
    const after = this.toModel(px, py);
    this.centre[0] += before[0] - after[0];
    this.centre[1] += before[1] - after[1];
  }

  panByPixels(dx, dy) {
    this.centre[0] -= dx / this.scale;
    this.centre[1] += dy / this.scale;
  }

  // --------------------------------------------------------------- bodies

  /**
   * A shaded sphere: limb-darkened disc, some markings that rotate with it, and
   * a night side. The terminator is a radial gradient centred on the anti-solar
   * point rather than a hard edge, which is both cheaper and closer to what a
   * lit sphere looks like at this size.
   */
  _sphere(cx, cy, r, lightAngle, spin, opts) {
    const { ctx } = this;
    const { ocean, land, cloud, craters, rim } = opts;
    // sub-solar point projected onto the disc; z is how far round the far side
    const lx = Math.cos(lightAngle), lz = Math.sin(lightAngle) * 0.35;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = ocean;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    const blob = (lon, lat, br, fill) => {
      const a = lon - spin;
      const z = Math.cos(lat) * Math.cos(a);
      if (z <= 0.03) return;                       // on the far side
      const x = Math.cos(lat) * Math.sin(a);
      const y = Math.sin(lat);
      const px = cx + x * r, py = cy - y * r;
      const d = Math.hypot(x, y) || 1e-6;
      // foreshortened along the radial direction as it approaches the limb
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(-y, x));
      ctx.beginPath();
      ctx.ellipse(0, 0, br * r * z, br * r * Math.min(1, 0.55 + 0.45 * z), 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      void d;
    };

    if (land) for (const [lon, lat, br] of LAND) blob(lon, lat, br, land);
    if (craters) {
      for (const [lon, lat, br] of CRATERS) {
        blob(lon, lat, br, craters.dark);
        blob(lon + 0.03, lat + 0.03, br * 0.68, craters.light);
      }
    }
    if (cloud) for (const [lon, lat, br] of CLOUD) blob(lon, lat, br, cloud);

    // night side
    const ax = cx - lx * r * 0.55, ay = cy + lz * r * 0.55;
    const night = ctx.createRadialGradient(ax, ay, r * 0.05, ax, ay, r * 1.85);
    night.addColorStop(0, 'rgba(2,4,9,0.92)');
    night.addColorStop(0.45, 'rgba(2,4,9,0.62)');
    night.addColorStop(1, 'rgba(2,4,9,0)');
    ctx.fillStyle = night;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // limb darkening, so the edge falls away instead of stopping
    const limb = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    limb.addColorStop(0, 'rgba(0,0,0,0)');
    limb.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = limb;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    if (rim) {                                   // atmosphere, on the lit side
      const g = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.35);
      g.addColorStop(0, rim);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- draw

  draw(view) {
    const { ctx } = this;
    const { frame, t, points, trail, head, zvc, plan, burn, showZvc, showVel } = view;
    this.resize();
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, this.w, this.h);

    const P = (x, y) => this.toScreen(x, y);
    // Every physical thing on screen goes through the same transform, at its
    // own time: the trail is a sequence of states from different instants, and
    // moving all of them by the time of the newest would draw a curve nobody
    // flew. In the rotating frame this costs nothing and returns its argument.
    const moving = frame !== 'rotating';
    const at = (x, y, ts) => displayPos(x, y, ts, frame);
    const turn = (x, y) => (moving ? displayPos(x, y, t, frame) : [x, y]);

    // --- the forbidden region ---------------------------------------------
    //
    // Yellow, and bright. It was a dim blue before, on the reasoning that the
    // trajectory should stay the subject of the picture, but that reasoning was
    // wrong for this curve: it is a boundary the spacecraft cannot cross, the
    // user turns it on deliberately, and a line you have to hunt for is not
    // showing you anything. Warm also puts it as far from the cyan trajectory as
    // the colour wheel allows, so the two never read as the same object.
    if (showZvc && zvc && zvc.length) {
      ctx.strokeStyle = 'rgba(255, 205, 66, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < zvc.length; i += 4) {
        const a = P(...turn(zvc[i], zvc[i + 1]));
        const b = P(...turn(zvc[i + 2], zvc[i + 3]));
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }

    // --- the trajectory: the subject of the picture ------------------------
    if (trail && trail.n > 1) {
      const N = trail.n;
      const step = Math.max(1, Math.floor(N / 2600));
      const pts = [];
      for (let i = 0; i < N; i += step) {
        const [x, y] = moving ? at(trail.xs[i], trail.ys[i], trail.ts[i])
                              : [trail.xs[i], trail.ys[i]];
        pts.push(P(x, y));
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // a wide, dim underlay so the path reads as a single object at a glance
      ctx.strokeStyle = 'rgba(96, 190, 255, 0.10)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 1) {
        if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.stroke();
      // then the line itself, brightening toward now
      ctx.lineWidth = 1.9;
      for (let i = 1; i < pts.length; i += 1) {
        const age = i / pts.length;
        ctx.strokeStyle = `rgba(150, 222, 255, ${0.16 + 0.80 * age * age})`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }

    // --- primaries and barycentre ------------------------------------------
    const b = displayBodies(t, frame);
    const spinLight = LIGHT0 - (frame === 'rotating' ? t : 0);

    const bc = P(b.barycenter[0], b.barycenter[1]);
    ctx.strokeStyle = 'rgba(150, 168, 195, 0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bc[0] - 4, bc[1]); ctx.lineTo(bc[0] + 4, bc[1]);
    ctx.moveTo(bc[0], bc[1] - 4); ctx.lineTo(bc[0], bc[1] + 4);
    ctx.stroke();

    const ep = P(b.earth[0], b.earth[1]);
    const er = Math.max(2.5, EARTH_DRAW * this.scale);
    // Decorative spin rate. A true sidereal day is about a quarter of a time
    // unit, which at eight days a second is eight turns a second and strobes;
    // this is slowed to something a person can see turning. It is the only
    // number in the project chosen by eye, and it drives nothing.
    this._sphere(ep[0], ep[1], er, spinLight, t * 0.75, {
      ocean: '#153962', land: 'rgba(78, 134, 94, 1)',
      cloud: 'rgba(228, 240, 252, 0.24)',
      rim: 'rgba(96, 158, 224, 0.22)',
    });

    const mp = P(b.moon[0], b.moon[1]);
    const mr = Math.max(1.8, MOON_DRAW * this.scale);
    // The Moon is tidally locked, so in the rotating frame its surface does not
    // turn at all: the same face really is always toward the Earth. In the two
    // frames that do not rotate with it -- Earth-following and barycentric
    // inertial -- it turns once per orbit, which is the same statement, and in
    // the Earth-following view it is the one you can actually watch happen.
    this._sphere(mp[0], mp[1], mr, spinLight, frame === 'rotating' ? 0 : t, {
      ocean: '#8f949c',
      craters: { dark: 'rgba(96, 100, 108, 0.85)', light: 'rgba(178, 183, 191, 0.5)' },
    });

    // Labels sit beside the body, but not arbitrarily far: zoomed right in, the
    // disc is wider than the window and a label at r + 7 is off the screen.
    ctx.fillStyle = 'rgba(200, 214, 232, 0.72)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Earth', ep[0] + Math.min(er + 7, 52), ep[1] + 4);
    ctx.fillText('Moon', mp[0] + Math.min(mr + 7, 52), mp[1] + 14);

    // --- equilibria: present, not shouting ---------------------------------
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const p of displayPoints(points, t, frame)) {
      const s = P(p.px, p.py);
      const un = p.unstable;
      ctx.strokeStyle = un ? 'rgba(226, 148, 106, 0.55)' : 'rgba(126, 206, 164, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (un) {                          // a cross: a saddle, nothing rests here
        ctx.moveTo(s[0] - 3.4, s[1] - 3.4); ctx.lineTo(s[0] + 3.4, s[1] + 3.4);
        ctx.moveTo(s[0] + 3.4, s[1] - 3.4); ctx.lineTo(s[0] - 3.4, s[1] + 3.4);
      } else {                           // a ring: things can stay
        ctx.arc(s[0], s[1], 3.8, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.fillStyle = un ? 'rgba(226, 160, 120, 0.62)' : 'rgba(140, 214, 176, 0.62)';
      // Away from the Moon, whichever way that is. L1 and L2 sit a few pixels
      // either side of it and their labels used to land on top of the Moon's
      // own; pushing each one outward along the line from the Moon separates
      // all three, and keeps working in the frames where the whole picture
      // turns, which a fixed left/right nudge would not.
      const away = Math.hypot(s[0] - mp[0], s[1] - mp[1]) || 1;
      const ux = (s[0] - mp[0]) / away, uy = (s[1] - mp[1]) / away;
      ctx.textAlign = ux < 0 ? 'right' : 'left';
      ctx.fillText(p.name, s[0] + ux * 10 + (ux < 0 ? -1 : 1) * 2, s[1] + uy * 10 - 3);
    }
    ctx.textAlign = 'left';

    // --- a planned burn, before it is committed -----------------------------
    if (plan && plan.xs && plan.xs.length > 1) {
      ctx.strokeStyle = 'rgba(255, 206, 112, 0.62)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < plan.xs.length; i += 1) {
        const [x, y] = moving ? at(plan.xs[i], plan.ys[i], t + plan.ts[i])
                              : [plan.xs[i], plan.ys[i]];
        const p = P(x, y);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- the spacecraft -----------------------------------------------------
    if (head) {
      const [x, y, vx, vy] = displayState(head[0], head[1], head[2], head[3], t, frame);
      const p = P(x, y);
      const ang = Math.atan2(-vy, vx);

      const halo = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 17);
      halo.addColorStop(0, 'rgba(180, 236, 255, 0.34)');
      halo.addColorStop(1, 'rgba(180, 236, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(p[0], p[1], 17, 0, Math.PI * 2); ctx.fill();

      if (showVel) {
        const k = 0.35;
        const q = P(x + vx * k, y + vy * k);
        ctx.strokeStyle = 'rgba(150, 222, 255, 0.75)';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        const a2 = Math.atan2(q[1] - p[1], q[0] - p[0]);
        ctx.beginPath();
        ctx.moveTo(q[0], q[1]);
        ctx.lineTo(q[0] - 6 * Math.cos(a2 - 0.42), q[1] - 6 * Math.sin(a2 - 0.42));
        ctx.lineTo(q[0] - 6 * Math.cos(a2 + 0.42), q[1] - 6 * Math.sin(a2 + 0.42));
        ctx.closePath();
        ctx.fillStyle = 'rgba(150, 222, 255, 0.75)';
        ctx.fill();
      }
      if (burn && burn.to) {
        // drawn to where the pointer is, not to a scaled multiple of the
        // velocity: direct manipulation, and legible at every zoom level
        const q = P(burn.to[0], burn.to[1]);
        ctx.strokeStyle = 'rgba(255, 206, 112, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }

      // a small craft pointing along its own velocity, rather than a dot
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(6.2, 0); ctx.lineTo(-3.6, 3.4); ctx.lineTo(-1.8, 0); ctx.lineTo(-3.6, -3.4);
      ctx.closePath();
      ctx.fillStyle = '#f2fbff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 196, 236, 0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // --- scale bar, sized to whatever the camera is showing -----------------
    this._scaleBar(view.avoid);
    ctx.restore();
  }

  _scaleBar(avoid) {
    const { ctx } = this;
    // pick a round number of kilometres that lands near a fifth of the view
    const wantDu = this.span * 0.22;
    const wantKm = wantDu * DU_KM;
    const pow = Math.pow(10, Math.floor(Math.log10(wantKm)));
    const nice = [1, 2, 5, 10].map((k) => k * pow).reduce((a, c) => (Math.abs(c - wantKm) < Math.abs(a - wantKm) ? c : a));
    const px = (nice / DU_KM) * this.scale;
    // The bar lives in the bottom-left corner, which on a narrow screen is under
    // the controls panel. `avoid` is where that panel starts, in canvas pixels;
    // when the bar would run beneath it the bar moves above it instead. On a
    // wide screen the panel is centred and nowhere near, so nothing moves.
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
    const label = nice >= 1000 ? `${(nice / 1000).toFixed(nice >= 10000 ? 0 : 1)} 000 km` : `${nice.toFixed(0)} km`;
    ctx.fillText(label, 16, y - 8);
  }
}

export { EARTH_RADIUS, MOON_RADIUS };
