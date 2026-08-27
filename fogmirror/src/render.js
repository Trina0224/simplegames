export class MirrorRenderer {
  constructor(canvas, video, field, droplets) {
    this.canvas = canvas;
    this.video = video;
    this.field = field;
    this.droplets = droplets;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scene = document.createElement('canvas');
    this.blur = document.createElement('canvas');
    this.mask = document.createElement('canvas');
    this.mask.width = field.w;
    this.mask.height = field.h;
    this.mctx = this.mask.getContext('2d');
    this.image = this.mctx.createImageData(field.w, field.h);
    this.width = 1;
    this.height = 1;
    this.cssWidth = 1;
    this.cssHeight = 1;
  }

  resize(w, h, dpr = 1) {
    const scale = Math.min(2, Math.max(1, dpr));
    this.cssWidth = Math.max(1, w);
    this.cssHeight = Math.max(1, h);
    this.width = Math.max(1, Math.round(w * scale));
    this.height = Math.max(1, Math.round(h * scale));
    for (const c of [this.canvas, this.scene, this.blur]) {
      c.width = this.width;
      c.height = this.height;
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  render(cameraReady) {
    const W = this.width, H = this.height;
    const s = this.scene.getContext('2d');
    s.save();
    s.clearRect(0, 0, W, H);
    if (cameraReady && this.video.readyState >= 2 && this.video.videoWidth) {
      this._coverVideo(s, this.video, W, H);
    } else {
      const g = s.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#4a6066'); g.addColorStop(.48, '#1c2a2f'); g.addColorStop(1, '#091014');
      s.fillStyle = g; s.fillRect(0, 0, W, H);
      const rg = s.createRadialGradient(W * .5, H * .38, 0, W * .5, H * .38, Math.max(W, H) * .55);
      rg.addColorStop(0, 'rgba(210,225,226,.20)'); rg.addColorStop(1, 'rgba(30,45,48,0)');
      s.fillStyle = rg; s.fillRect(0, 0, W, H);
    }
    s.restore();

    this._updateMask();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.scene, 0, 0);

    const b = this.blur.getContext('2d');
    b.save(); b.clearRect(0, 0, W, H);
    b.filter = `blur(${Math.max(9, Math.min(W, H) * 0.018)}px) saturate(.72) contrast(.78) brightness(1.08)`;
    b.drawImage(this.scene, -8, -8, W + 16, H + 16);
    b.filter = 'none';
    b.globalCompositeOperation = 'destination-in';
    b.imageSmoothingEnabled = true;
    b.drawImage(this.mask, 0, 0, W, H);
    b.restore();
    ctx.drawImage(this.blur, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .40;
    ctx.drawImage(this.mask, 0, 0, W, H);
    ctx.restore();

    this._drawWetSheen(ctx);
    this._drawDroplets(ctx);
    this._drawVignette(ctx);
  }

  _updateMask() {
    const data = this.image.data, fog = this.field.fog, wet = this.field.wet, noise = this.field.noise;
    for (let i = 0; i < fog.length; i++) {
      const a = Math.max(0, Math.min(1, fog[i]));
      const grain = (noise[i] - .5) * 15;
      const j = i * 4;
      const milk = 220 + grain;
      data[j] = milk; data[j + 1] = milk + 5; data[j + 2] = milk + 7;
      data[j + 3] = Math.round(255 * Math.pow(a, 1.15) * (1 - Math.min(.42, wet[i] * .20)));
    }
    this.mctx.putImageData(this.image, 0, 0);
  }

  _drawWetSheen(ctx) {
    const wet = this.field.wet, W = this.field.w, H = this.field.h;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const v = wet[y * W + x]; if (v < .22) continue;
        const px = (x + .5) / W * this.width, py = (y + .5) / H * this.height;
        const r = Math.max(.8, v * 1.8 * this.width / W);
        ctx.fillStyle = `rgba(235,248,250,${Math.min(.09, v * .045)})`;
        ctx.beginPath(); ctx.ellipse(px - r * .2, py - r * .15, r, r * .35, -.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawDroplets(ctx) {
    const W = this.width, H = this.height;
    for (const d of this.droplets.drops) {
      const x = d.x * W, y = d.y * H;
      // Allow genuinely tiny condensation beads. Retina pixels are intentional here.
      const r = Math.max(0.65, d.radius * W);
      const speed = Math.hypot(d.vx, d.vy);
      const stretch = 1 + Math.min(.35, speed * 5.5);
      const angle = Math.atan2(d.vy, d.vx) + Math.PI / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * stretch, 0, 0, Math.PI * 2);
      ctx.clip();

      // Slight displaced reflection gives the optical cue of refraction. Keep it
      // subtle; a water bead should not look like a framed lens.
      const shiftX = -d.vx * W * .025;
      const shiftY = -d.vy * H * .025;
      ctx.globalAlpha = .82;
      ctx.drawImage(this.scene, -x + shiftX, -y + shiftY);

      const shade = ctx.createRadialGradient(-r * .30, -r * .38, 0, 0, 0, r * 1.15);
      shade.addColorStop(0, 'rgba(255,255,255,.48)');
      shade.addColorStop(.18, 'rgba(255,255,255,.09)');
      shade.addColorStop(.68, 'rgba(160,190,196,.015)');
      shade.addColorStop(.90, 'rgba(20,38,44,.08)');
      shade.addColorStop(1, 'rgba(8,20,24,.16)');
      ctx.fillStyle = shade;
      ctx.fillRect(-r * 1.25, -r * 1.5, r * 2.5, r * 3.0);
      ctx.restore();

      // Fresnel-like highlight only on part of the rim. No complete outline.
      if (r > 1.1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(250,255,255,${Math.min(.34, .10 + r * .012)})`;
        ctx.lineWidth = Math.max(.45, r * .055);
        ctx.beginPath();
        ctx.ellipse(-r * .04, -r * .03, r * .82, r * stretch * .82, 0, Math.PI * 1.05, Math.PI * 1.72);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawVignette(ctx) {
    const g = ctx.createRadialGradient(this.width * .5, this.height * .45, Math.min(this.width, this.height) * .25, this.width * .5, this.height * .5, Math.max(this.width, this.height) * .75);
    g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,10,14,.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.width, this.height);
  }

  _coverVideo(ctx, video, W, H) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh); const dw = vw * scale, dh = vh * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, W - (dx + dw), dy, dw, dh);
    ctx.restore();
  }
}
