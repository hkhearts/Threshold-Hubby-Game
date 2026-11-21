// Camera director: keyframed cutscene tracks (Catmull-Rom position paths,
// eased look targets, fov curves) plus procedural idle rigs with gentle
// handheld sway, breathing follow, and a slow orbit for the epilogue.

import * as THREE from 'three';

const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function piecewise(pts, u) {
  if (!pts.length) return null;
  if (u <= pts[0].t) return { a: pts[0], b: pts[0], k: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = Math.max(1e-6, b.t - a.t);
      return { a, b, k: ease(Math.min(1, Math.max(0, (u - a.t) / span))) };
    }
  }
  const last = pts[pts.length - 1];
  return { a: last, b: last, k: 0 };
}

export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.track = null;
    this.curve = null;
    this.reduced = false;
    this.idle = null;
    this._look = null;
    this._fov = 38;
    this.baseFov = 38;
  }

  setReduced(v) {
    this.reduced = v;
  }

  // points: [{ t: seconds, p: [x,y,z], l: [x,y,z], fov? }]
  play(points, { duration, loop = false, sway = 0.016 } = {}) {
    const sorted = [...points].sort((a, b) => a.t - b.t);
    const norm = sorted.map((p) => ({
      ...p,
      t: p.t / Math.max(1, duration || 1),
      p: Array.isArray(p.p) ? new THREE.Vector3(...p.p) : p.p,
      l: Array.isArray(p.l) ? new THREE.Vector3(...p.l) : p.l,
    }));
    this.track = { points: norm, duration, loop, sway, start: performance.now() / 1000 };
    this.curve = new THREE.CatmullRomCurve3(
      norm.map((p) => p.p),
      false,
      'catmullrom',
      0.5
    );
  }

  stopTrack() {
    this.track = null;
    this.curve = null;
  }

  // { pos: [x,y,z], look: [x,y,z], sway, orbit: { r, h, speed } }
  setIdle(idle) {
    this.stopTrack();
    this.idle = idle;
  }

  update(t, dt, extra = {}) {
    const cam = this.camera;
    let pos;
    let look;
    let fov = this.baseFov;
    let sway = 0.015;

    if (this.track) {
      const s = (performance.now() / 1000 - this.track.start) / Math.max(0.001, this.track.duration);
      if (!this.track.loop && s >= 1 && this.idle) {
        this.stopTrack();
        return this.update(t, dt, extra);
      }
      const u = this.track.loop ? ((s % 1) + 1) % 1 : Math.min(1, Math.max(0, s));
      pos = this.curve ? this.curve.getPointAt(u) : new THREE.Vector3(0, 1.6, 2.5);
      const seg = piecewise(this.track.points, u);
      look = seg.a.l.clone().lerp(seg.b.l, seg.k);
      fov = seg.a.fov ?? this.baseFov;
      if (seg.b.fov !== undefined) fov = (seg.a.fov ?? this.baseFov) + (seg.b.fov - (seg.a.fov ?? this.baseFov)) * seg.k;
      sway = this.track.sway;
    } else if (this.idle) {
      const id = this.idle;
      if (id.orbit) {
        const a = t * id.orbit.speed;
        pos = new THREE.Vector3(
          id.pos[0] + Math.cos(a) * id.orbit.r,
          id.pos[1] + id.orbit.h + Math.sin(t * 0.21) * 0.05,
          id.pos[2] + Math.sin(a) * id.orbit.r
        );
      } else {
        pos = new THREE.Vector3(
          id.pos[0] + Math.sin(t * 0.45) * 0.16,
          id.pos[1] + Math.sin(t * 0.32 + 1.2) * 0.10,
          id.pos[2] + Math.cos(t * 0.28) * 0.12
        );
      }
      look = new THREE.Vector3(...id.look);
      sway = id.sway ?? 0.024;
    } else {
      pos = cam.position.clone();
      look = new THREE.Vector3(0, 1.5, 0);
    }

    // handheld dreamy float
    const a = this.reduced ? 0 : sway;
    pos.x += Math.sin(t * 0.9) * a + Math.sin(t * 1.8 + 1.5) * a * 0.5;
    pos.y += Math.sin(t * 0.75 + 0.6) * a * 0.8;
    pos.z += Math.sin(t * 1.1 + 1.0) * a * 0.4;

    // the camera breathes with the player
    if (extra.breath) pos.z += extra.breath * 0.045;

    cam.position.lerp(pos, 1 - Math.exp(-dt * 3.4));
    if (!this._look) this._look = look.clone();
    this._look.lerp(look, 1 - Math.exp(-dt * 3.4));
    cam.lookAt(this._look);

    const effFov = fov + (extra.fovAdd ?? 0);
    this._fov += (effFov - this._fov) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs(cam.fov - this._fov) > 0.01) {
      cam.fov = this._fov;
      cam.updateProjectionMatrix();
    }
  }
}
