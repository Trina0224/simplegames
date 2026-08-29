// scene.js — what is behind the pane. For this prototype that is one built-in
// image; the solver never asks what the scene is, so a camera or a local photo
// can be added later without touching any physics.

const BUILTIN = {
  id: 'forest',
  label: 'Forest path',
  src: 'assets/forest-night.jpg',
};

export class Scene {
  constructor() {
    this.image = null;
    this.ready = false;
    this.width = 0;
    this.height = 0;
    this.error = null;
  }

  async load() {
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

  get label() {
    return BUILTIN.label;
  }
}
