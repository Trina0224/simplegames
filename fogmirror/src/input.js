// input.js — pointer and touch paths across the glass. It reports stroke
// segments with their speed and knows nothing about water.

export class PointerPaths {
  constructor(element, onStroke) {
    this.el = element;
    this.onStroke = onStroke;
    this.active = new Map();

    element.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { element.setPointerCapture(e.pointerId); } catch (_) { /* mouse */ }
      this.active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      // A tap is a stroke of zero length; it should still wet the glass.
      this.onStroke({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, speed: 0 });
    });

    element.addEventListener('pointermove', (e) => {
      const prev = this.active.get(e.pointerId);
      if (!prev) return;
      const now = performance.now();
      const dt = Math.max(0.004, (now - prev.t) / 1000);
      const points = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      let last = prev;
      for (const p of points.length ? points : [e]) {
        const dist = Math.hypot(p.clientX - last.x, p.clientY - last.y);
        if (dist < 0.5) continue;
        this.onStroke({
          x0: last.x, y0: last.y, x1: p.clientX, y1: p.clientY,
          speed: dist / (dt / Math.max(1, points.length)),
        });
        last = { x: p.clientX, y: p.clientY, t: now };
      }
      this.active.set(e.pointerId, { x: last.x, y: last.y, t: now });
    });

    const end = (e) => { this.active.delete(e.pointerId); };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('lostpointercapture', end);
    window.addEventListener('pointerup', end);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
