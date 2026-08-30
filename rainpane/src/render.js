// render.js — optics only. It reads the surface fields and the live heads and
// composes the pane; it never changes the simulation.
//
// There are no drop sprites. The thickness field is the surface: its gradient
// is the normal, which refracts the scene behind the glass, catches a highlight
// where the surface turns, and darkens along the contact line at the edge. A
// head and the rivulet it is leaving are the same surface, so they cannot look
// like a circle towing a line.

import { radiusForMass } from './flows.js?v=20260830g';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uField;
uniform vec2 uFieldTexel;
uniform vec2 uSceneScale;
uniform vec2 uSceneOffset;
uniform float uHasScene;
uniform float uRefract;
uniform float uFilm;      // the beading film thickness, in field units
uniform sampler2D uMask;  // r depth, g near-ground protection, b lanterns
uniform float uHasMask;
uniform float uSigma;     // atmospheric extinction from rain and mist
uniform vec3 uAirlight;
uniform float uHalo;
uniform float uTime;
uniform float uVeil;      // 0 disables the veil outright, for diagnosis

// Attenuation grows predominantly at larger depth rather than linearly.
const float DEPTH_GAMMA = 1.5;
// How much the authored near-ground mask is allowed to protect. Not 1.0: near
// ground may soften slightly in a storm, it just must not wash out at the same
// rate as the far trees.
const float PROTECT = 0.85;

vec3 scene(vec2 uv) {
  if (uHasScene < 0.5) {
    float g = 0.05 + 0.10 * (1.0 - uv.y);
    return vec3(g * 0.7, g * 0.85, g * 1.0);
  }
  vec2 p = clamp(uv * uSceneScale + uSceneOffset, 0.002, 0.998);
  vec3 c = texture2D(uScene, p).rgb;
  if (uVeil < 0.5 || uHasMask < 0.5) return c;

  // The mask is sampled at the scene's own coordinate, so the two cannot drift
  // apart when the canvas is resized or the device is rotated.
  vec3 m = texture2D(uMask, p).rgb;

  // Effective optical path: how far the light travelled through rainy air. Not
  // how high up the screen the pixel is — the near canopy overhanging the top
  // corners of this scene is the closest thing in frame, and a screen-height
  // model would fog it along with the deep forest.
  float dEff = pow(m.r, DEPTH_GAMMA) * (1.0 - PROTECT * m.g);

  // Rain is not a uniform slab. A very slow, very broad drift in density, at a
  // scale of most of the frame and a period of tens of seconds: enough that the
  // distance breathes, never enough to read as a texture moving across it.
  float wob = 1.0
    + 0.11 * sin(p.x * 2.7 + uTime * 0.11) * sin(p.y * 1.9 - uTime * 0.073)
    + 0.07 * sin((p.x + p.y) * 1.3 - uTime * 0.047);

  // Beer-Lambert transmittance, plus the airlight that scattering adds back.
  // Both halves matter: attenuation alone darkens the distance, and what
  // distance actually does in rain is lose contrast against a lit haze.
  float T = exp(-uSigma * wob * dEff);
  c = c * T + uAirlight * (1.0 - T);

  // Distant lamps scatter into the wet air between them and the viewer. The
  // halo is carried by an authored lantern mask, not by a bloom over every
  // bright pixel — the wet path in the foreground is full of bright reflections
  // and they must stay crisp. The mask is already weighted by each lamp's own
  // distance, and (1 - T) supplies the rain.
  c += vec3(1.00, 0.72, 0.42) * m.b * (1.0 - T) * uHalo;
  return c;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 f = texture2D(uField, uv);
  float w = f.r;                       // liquid thickness
  float wet = f.g;                     // wetted-glass memory

  float wl = texture2D(uField, uv - vec2(uFieldTexel.x, 0.0)).r;
  float wr = texture2D(uField, uv + vec2(uFieldTexel.x, 0.0)).r;
  float wu = texture2D(uField, uv - vec2(0.0, uFieldTexel.y)).r;
  float wd = texture2D(uField, uv + vec2(0.0, uFieldTexel.y)).r;
  vec2 grad = vec2(wr - wl, wd - wu);
  float slope = length(grad);

  // A drop is a lens. The steeper the surface the further it drags the scene
  // behind it, so the bright things behind the glass smear and gather inside
  // the water rather than the water being tinted on top of them.
  vec3 col = scene(uv - grad * uRefract * (0.15 + 1.85 * w));

  // Wet glass without a bead on it is not clean glass: it scatters a little.
  float haze = wet * (1.0 - min(0.9, w * 2.0)) * 0.16;
  col = mix(col, col * 0.86 + vec3(0.030, 0.036, 0.045), haze);

  vec3 n = normalize(vec3(-grad * 26.0, 1.0));

  // Fresnel. At the rim of a drop the surface turns away and stops transmitting
  // what is behind it: it reflects the sky instead. On a dark scene at night
  // this is what a drop mostly *is* — a bright thread around its edge — and
  // without it water on a dark background is nearly invisible however much the
  // refraction moves. It is also why every drop has a visible outline that is
  // not a drawn outline.
  // Only real liquid gets a rim. The gate is on thickness, which is the physical
  // difference between a sheen and a bead, and it is set from the thickness at
  // which a film actually beads rather than from a fraction of the biggest drop
  // the pane can hold — most drops are nowhere near that big, so a fraction of
  // it leaves everything but the rare monsters looking flat.
  float body = smoothstep(uFilm * 1.5, uFilm * 6.0, w);

  float fres = pow(1.0 - n.z, 3.0);
  vec3 sky = vec3(0.30, 0.38, 0.50);
  col += sky * fres * body * 0.60;

  vec3 l = normalize(vec3(-0.40, -0.74, 0.74));
  float spec = pow(max(dot(n, l), 0.0), 40.0);
  col += vec3(0.95, 0.97, 1.0) * spec * body * 0.95;

  // The contact line itself is darker: the meniscus turns hard away from the eye
  // just inside the rim.
  col *= 1.0 - min(0.30, slope * 1.6) * (0.25 + 0.75 * body);

  gl_FragColor = vec4(col, 1.0);
}`;

const RING_HZ = 13;                  // perceptually slowed capillary ringing

// Atmospheric extinction. Measured against nothing — these are the visual
// constants the spec asks to be chosen sensibly and NOT claimed to be
// meteorologically calibrated. What is anchored is their shape: an exponent
// above one so that heavy and storm ramp far harder than drizzle, and a cap so
// rain plus mist can never add up to white.
const SIGMA_RAIN = 2.0;
const SIGMA_MIST = 0.9;
const SIGMA_CAP = 2.6;
const RAIN_EXP = 1.3;
// Scattered lamp light. It has to be strong enough to survive the extinction
// that causes it: the halo is added in the same place the attenuation is taking
// light away, and at 0.55 the two cancelled — the ring around a far lamp
// measured darker with the veil on than with it off. Not so strong that it
// reads as a lens flare, which the spec forbids outright.
const HALO = 1.15;

export class PaneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ok = false;
    this.cols = 0;
    this.rows = 0;
    this.sceneUploaded = false;
    this.maskUploaded = false;
    this.sigma = 0;
    this.veil = true;
    this.t0 = performance.now();
    this.waterScale = 2.4;           // thickness that maps to 1.0 in the texture
    this.cellMm = 0.22;
    try {
      this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false });
    } catch (_) { this.gl = null; }
    if (this.gl) this.ok = this._initGL();
    if (!this.ok) this._initFallback();
  }

  _initGL() {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ['uScene', 'uField', 'uFieldTexel', 'uSceneScale', 'uSceneOffset', 'uHasScene', 'uRefract', 'uFilm', 'uMask', 'uHasMask', 'uSigma', 'uAirlight', 'uHalo', 'uTime', 'uVeil']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.sceneTex = this._makeTexture();
    this.fieldTex = this._makeTexture();
    this.maskTex = this._makeTexture();
    gl.uniform1i(this.u.uScene, 0);
    gl.uniform1i(this.u.uField, 1);
    gl.uniform1f(this.u.uRefract, 0.17);
    gl.uniform1f(this.u.uFilm, 0.03);
    gl.uniform1f(this.u.uHasScene, 0);
    gl.uniform1i(this.u.uMask, 2);
    gl.uniform1f(this.u.uHasMask, 0);
    gl.uniform1f(this.u.uSigma, 0);
    gl.uniform1f(this.u.uHalo, HALO);
    gl.uniform1f(this.u.uVeil, 1);
    // A restrained cool blue-grey, near the dim skyglow this scene already has.
    // Bright white fog is what a night forest in rain is not.
    gl.uniform3f(this.u.uAirlight, 0.095, 0.122, 0.145);
    return true;
  }

  _makeTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return tex;
  }

  _initFallback() {
    this.ctx = this.canvas.getContext('2d');
    this.fieldCanvas = document.createElement('canvas');
    this.fieldCtx = this.fieldCanvas.getContext('2d');
  }

  /**
   * The thickness that saturates the field texture. It has to follow the
   * biggest drop the pane can hold, or the whole range collapses the moment the
   * view scale or the grid changes and every drop renders at the same flat
   * value.
   */
  setCellSize(cellMm) {
    this.cellMm = cellMm;
  }

  setThicknessScale(maxCapHeightCells, beadFilmCells) {
    this.waterScale = Math.max(0.4, maxCapHeightCells);
    this.filmLevel = Math.min(0.3, Math.max(0.004, (beadFilmCells || 0.1) / this.waterScale));
    if (this.ok) this.gl.uniform1f(this.u.uFilm, this.filmLevel);
  }

  setScene(scene) {
    this.scene = scene;
    this.sceneUploaded = false;
    this.maskUploaded = false;
    if (this.ok) this.gl.uniform1f(this.u.uHasMask, 0);
  }

  /**
   * How thick the air is, from the weather rather than from a look.
   *
   * Extinction rises faster than the rain rate — the exponent above one is what
   * keeps drizzle almost perfectly clear while a downpour closes the distance
   * down. The reference is the top of the scale, so `sigma` is 2.0 in a
   * downpour: at full depth that leaves 13% of the far scene's own light and
   * the rest is haze.
   *
   * `mist` is the humidity hook the spec asks for. Nothing drives it yet; when
   * something does, it should add to extinction without turning the frame
   * white, which is why the two contributions are summed under one cap rather
   * than multiplied.
   */
  setWeather(rainMmPerHour, mist = 0) {
    const r = Math.max(0, rainMmPerHour) / 180;
    const fromRain = SIGMA_RAIN * Math.pow(Math.min(1, r), RAIN_EXP);
    const fromMist = SIGMA_MIST * Math.pow(Math.max(0, Math.min(1, mist)), 1.2);
    this.sigma = Math.min(SIGMA_CAP, fromRain + fromMist);
  }

  /** Off for diagnosis: the veil must be separable from the glass water. */
  setVeil(on) {
    this.veil = !!on;
  }

  setSurfaceSize(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.pixels = new Uint8ClampedArray(cols * rows * 4);
    this.blurBuf = new Uint8ClampedArray(cols * rows);
    if (this.gl && this.ok) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.uniform2f(this.u.uFieldTexel, 1 / cols, 1 / rows);
    } else if (this.fieldCanvas) {
      this.fieldCanvas.width = cols;
      this.fieldCanvas.height = rows;
      this.fieldImage = this.fieldCtx.createImageData(cols, rows);
    }
  }

  resize(width, height, dpr) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Pack the pane's fields plus the live heads into one RGBA field. */
  _packField(surface, heads) {
    const { cols, rows, h, wet } = surface;
    const px = this.pixels;
    for (let i = 0, p = 0; i < h.length; i += 1, p += 4) {
      // Wet glass carries a film far too thin for the optics to read on its own
      // — a rivulet's residue has to be thin or the head laying it bleeds out
      // within a few millimetres. Without a share of the wetted memory a
      // channel is a bare hole in the picture with no edge and no highlight,
      // and it reads as a scratch. This is a rendering decision on top of a
      // physical fact: wetted glass really does hold a film. It is never mass.
      const film = h[i] + wet[i] * wet[i] * 0.05 * this.waterScale;
      px[p] = Math.min(1, film / this.waterScale) * 255;
      px[p + 1] = wet[i] * 255;
      px[p + 2] = 0;
      px[p + 3] = 255;
    }

    for (const head of heads) {
      const r = radiusForMass(head.mass);
      const speed = Math.hypot(head.vx, head.vy);
      // Where it came from this frame. A third of the moving drops in a storm
      // cross more than their own width in a sixtieth of a second: drawn as a
      // disc at the end position they do not overlap themselves between frames,
      // so they strobe instead of moving. A still frame looks perfectly fine,
      // which is exactly why this is hard to see in a screenshot. The eye
      // integrates over the frame, so the drop is drawn over the segment it
      // actually swept.
      const bx = head.lastX === undefined ? head.x : head.lastX;
      const by = head.lastY === undefined ? head.y : head.lastY;
      let sx = head.x - bx;
      let sy = head.y - by;
      const sweep = Math.hypot(sx, sy);
      if (sweep > 0.001) { sx /= sweep; sy /= sweep; }
      // At rest a drop is round. Running, it is a teardrop: the leading edge
      // stays round because that is where the water piles up, and the trailing
      // edge is drawn out into the channel it is leaving behind. A symmetric
      // ellipse is what reads as an egg.
      const tail = 1 + Math.min(2.8, speed * this.cellMm / 90);
      const ux = speed > 0.01 ? head.vx / speed : 0;
      const uy = speed > 0.01 ? head.vy / speed : 1;
      // A pair that has just merged rings along the line they came together on
      // before it settles, instead of snapping to a circle.
      const ring = head.wobble > 0
        ? head.wobble * 0.34 * Math.cos(head.wobbleT * RING_HZ * 2 * Math.PI)
        : 0;
      const reach = r * tail * (1 + Math.abs(ring)) + 1;
      const x0 = Math.max(0, Math.floor(Math.min(head.x, bx) - reach));
      const x1 = Math.min(cols - 1, Math.ceil(Math.max(head.x, bx) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(head.y, by) - reach));
      const y1 = Math.min(rows - 1, Math.ceil(Math.max(head.y, by) + reach));
      const peak = 255 * Math.min(1, (r * 0.62) / this.waterScale);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          // distance to the swept segment rather than to the end point
          let cx = head.x;
          let cy = head.y;
          if (sweep > 0.001) {
            const t = Math.max(0, Math.min(sweep, (x - bx) * sx + (y - by) * sy));
            cx = bx + sx * t;
            cy = by + sy * t;
          }
          const dx = x - cx;
          const dy = y - cy;
          const along = dx * ux + dy * uy;
          const across = dx * -uy + dy * ux;
          const behind = along < 0 ? Math.min(1, -along / (r * tail)) : 0;
          let lengthwise = along >= 0 ? 1 : tail;
          let widthwise = 1 - 0.66 * behind;
          if (ring !== 0) {
            const wx = (x - head.x) * head.wobbleX + (y - head.y) * head.wobbleY;
            const wy = (x - head.x) * -head.wobbleY + (y - head.y) * head.wobbleX;
            const stretch = 1 + ring;
            const squash = 1 - ring * 0.85;
            const d2 = Math.hypot(wx / stretch, wy / squash) / r;
            if (d2 > 1.05) continue;
            const dome2 = Math.sqrt(Math.max(0, 1 - d2 * d2));
            const p2 = (y * cols + x) * 4;
            const add2 = dome2 * peak;
            if (px[p2] < add2) px[p2] = add2;
            continue;
          }
          const d = Math.hypot(along / lengthwise, across / widthwise) / r;
          if (d > 1.05) continue;
          const dome = Math.sqrt(Math.max(0, 1 - d * d));
          const p = (y * cols + x) * 4;
          const add = dome * peak;
          if (px[p] < add) px[p] = add;
        }
      }
    }
  }

  /**
   * Soften the thickness before it becomes a surface. The simulation is
   * deliberately coarse and its gradients are what the optics read as shape;
   * unsmoothed they upscale into facets and hard strips rather than liquid.
   * Keep the kernel light — a heavy one visibly fattens every drop.
   */
  _smooth() {
    const { cols, rows, pixels, blurBuf } = this;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const l = pixels[(i - (x > 0 ? 1 : 0)) * 4];
        const r = pixels[(i + (x < cols - 1 ? 1 : 0)) * 4];
        blurBuf[i] = (l + r) * 0.15 + pixels[i * 4] * 0.70;
      }
    }
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const u = blurBuf[i - (y > 0 ? cols : 0)];
        const d = blurBuf[i + (y < rows - 1 ? cols : 0)];
        pixels[i * 4] = (u + d) * 0.15 + blurBuf[i] * 0.70;
      }
    }
  }

  draw(surface, heads) {
    this._packField(surface, heads);
    this._smooth();
    if (this.ok) this._drawGL();
    else this._draw2D();
  }

  _cover(iw, ih) {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const canvasAspect = cw / ch;
    const imageAspect = iw / ih;
    if (imageAspect > canvasAspect) {
      const scale = canvasAspect / imageAspect;
      return { sx: scale, sy: 1, ox: (1 - scale) * 0.5, oy: 0 };
    }
    const scale = imageAspect / canvasAspect;
    return { sx: 1, sy: scale, ox: 0, oy: (1 - scale) * 0.5 };
  }

  _drawGL() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.pixels.buffer));

    // The visibility masks. Uploaded once, whenever the image finishes decoding.
    if (this.scene && this.scene.maskReady && !this.maskUploaded) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene.mask);
        this.maskUploaded = true;
        gl.uniform1f(this.u.uHasMask, 1);
      } catch (_) { /* keep trying next frame */ }
    } else if (this.maskUploaded) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    }
    gl.uniform1f(this.u.uSigma, this.sigma);
    gl.uniform1f(this.u.uHalo, this.veil ? HALO : 0);
    gl.uniform1f(this.u.uVeil, this.veil ? 1 : 0);
    gl.uniform1f(this.u.uTime, (performance.now() - this.t0) / 1000);

    const ready = !!(this.scene && this.scene.ready);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    if (ready && !this.sceneUploaded) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene.image);
        this.sceneUploaded = true;
      } catch (_) { /* keep trying next frame */ }
    }
    const fit = ready ? this._cover(this.scene.width, this.scene.height) : { sx: 1, sy: 1, ox: 0, oy: 0 };
    gl.uniform2f(this.u.uSceneScale, fit.sx, fit.sy);
    gl.uniform2f(this.u.uSceneOffset, fit.ox, fit.oy);
    gl.uniform1f(this.u.uHasScene, this.sceneUploaded ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _draw2D() {
    // No WebGL: no refraction, but the water is still visible and the physics
    // can still be judged on a device that cannot run the shader.
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ready = !!(this.scene && this.scene.ready);
    if (ready) {
      const fit = this._cover(this.scene.width, this.scene.height);
      ctx.drawImage(this.scene.image, -fit.ox * w / fit.sx, -fit.oy * h / fit.sy, w / fit.sx, h / fit.sy);
    } else {
      ctx.fillStyle = '#0b1013';
      ctx.fillRect(0, 0, w, h);
    }
    const img = this.fieldImage;
    const px = this.pixels;
    for (let i = 0, p = 0; i < this.cols * this.rows; i += 1, p += 4) {
      const water = px[p] / 255;
      img.data[p] = 210;
      img.data[p + 1] = 224;
      img.data[p + 2] = 236;
      img.data[p + 3] = Math.min(255, water * 190);
    }
    this.fieldCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.fieldCanvas, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
