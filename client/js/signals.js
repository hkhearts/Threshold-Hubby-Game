// The signal model: consumes metrics/validation messages from the bridge,
// smooths them, and turns the raw chest trace into breath *phases*.
//
// Phase detection: the chest trace is detrended, normalized to a robust
// z-score, and segmented at direction changes. The first two cycles calibrate
// which direction is inhale vs exhale (the longer phase wins as "exhale",
// which makes the game robust to either SDK trace polarity). A "long exhale"
// is an exhale segment of >= 2.6 s with a decent peak — that turns a lock.
// Slow full cycles (>= 2.2 s) are counted as the fallback path.
//
// Pulse: peak detection on the arterial-pressure ring drives the keyhole
// rhythm; confidence >= 40 (the SDK's ±3 bpm threshold) counts as a valid
// pulse, confidence >= 45 as a valid breath.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

export class Signals {
  constructor() {
    this.source = 'none';
    this.reason = null;
    this.pulse = { rate: 0, conf: 0, stable: false, ok: false, flash: 0, lastSeen: -Infinity };
    this.breath = { rate: 0, conf: 0, stable: false, ok: false, chest: 0.5, level: 0.5, amp: 0, lastSeen: -Infinity };
    this.validation = { code: 0, hint: '', ok: true, lastSeen: -Infinity, name: 'ok' };
    this.landmarks = { n: 0, x: 0.5, y: 0.42, drift: 0, lastSeen: -Infinity };
    this.stats = { framesIn: 0, framesDropped: 0 };
    this.sdkStatus = 'connecting';
    this.phase = { name: 'idle', progress: 0, dur: 0 };

    this.cycles = 0;
    this.calibrated = false;
    this.chestHistory = new Array(240).fill(0.5);

    this.callbacks = {};

    // breath tracker
    this._ring = [];
    this._dirMap = { 1: 'inhale', '-1': 'exhale' };
    this._rising = [];
    this._falling = [];
    this._current = null;
    this._zSmooth = undefined;
    this._landmarkX = null;
    this._landmarkY = null;

    // pulse tracker
    this._lastBeat = -Infinity;
  }

  on(ev, fn) {
    (this.callbacks[ev] ??= []).push(fn);
  }

  _fire(ev, ...args) {
    for (const fn of this.callbacks[ev] ?? []) {
      try {
        fn(...args);
      } catch {
        /* listeners must not break the pipeline */
      }
    }
  }

  applyHello(msg) {
    this.setSource(msg.source, msg.reason);
  }

  setSource(source, reason) {
    this.source = source;
    this.reason = reason;
    if (source !== 'live') this.sdkStatus = 'simulated';
  }

  applyMetrics(m, now) {
    if (m.pulse) {
      const p = this.pulse;
      p.rate = m.pulse.rate;
      p.conf = m.pulse.conf;
      p.stable = !!m.pulse.stable;
      p.ok = p.conf >= 40;
      p.lastSeen = now;
    }
    if (m.breath) {
      const b = this.breath;
      if (m.breath.rate) {
        b.rate = m.breath.rate.rate;
        b.conf = m.breath.rate.conf;
        b.stable = !!m.breath.rate.stable;
        b.ok = b.conf >= 45;
        b.lastSeen = now;
      }
    }
    if (Array.isArray(m.pressure) && m.pressure.length > 4) {
      this._detectBeats(m.pressure, now);
    }
    if (Array.isArray(m.breath?.chest) && m.breath.chest.length) {
      const v = m.breath.chest[m.breath.chest.length - 1];
      this.breath.chest = v;
      this.chestHistory.push(v);
      this.chestHistory.shift();
      this._trackBreath(v, now);
    }
    if (m.landmarks && m.landmarks.n) {
      const lm = this.landmarks;
      if (this._landmarkX !== null) {
        lm.drift = Math.hypot(m.landmarks.x - this._landmarkX, m.landmarks.y - this._landmarkY);
      }
      this._landmarkX = m.landmarks.x;
      this._landmarkY = m.landmarks.y;
      lm.n = m.landmarks.n;
      lm.x = m.landmarks.x;
      lm.y = m.landmarks.y;
      lm.lastSeen = now;
    }
    if (m.stats) this.stats = m.stats;
    if (this.sdkStatus !== 'running' && this.source === 'live') this.sdkStatus = 'running';
  }

  applyValidation(v, now) {
    const prev = this.validation.code;
    this.validation = {
      code: v.code,
      name: v.name ?? 'unknown',
      hint: v.hint ?? '',
      ok: v.code === 0,
      lastSeen: now,
    };
    if (prev !== v.code) this._fire('validation', this.validation);
  }

  applyStatus(s) {
    this.sdkStatus = s.code;
  }

  applyError(e) {
    this.lastError = e;
    this._fire('error', e);
  }

  applyNotice(text) {
    this._fire('notice', text);
  }

  update(dt, now) {
    // staleness decay
    const pulseAge = now - this.pulse.lastSeen;
    if (pulseAge > 3000) {
      this.pulse.conf *= Math.exp(-dt / 1.8);
      this.pulse.ok = this.pulse.conf >= 40 && pulseAge < 9000;
    }
    const breathAge = now - this.breath.lastSeen;
    if (breathAge > 3000) {
      this.breath.conf *= Math.exp(-dt / 1.8);
      this.breath.ok = this.breath.conf >= 45 && breathAge < 9000;
    }
    if (now - this.validation.lastSeen > 2500 && !this.validation.ok) {
      this.validation.ok = true; // SDK stopped complaining
    }
    this.pulse.flash *= Math.exp(-dt * 5.2);
    if (this._current && now - this._current.t0 > 14000) {
      this._endSegment(now, null);
    }
  }

  // ---- pulse beats --------------------------------------------------------

  _detectBeats(ring, now) {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of ring) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const mean = sum / ring.length;
    const range = Math.max(max - min, 0.06);
    const v = ring[ring.length - 1];
    if (v > mean + 0.6 * range && now - this._lastBeat > 260) {
      this._lastBeat = now;
      this.pulse.flash = Math.min(1, 0.45 + this.pulse.conf / 140);
      this._fire('beat', this.pulse.flash);
    }
  }

  // ---- breath phases ---------------------------------------------------------

  _trackBreath(v, now) {
    this._ring.push({ v, t: now });
    if (this._ring.length > 300) this._ring.shift();
    if (this._ring.length < 60) return;

    const win = this._ring.filter((s) => now - s.t < 7000);
    if (win.length < 30) return;

    let mean = 0;
    for (const s of win) mean += s.v;
    mean /= win.length;

    const det = win.map((s) => s.v - mean);
    det.sort((a, b) => a - b);
    const med = det[det.length >> 1];
    const ad = det.map((d) => Math.abs(d - med)).sort((a, b) => a - b);
    const mad = Math.max(ad[ad.length >> 1], 0.015);
    const z = (v - mean - med) / Math.max(mad * 1.4826, 0.02);

    this._zSmooth = this._zSmooth === undefined ? z : this._zSmooth * 0.72 + z * 0.28;
    const zs = this._zSmooth;

    const dir = zs > 0.1 ? 1 : zs < -0.1 ? -1 : 0;

    if (!this._current) {
      if (dir !== 0) {
        this._current = { dir, t0: now, peakZ: Math.abs(zs) };
        const label = this._current.dir === 1 ? this._dirMap[1] : this._dirMap[-1];
        this._fire('phase-start', { dir: label, t0: now });
      }
    } else {
      this._current.peakZ = Math.max(this._current.peakZ, Math.abs(zs));
      if (dir !== 0 && dir !== this._current.dir) {
        this._endSegment(now, dir);
        this._current = { dir, t0: now, peakZ: Math.abs(zs) };
        const label = this._current.dir === 1 ? this._dirMap[1] : this._dirMap[-1];
        this._fire('phase-start', { dir: label, t0: now });
      }
    }

    if (this._current && Math.abs(zs) > 0.12) {
      const name = this._current.dir === 1 ? this._dirMap[1] : this._dirMap[-1];
      this.phase.name = name;
      this.phase.dur = now - this._current.t0;
      this.phase.progress = Math.min(1, this.phase.dur / (name === 'exhale' ? 3400 : 3000));
    } else if (!this._current) {
      this.phase.name = 'idle';
      this.phase.progress = 0;
      this.phase.dur = 0;
    }

    this.breath.level = clamp01(0.5 + zs * 0.38);
    this.breath.amp = Math.max(mad * 1.4826, 0);
  }

  _endSegment(now, _nextDir) {
    const seg = this._current;
    this._current = null;
    if (!seg) return;
    const dur = now - seg.t0;
    const label = seg.dir === 1 ? this._dirMap[1] : this._dirMap[-1];

    if (dur < 1100 || seg.peakZ < 0.42) return; // noise, not a breath segment

    (seg.dir === 1 ? this._rising : this._falling).push(dur);
    if (this._rising.length > 10) this._rising.shift();
    if (this._falling.length > 10) this._falling.shift();

    // direction calibration after the first two full cycles
    if (!this.calibrated && this._rising.length >= 2 && this._falling.length >= 2) {
      const mr = avg(this._rising);
      const mf = avg(this._falling);
      if (mf > mr * 1.35) {
        this._dirMap = { 1: 'inhale', '-1': 'exhale' };
      } else if (mr > mf * 1.35) {
        this._dirMap = { 1: 'exhale', '-1': 'inhale' };
      } else {
        this._dirMap = { 1: 'inhale', '-1': 'exhale' };
      }
      this.calibrated = true;
      this._fire('calibrated');
    }

    this._fire('segment', { dir: label, dur, peakZ: seg.peakZ });

    if (label === 'exhale') {
      if (dur >= 2600 && seg.peakZ >= 0.55 && this._breathTrusted()) {
        this._fire('long-exhale', { dur });
      } else if (dur >= 2200 && this._breathTrusted()) {
        this._fire('cycle', { dur });
      }
    }
  }

  _breathTrusted() {
    return this.breath.ok && this.validation.ok;
  }
}
