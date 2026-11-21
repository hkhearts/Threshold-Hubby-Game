// Frame pump worker: receives ImageBitmaps from the main thread, draws them
// to an OffscreenCanvas at the send resolution, converts RGBA -> tightly
// packed RGB, prepends the 6-byte header (u16 width, u16 height, u16 seq)
// the server expects, and transfers the buffer back for the WebSocket.
//
// The raw frame never touches the DOM and is never stored anywhere.

let w = 0;
let h = 0;
let canvas = null;
let ctx = null;
let seq = 0;

self.onmessage = (e) => {
  const m = e.data;
  if (!m) return;
  if (m.type === 'init') {
    w = m.width;
    h = m.height;
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    seq = 0;
    return;
  }
  if (m.type === 'frame') {
    try {
      if (!canvas || !ctx) {
        m.bitmap?.close?.();
        return;
      }
      ctx.drawImage(m.bitmap, 0, 0, w, h);
      m.bitmap.close();

      const img = ctx.getImageData(0, 0, w, h).data;
      const out = new Uint8Array(6 + w * h * 3);
      out[0] = w & 255;
      out[1] = (w >> 8) & 255;
      out[2] = h & 255;
      out[3] = (h >> 8) & 255;
      seq = (seq + 1) & 0xffff;
      out[4] = seq & 255;
      out[5] = (seq >> 8) & 255;

      let p = 6;
      for (let i = 0; i < img.length; i += 4) {
        out[p++] = img[i];
        out[p++] = img[i + 1];
        out[p++] = img[i + 2];
      }
      self.postMessage({ type: 'frame', buf: out.buffer }, [out.buffer]);
    } catch {
      try {
        m.bitmap?.close?.();
      } catch {
        /* ignore */
      }
    }
  }
};
