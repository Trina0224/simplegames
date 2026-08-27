// camera.js — acquisition, switching and lifecycle. The stream is displayed and discarded:
// nothing here draws it to a canvas, records it, or sends it anywhere.

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
    this.state = 'off';        // off | live | denied | missing | busy | insecure
    this.onchange = () => {};
  }

  get running() { return !!this.stream; }

  get secure() {
    return window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start(facing = this.facing) {
    if (!this.secure) { this._set('insecure'); return false; }
    this.stop();
    this.facing = facing;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // this app never asks for a microphone
      });
    } catch (err) {
      this._set(errorState(err));
      return false;
    }
    this.video.srcObject = this.stream;
    this.video.classList.toggle('mirror', facing === 'user');
    try { await this.video.play(); } catch (_) { /* resumed by the next gesture */ }
    this._set('live');
    return true;
  }

  stop() {
    if (this.stream) {
      // Stop the tracks, not just the element — a paused video leaves the
      // camera indicator lit, which makes the app look like it is lying.
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    if (this.state === 'live') this._set('off');
  }

  async flip() {
    return this.start(this.facing === 'environment' ? 'user' : 'environment');
  }

  /** More than one camera is worth a flip control; one is not. */
  async hasMultipleCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput').length > 1;
    } catch (_) {
      return false;
    }
  }

  _set(state) {
    if (this.state === state) return;
    this.state = state;
    this.onchange(state);
  }
}

function errorState(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'missing';
  }
}

export const CAMERA_MESSAGES = {
  off: 'Camera off',
  denied: 'Camera access was declined — the blind still works',
  missing: 'No camera on this device — the blind still works',
  busy: 'Another app is using the camera',
  insecure: 'The camera needs a secure (https) page',
};
