// Framing check: the raw camera frame is silhouette-ized (grayscale, crushed,
// blurred) so the player can check framing without the app ever showing the
// raw video. If the browser lacks canvas filters we show only the hint text.

const $ = (id) => document.getElementById(id);

export class Silhouette {
  constructor(video) {
    this.video = video;
    this.canvas = $('silhouette-canvas');
    this.text = $('silhouette-text');
    this.panel = $('silhouette-panel');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.filterOk = typeof this.ctx.filter === 'string' || this.ctx.filter !== undefined;
    this._timer = null;
    this._shown = false;
    this._auto = false;
  }

  show(auto = false) {
    this._shown = true;
    this._auto = auto;
    this.panel.classList.remove('hidden');
  }

  hide() {
    if (!this._shown) return;
    this._shown = false;
    this.panel.classList.add('hidden');
  }

  setText(t) {
    this.text.textContent = t || 'framing check';
  }

  toggle() {
    if (this._shown && !this._auto) this.hide();
    else this.show(false);
    return this._shown;
  }

  draw() {
    if (!this._shown) return;
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.video || this.video.readyState < 2) return;
    if (this.filterOk) {
      g.filter = 'grayscale(1) contrast(1.9) brightness(0.32) blur(1.2px)';
      g.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      g.filter = 'none';
    } else {
      // no filters: draw a soft dark wash only, never raw video
      g.fillStyle = 'rgba(5,7,12,0.85)';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
