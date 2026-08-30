// scene.js — what is behind the pane. For this prototype that is one built-in
// image; the solver never asks what the scene is, so a camera or a local photo
// can be added later without touching any physics.

const BUILTIN = {
  id: 'forest',
  label: 'Forest path',
  src: 'assets/forest-night.jpg',
  // Depth, near-ground protection and lantern positions for the atmospheric
  // veil, packed into one texture's three channels. It belongs to the scene
  // rather than to the renderer: it is authored per scene, and it is sampled
  // with the scene's own fit transform so the two cannot drift apart.
  // See tools/make-visibility-mask.py and VISIBILITY_SPEC.md section 4.
  mask: 'assets/visibility-mask.png',
};

export class Scene {
  constructor() {
    this.image = null;
    this.ready = false;
    this.width = 0;
    this.height = 0;
    this.error = null;
    this.mask = null;
    this.maskReady = false;
  }

  async load() {
    // The mask is loaded alongside but never gates the scene: a missing mask
    // costs the veil, not the picture.
    this._loadMask();
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = BUILTIN.src;
      await img.decode();
      this.image = img;
      this.width = img.naturalWidth;
      this.height = img.naturalHeight;
      this.ready = true;
      return true;
    } catch (err) {
      this.error = err;
      return false;
    }
  }

  async _loadMask() {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = BUILTIN.mask;
      await img.decode();
      this.mask = img;
      this.maskReady = true;
    } catch (_) {
      this.maskReady = false;
    }
  }

  get label() {
    return BUILTIN.label;
  }
}
