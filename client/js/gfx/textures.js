// Procedural canvas textures — no external image assets, everything generated.

import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Warm dreamy wood grain, for the door planks and room floor.
export function woodTexture({ base = '#edd9c3', dark = '#dbbe9f', light = '#faf2e8', w = 256, h = 512 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 240; i++) {
    const x = Math.random() * w;
    const y0 = Math.random() * h;
    g.strokeStyle = Math.random() < 0.5 ? dark : light;
    g.globalAlpha = 0.05 + Math.random() * 0.13;
    g.lineWidth = 0.6 + Math.random() * 1.7;
    g.beginPath();
    g.moveTo(x, y0);
    g.bezierCurveTo(
      x + (Math.random() * 9 - 4.5), y0 + h * 0.18,
      x + (Math.random() * 9 - 4.5), y0 + h * 0.42,
      x + (Math.random() * 6 - 3), y0 + h * (0.28 + Math.random() * 0.3)
    );
    g.stroke();
  }
  g.globalAlpha = 1;

  // knots
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 3 + Math.random() * 8;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(16, 8, 3, 0.55)');
    gr.addColorStop(0.6, 'rgba(16, 8, 3, 0.18)');
    gr.addColorStop(1, 'rgba(16, 8, 3, 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Low-poly dreamy stone blocks with soft warm speckle.
export function stoneTexture({ base = '#f3ebe2', hi = '#fbf7f1', lo = '#e7dbcd', w = 256, h = 256 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  const cols = 6;
  const rows = 6;
  const cw = w / cols;
  const ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + (y % 2) * cw * 0.5;
      const py = y * ch;
      g.fillStyle = Math.random() < 0.5 ? hi : lo;
      g.globalAlpha = 0.25 + Math.random() * 0.35;
      g.fillRect(px + 1, py + 1, cw - 2, ch - 2);
    }
  }
  g.globalAlpha = 1;
  // speckle
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
    g.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Soft radial glow sprite for dust motes and particles.
export function glowTexture(size = 128) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
