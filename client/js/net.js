// Network bridge: owns the camera stream, the WebSocket to the local server,
// and the frame pump that ships downscaled RGB frames to the SDK (live mode).
// In demo mode the same socket carries the simulated signal instead.

export const QUALITIES = {
  SD: { width: 480, height: 360, fps: 12 },
  HD: { width: 640, height: 480, fps: 20 },
  ULTRA: { width: 960, height: 540, fps: 24 },
};

export class Bridge {
  constructor({ video, signals }) {
    this.video = video;
    this.signals = signals;
    this.ws = null;
    this.mode = 'demo';
    this.quality = QUALITIES.HD;
    this.latency = null;
    this.droppedFrames = 0;
    this.sentFrames = 0;

    this._deliberate = false;
    this._retries = 0;
    this._worker = null;
    this._pumping = false;
    this._raf = 0;
    this._lastFrame = 0;
    this._inflight = 0;
    this._pingTimer = null;

    this.onHello = null;
    this.onReconnect = null;
  }

  // ---- camera ----------------------------------------------------------

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    return stream;
  }

  stopCamera() {
    if (this.video.srcObject) {
      for (const track of this.video.srcObject.getTracks()) track.stop();
      this.video.srcObject = null;
    }
  }

  // ---- connection --------------------------------------------------------

  connect({ mode, quality }) {
    this.mode = mode;
    this.quality = quality ?? this.quality;
    this._deliberate = false;
    this._open();
  }

  _open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this._retries = 0;
      ws.send(JSON.stringify({ t: 'hello', mode: this.mode, quality: this.quality }));
      if (this.mode === 'live') this.startPump();
      this._pingTimer = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', t0: performance.now() }));
      }, 2000);
    };

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const s = this.signals;
      switch (msg.t) {
        case 'hello':
          s.applyHello(msg);
          if (this.onHello) this.onHello(msg);
          break;
        case 'metrics':
          s.applyMetrics(msg, performance.now());
          break;
        case 'validation':
          s.applyValidation(msg, performance.now());
          break;
        case 'status':
          s.applyStatus(msg);
          break;
        case 'error':
          s.applyError(msg);
          break;
        case 'notice':
          s.applyNotice(msg.text);
          break;
        case 'pong':
          this.latency = performance.now() - msg.t0;
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      this.stopPump();
      clearInterval(this._pingTimer);
      this._pingTimer = null;
      if (!this._deliberate && this._retries < 3) {
        this._retries += 1;
        setTimeout(() => this._open(), 1500 * this._retries);
        if (this.onReconnect) this.onReconnect(this._retries);
      }
    };
    ws.onerror = () => {
      /* onclose handles it */
    };
  }

  disconnect() {
    this._deliberate = true;
    this.stopPump();
    this.stopCamera();
    clearInterval(this._pingTimer);
    this._pingTimer = null;
    if (this.ws) {
      try {
        if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'bye' }));
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }

  // ---- demo controls -----------------------------------------------------

  sendSim(payload) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify({ t: 'sim', ...payload }));
      } catch {
        /* ignore */
      }
    }
  }

  // ---- frame pump ----------------------------------------------------------

  startPump() {
    if (this._pumping) return;
    if (!this._worker) {
      this._worker = new Worker('/js/framepump.js', { type: 'module' });
      this._worker.onmessage = (e) => {
        if (e.data && e.data.type === 'frame') {
          this._inflight = Math.max(0, this._inflight - 1);
          this._sendFrame(e.data.buf);
        }
      };
      this._worker.onerror = () => {
        this._inflight = 0;
      };
      this._worker.postMessage({ type: 'init', width: this.quality.width, height: this.quality.height });
    }
    this._pumping = true;
    this._lastFrame = 0;
    this._raf = requestAnimationFrame(this._pump);
  }

  stopPump() {
    this._pumping = false;
    cancelAnimationFrame(this._raf);
    this._inflight = 0;
  }

  _pump = () => {
    if (!this._pumping) return;
    this._raf = requestAnimationFrame(this._pump);
    const now = performance.now();
    if (document.hidden) return;
    if (now - this._lastFrame < 1000 / this.quality.fps) return;
    if (this._inflight >= 2) return;
    const v = this.video;
    if (!v || v.readyState < 2) return;
    this._lastFrame = now;
    this._inflight += 1;
    createImageBitmap(v, {
      resizeWidth: this.quality.width,
      resizeHeight: this.quality.height,
      resizeQuality: 'medium',
    })
      .then((bmp) => {
        if (this._worker) {
          this._worker.postMessage({ type: 'frame', bitmap: bmp }, [bmp]);
        } else {
          bmp.close();
          this._inflight -= 1;
        }
      })
      .catch(() => {
        this._inflight -= 1;
      });
  };

  _sendFrame(buf) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    if (ws.bufferedAmount > 4 * 1024 * 1024) {
      this.droppedFrames += 1;
      return;
    }
    try {
      ws.send(buf);
      this.sentFrames += 1;
    } catch {
      this.droppedFrames += 1;
    }
  }
}
