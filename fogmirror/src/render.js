// render.js — optics only. It reads the surface fields and the active heads and
// composes the mirror; it never changes the simulation.
//
// The water is drawn from the height field, not as sprites: the gradient of the
// field is the surface normal, which gives refraction of the camera behind it,
// a highlight where the surface turns, and a darker contact line at the edge —
// so a head and its trail are one continuous body of water.

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
uniform sampler2D uVideo;
uniform sampler2D uField;
uniform vec2 uFieldTexel;
uniform vec2 uVidScale;
uniform vec2 uVidOffset;
uniform float uHasVideo;
uniform float uRefract;

vec2 vidUv(vec2 uv) {
  vec2 p = uv * uVidScale + uVidOffset;
  return vec2(1.0 - p.x, p.y);          // a mirror shows you back to front
}

vec3 vid(vec2 uv) {
  if (uHasVideo < 0.5) {
    float g = 0.09 + 0.07 * uv.y;
    return vec3(g * 0.88, g * 0.96, g * 1.12);
  }
  return texture2D(uVideo, clamp(vidUv(uv), 0.002, 0.998)).rgb;
}

vec3 vidBlur(vec2 uv, float r) {
  vec3 c = vid(uv) * 0.28;
  c += (vid(uv + vec2(r, 0.0)) + vid(uv - vec2(r, 0.0))
      + vid(uv + vec2(0.0, r)) + vid(uv - vec2(0.0, r))) * 0.12;
  float d = r * 0.7071;
  c += (vid(uv + vec2(d, d)) + vid(uv + vec2(d, -d))
      + vid(uv + vec2(-d, d)) + vid(uv + vec2(-d, -d))) * 0.06;
  return c;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 f = texture2D(uField, uv);
  float fog = f.r;
  float water = f.g;
  float wet = f.b;

  float wl = texture2D(uField, uv - vec2(uFieldTexel.x, 0.0)).g;
  float wr = texture2D(uField, uv + vec2(uFieldTexel.x, 0.0)).g;
  float wu = texture2D(uField, uv - vec2(0.0, uFieldTexel.y)).g;
  float wd = texture2D(uField, uv + vec2(0.0, uFieldTexel.y)).g;
  vec2 grad = vec2(wr - wl, wd - wu);
  float slope = length(grad);

  // Liquid water is clear: it removes the mist it displaced, and wet glass
  // scatters a little less than dry fogged glass.
  float haze = fog * (1.0 - min(1.0, water * 1.7)) * (1.0 - 0.18 * wet);

  vec3 col = vidBlur(uv - grad * uRefract, haze * 0.017 + 0.0012);
  col = mix(col, vec3(0.87, 0.89, 0.91), clamp(haze * 0.94, 0.0, 0.96));

  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.055 * haze;

  vec3 n = normalize(vec3(-grad * 9.0, 1.0));
  vec3 l = normalize(vec3(-0.42, -0.72, 0.75));
  float spec = pow(max(dot(n, l), 0.0), 28.0);
  col += vec3(spec) * min(1.0, water * 2.4) * 0.75;
  col *= 1.0 - min(0.26, slope * 0.85);
  col += vec3(0.035, 0.045, 0.055) * min(1.0, water * 1.2);

  gl_FragColor = vec4(col, 1.0);
}`;

import { radiusForMass } from './droplets.js';

const WATER_SCALE = 2.6;   // height mapped into 0..1 for the texture

export class MirrorRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ok = false;
    this.cols = 0;
    this.rows = 0;
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
    for (const name of ['uVideo', 'uField', 'uFieldTexel', 'uVidScale', 'uVidOffset', 'uHasVideo', 'uRefract']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.videoTex = this._makeTexture();
    this.fieldTex = this._makeTexture();
    gl.uniform1i(this.u.uVideo, 0);
    gl.uniform1i(this.u.uField, 1);
    gl.uniform1f(this.u.uRefract, 0.075);
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
    // No WebGL: keep the toy usable with a plain composite. No refraction,
    // but the fog, the water and the drops are all still there.
    this.ctx = this.canvas.getContext('2d');
    this.fieldCanvas = document.createElement('canvas');
    this.fieldCtx = this.fieldCanvas.getContext('2d');
  }

  setSurfaceSize(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.pixels = new Uint8ClampedArray(cols * rows * 4);
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

  /** Pack the surface plus the active heads into one RGBA field. */
  _packField(surface, heads) {
    const { cols, rows, fog, water, wet } = surface;
    const px = this.pixels;
    for (let i = 0, p = 0; i < fog.length; i += 1, p += 4) {
      px[p] = fog[i] * 255;
      px[p + 1] = Math.min(1, water[i] / WATER_SCALE) * 255;
      px[p + 2] = wet[i] * 255;
      px[p + 3] = 255;
    }
    // Heads are added on top of the field they came from, so the drop and its
    // trail are one surface rather than a sprite sitting on a map.
    for (const head of heads) {
      const r = radiusForMass(head.mass);
      const speed = Math.hypot(head.vx, head.vy);
      const stretch = 1 + Math.min(0.7, speed / 90);
      const ux = speed > 0.01 ? head.vx / speed : 0;
      const uy = speed > 0.01 ? head.vy / speed : 1;
      const reach = r * stretch + 1;
      const x0 = Math.max(0, Math.floor(head.x - reach));
      const x1 = Math.min(cols - 1, Math.ceil(head.x + reach));
      const y0 = Math.max(0, Math.floor(head.y - reach));
      const y1 = Math.min(rows - 1, Math.ceil(head.y + reach));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const dx = x - head.x;
          const dy = y - head.y;
          // a moving head is drawn out along its direction of travel
          const along = dx * ux + dy * uy;
          const across = dx * -uy + dy * ux;
          const d = Math.hypot(along / stretch, across) / r;
          if (d > 1.05) continue;
          const dome = Math.sqrt(Math.max(0, 1 - d * d));
          const p = (y * cols + x) * 4 + 1;
          const add = dome * 255 * (1 / WATER_SCALE) * 1.9;
          if (px[p] < add) px[p] = add;
        }
      }
    }
  }

  /**
   * Soften the water channel before it becomes a surface. The simulation is
   * deliberately coarse, and its gradients are what the optics read as shape —
   * unsmoothed they upscale into facets and hard-edged strips rather than
   * something liquid.
   */
  _smoothWater() {
    const { cols, rows, pixels } = this;
    const tmp = this.blurBuf || (this.blurBuf = new Uint8ClampedArray(cols * rows));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const l = pixels[(i - (x > 0 ? 1 : 0)) * 4 + 1];
        const r = pixels[(i + (x < cols - 1 ? 1 : 0)) * 4 + 1];
        tmp[i] = (l + r + pixels[i * 4 + 1] * 2) * 0.25;
      }
    }
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const u = tmp[i - (y > 0 ? cols : 0)];
        const d = tmp[i + (y < rows - 1 ? cols : 0)];
        pixels[i * 4 + 1] = (u + d + tmp[i] * 2) * 0.25;
      }
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

  draw(surface, heads, video) {
    this._packField(surface, heads);
    this._smoothWater();
    const hasVideo = !!(video && video.readyState >= 2 && video.videoWidth);
    if (this.ok) this._drawGL(video, hasVideo);
    else this._draw2D(video, hasVideo);
  }

  _cover(vw, vh) {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const canvasAspect = cw / ch;
    const videoAspect = vw / vh;
    if (videoAspect > canvasAspect) {
      const scale = canvasAspect / videoAspect;
      return { sx: scale, sy: 1, ox: (1 - scale) * 0.5, oy: 0 };
    }
    const scale = videoAspect / canvasAspect;
    return { sx: 1, sy: scale, ox: 0, oy: (1 - scale) * 0.5 };
  }

  _drawGL(video, hasVideo) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.pixels.buffer));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    if (hasVideo) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch (_) { hasVideo = false; }
    }
    const fit = hasVideo ? this._cover(video.videoWidth, video.videoHeight) : { sx: 1, sy: 1, ox: 0, oy: 0 };
    gl.uniform2f(this.u.uVidScale, fit.sx, fit.sy);
    gl.uniform2f(this.u.uVidOffset, fit.ox, fit.oy);
    gl.uniform1f(this.u.uHasVideo, hasVideo ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _draw2D(video, hasVideo) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (hasVideo) {
      const fit = this._cover(video.videoWidth, video.videoHeight);
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, -fit.ox * w / fit.sx, -fit.oy * h / fit.sy, w / fit.sx, h / fit.sy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.fillStyle = '#14161c';
      ctx.fillRect(0, 0, w, h);
    }
    const img = this.fieldImage;
    const px = this.pixels;
    for (let i = 0, p = 0; i < this.cols * this.rows; i += 1, p += 4) {
      const fog = px[p] / 255;
      const water = px[p + 1] / 255;
      const haze = fog * (1 - Math.min(1, water * 1.7));
      img.data[p] = 222;
      img.data[p + 1] = 227;
      img.data[p + 2] = 232;
      img.data[p + 3] = Math.min(255, haze * 245 + water * 90);
    }
    this.fieldCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fieldCanvas, 0, 0, w, h);
    ctx.restore();
  }
}
