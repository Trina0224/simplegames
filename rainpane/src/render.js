// render.js — optics only. It reads the surface fields and the live heads and
// composes the pane; it never changes the simulation.
//
// There are no drop sprites. The thickness field is the surface: its gradient
// is the normal, which refracts the scene behind the glass, catches a highlight
// where the surface turns, and darkens along the contact line at the edge. A
// head and the rivulet it is leaving are the same surface, so they cannot look
// like a circle towing a line.

import { radiusForMass } from './flows.js';

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

vec3 scene(vec2 uv) {
  if (uHasScene < 0.5) {
    float g = 0.05 + 0.10 * (1.0 - uv.y);
    return vec3(g * 0.7, g * 0.85, g * 1.0);
  }
  vec2 p = clamp(uv * uSceneScale + uSceneOffset, 0.002, 0.998);
  return texture2D(uScene, p).rgb;
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

export class PaneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ok = false;
    this.cols = 0;
    this.rows = 0;
    this.sceneUploaded = false;
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
    for (const name of ['uScene', 'uField', 'uFieldTexel', 'uSceneScale', 'uSceneOffset', 'uHasScene', 'uRefract', 'uFilm']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.sceneTex = this._makeTexture();
    this.fieldTex = this._makeTexture();
    gl.uniform1i(this.u.uScene, 0);
    gl.uniform1i(this.u.uField, 1);
    gl.uniform1f(this.u.uRefract, 0.17);
    gl.uniform1f(this.u.uFilm, 0.03);
    gl.uniform1f(this.u.uHasScene, 0);
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
      const x0 = Math.max(0, Math.floor(head.x - reach));
      const x1 = Math.min(cols - 1, Math.ceil(head.x + reach));
      const y0 = Math.max(0, Math.floor(head.y - reach));
      const y1 = Math.min(rows - 1, Math.ceil(head.y + reach));
      const peak = 255 * Math.min(1, (r * 0.62) / this.waterScale);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const dx = x - head.x;
          const dy = y - head.y;
          const along = dx * ux + dy * uy;
          const across = dx * -uy + dy * ux;
          const behind = along < 0 ? Math.min(1, -along / (r * tail)) : 0;
          let lengthwise = along >= 0 ? 1 : tail;
          let widthwise = 1 - 0.66 * behind;
          if (ring !== 0) {
            const wx = dx * head.wobbleX + dy * head.wobbleY;
            const wy = dx * -head.wobbleY + dy * head.wobbleX;
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
