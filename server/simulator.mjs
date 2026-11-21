// Threshold — demo vital-signs simulator.
//
// Emits exactly the same message shapes as the real SDK bridge, so the game
// client runs simulated and live signals through one pipeline. Used when:
//   - the player chooses demo mode,
//   - no SmartSpectra API key is configured,
//   - the SDK cannot load or reports a fatal error.
//
// Two ways to play the demo:
//   - Auto-run (default): a cinematic, scripted ritual — pulse warms up, two
//     natural breaths calibrate the door, then three long exhales turn the locks.
//   - Manual: the client can send { t:'sim', key:'space', down:true } to drive
//     a long exhale by holding SPACE, so the lock logic can be exercised by hand.

const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p) => p * p * (3 - 2 * p);

function pulseShape(x) {
  if (x < 0 || x > 1.4) return 0;
  return (
    1.05 * Math.exp(-Math.pow((x - 0.055) / 0.075, 2)) +
    0.42 * Math.exp(-Math.pow((x - 0.33) / 0.05, 2)) +
    0.16 * Math.exp(-Math.pow((x - 0.19) / 0.065, 2))
  );
}

export class Simulator {
  constructor({ log = console } = {}) {
    this.log = log;
    this.emit = null;
    this.timer = null;
    this.t0 = 0;
    this.tickMs = 50;

    // Breath model
    this.phase = 'inhale';
    this.phaseT = 0;
    this.phaseDur = 3.6;
    this.cycle = 0;
    this.spaceHeld = false;
    this.forced = false;
    this.auto = true;
    this.forceTimer = null;

    // Signal rings (same sizes as the live bridge)
    this.pressure = new Array(64).fill(0.5);
    this.chest = new Array(48).fill(0.5);
    this.abdomen = new Array(48).fill(0.5);
    this.pulse = null;
    this.breath = null;

    // Pulse model
    this.bpm = 71;
    this.beats = [];
    this.nextBeat = 0.2;
    this.pulsePhase = 0;

    this.stats = { framesIn: 0, framesDropped: 0 };
    this._lastVal = 10; // starts in "camera tuning"
    this._emittedOk = false;
  }

  start(_opts, emit) {
    this.emit = emit;
    this.t0 = Date.now();
    this.timer = setInterval(() => this._tick(), this.tickMs);
    this._emit({ t: 'status', code: 'running' });
    this._emit({ t: 'validation', code: 10, name: 'cameraTuning', hint: 'The camera is still tuning.', ts: Date.now() });
  }

  control(msg) {
    if (msg.key === 'space') {
      this.spaceHeld = !!msg.down;
      if (msg.down && this.phase !== 'exhale') {
        this.phase = 'exhale';
        this.phaseT = 0;
        this.forced = true;
      }
      if (!msg.down && this.forced) {
        this.forced = false;
        this.phase = 'inhale';
        this.phaseT = 0;
        this.phaseDur = 2.3;
      }
    }
    if (msg.key === 'auto') {
      this.auto = !!msg.on;
    }
    if (msg.key === 'force') {
      // Start a guaranteed long exhale (ends by itself after 3.4 s).
      this.phase = 'exhale';
      this.phaseT = 0;
      this.forced = true;
      if (this.forceTimer) clearTimeout(this.forceTimer);
      this.forceTimer = setTimeout(() => {
        if (this.forced) {
          this.forced = false;
          this.phase = 'inhale';
          this.phaseT = 0;
          this.phaseDur = 2.3;
        }
      }, 3400);
    }
  }

  _tick() {
    const t = (Date.now() - this.t0) / 1000;
    const dt = this.tickMs / 1000;
    this._breath(t, dt);
    this._pulse(t, dt);

    this._emit({
      t: 'metrics',
      ts: Date.now(),
      pulse: this.pulse,
      pressure: [...this.pressure],
      breath: {
        rate: this.breath,
        chest: [...this.chest],
        abdomen: [...this.abdomen],
      },
      landmarks: {
        n: 68,
        x: 0.5 + 0.012 * Math.sin(t * 0.7),
        y: 0.42 + 0.01 * Math.sin(t * 0.5 + 1),
        stable: true,
      },
      stats: this.stats,
    });

    if (t > 2.6 && !this._emittedOk) {
      this._emittedOk = true;
      this._lastVal = 0;
      this._emit({ t: 'validation', code: 0, name: 'ok', hint: '', ts: Date.now() });
    }
  }

  _breath(t, _dt) {
    let pIn;
    let pOut;
    let amp;
    if (this.spaceHeld || this.forced) {
      pIn = 2.3;
      pOut = 6.5;
      amp = 1.05;
    } else if (!this.auto) {
      pIn = 3.4;
      pOut = 3.8;
      amp = 1.0; // manual mode: natural breathing, long exhales only via SPACE
    } else if (t < 10) {
      pIn = 3.6;
      pOut = 3.6;
      amp = 0.35; // warm-up: gentle, low-amplitude breathing
    } else if (t < 38) {
      pIn = 3.4;
      pOut = 3.8;
      amp = 1.0; // two natural calibration breaths
    } else {
      pIn = 2.3;
      pOut = 5.2;
      amp = 1.05; // the long exhales
    }

    this.phaseT += this.tickMs / 1000;
    if (this.phase === 'inhale' && this.phaseT >= pIn) {
      this.phase = 'exhale';
      this.phaseT = 0;
    } else if (this.phase === 'exhale' && !this.spaceHeld && !this.forced && this.phaseT >= pOut) {
      this.phase = 'inhale';
      this.phaseT = 0;
      this.cycle += 1;
    }

    const prog = clamp01(this.phaseT / (this.phase === 'inhale' ? pIn : pOut));
    const e = easeInOut(prog);
    const level = this.phase === 'inhale' ? e : 1 - e;
    const jitter = 0.9 + 0.2 * Math.sin(t * 1.7 + this.cycle * 2.1);
    const ripple = 0.012 * Math.sin(this.pulsePhase);

    const chestV = 0.5 + (level - 0.5) * amp * jitter + ripple + (Math.random() - 0.5) * 0.012;
    const abdV = 0.5 + (level - 0.5) * amp * 0.92 * jitter + (Math.random() - 0.5) * 0.016;
    this.chest.push(chestV);
    this.chest.shift();
    this.abdomen.push(abdV);
    this.abdomen.shift();

    const rateNow = 60 / (pIn + pOut);
    const conf = Math.min(1, t / 30) * 84;
    this.breath = { rate: rateNow, conf, stable: conf >= 45 };
  }

  _pulse(t, dt) {
    this.bpm =
      71 +
      3.5 * Math.sin(TAU * 0.016 * t) +
      0.7 * Math.sin(TAU * 0.0031 * t + 1.3) +
      (Math.random() - 0.5) * 0.8;

    while (t >= this.nextBeat) {
      this.beats.push(this.nextBeat);
      const rr = 60 / this.bpm;
      this.nextBeat += rr * (0.96 + Math.random() * 0.08);
    }
    while (this.beats.length && this.beats[0] < t - 1.4) this.beats.shift();

    this.pulsePhase += dt * TAU * (this.bpm / 60);

    let v = 0.34;
    for (const bt of this.beats) v += pulseShape(t - bt);
    this.pressure.push(v);
    this.pressure.shift();

    const conf = Math.min(1, t / 10) * (88 + 5 * Math.sin(TAU * 0.05 * t));
    this.pulse = { rate: this.bpm, conf, stable: conf >= 40 };
  }

  _emit(obj) {
    try {
      if (this.emit) this.emit(obj);
    } catch {
      /* client gone — ignore */
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.forceTimer) clearTimeout(this.forceTimer);
    this.forceTimer = null;
    this._emit({ t: 'status', code: 'stopped' });
  }
}
