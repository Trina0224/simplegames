export class MirrorCamera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.enabled = false;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.enabled = true;
      return true;
    } catch (_) {
      this.enabled = false;
      return false;
    }
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    this.stream = null;
    this.video.srcObject = null;
    this.enabled = false;
  }
}
