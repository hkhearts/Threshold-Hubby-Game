// Threshold — SmartSpectra SDK bridge.
//
// Owns one SDK session. The browser captures webcam frames and pushes them
// here over the local WebSocket; we feed them to the SDK through the
// custom-input API (useCustomInput / sendFrame), decode the protobuf metrics
// payloads, and re-emit compact JSON messages toward the client.
//
// Telemetry is always disabled for Threshold (enableTelemetry: false) and the
// consent screen discloses that.

import { SmartSpectraSDK, PixelFormat, SmartSpectraLogLevel } from '@smartspectra/node-sdk';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';

// Stable metric codes (protobuf MetricType). The SDK also exports a MetricType
// object; we prefer that and fall back to this table.
export const METRIC_CODES = {
  CHEST_BREATHING: 0,
  ABDOMEN_BREATHING: 1,
  BREATHING_RATE: 2,
  EDA_TRACE: 10,
  FACE_LANDMARKS: 11,
  BLINKING: 12,
  TALKING: 13,
  EXPRESSIONS: 14,
  PULSE_RATE: 15,
  ARTERIAL_PRESSURE_TRACE: 16,
  HRV: 17,
};

export const PROCESSING_NAMES = ['uninitialized', 'idle', 'starting', 'running', 'stopping', 'error'];

export const VALIDATION_NAMES = {
  0: 'ok',
  1: 'noFaceFound',
  2: 'multipleFacesFound',
  3: 'faceNotCentered',
  4: 'faceSizeOutOfRange',
  5: 'tooDark',
  6: 'tooBright',
  7: 'chestNotVisible',
  10: 'cameraTuning',
  11: 'frameRateTooLow',
  12: 'excessiveMotion',
  13: 'faceTooClose',
  14: 'faceTooFar',
  15: 'faceTooHigh',
  16: 'faceTooLow',
  17: 'faceNotForward',
};

export const ERROR_NAMES = {
  0: 'ok',
  1: 'invalidState',
  2: 'authenticationFailed',
  3: 'configurationFailed',
  4: 'creditExhausted',
  5: 'networkError',
  6: 'serverError',
  7: 'inputUnavailable',
  8: 'processingFailed',
  9: 'frameConversionFailed',
  10: 'nonMonotonicTimestamp',
  11: 'timestampGap',
  13: 'metricNotAuthorized',
  14: 'sustainedLowFrameRate',
};

// Error codes after which the ritual falls back to the simulated signal.
const FATAL_ERROR_CODES = new Set([2, 3, 4, 5, 6, 7, 13]);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const lastOf = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null);
const pick = (obj, ...names) => {
  if (!obj) return undefined;
  for (const n of names) {
    const v = obj[n];
    if (v !== undefined) return v;
  }
  return undefined;
};

export class SdkBridge {
  constructor({ apiKey, metricNames = [], log = console }) {
    this.apiKey = apiKey;
    this.metricNames = metricNames;
    this.log = log;
    this.sdk = null;
    this.running = false;
    this.onFatal = null;
    this.fatalFired = false;
    this.version = null;

    this.pressure = new Array(64).fill(0.5);
    this.chest = new Array(48).fill(0.5);
    this.abdomen = new Array(48).fill(0.5);
    this.lastPulse = null;
    this.lastBreathRate = null;
    this.lastLandmarks = null;

    this.framesIn = 0;
    this.framesDropped = 0;
    this._lastTs = 0n;
    this._lastEmit = 0;
    this._emit = null;
  }

  start({ width, height }, emit) {
    this._emit = emit;
    this._lastEmit = 0;

    const codes = [];
    for (const name of this.metricNames) {
      const code = METRIC_CODES[name];
      if (typeof code === 'number') codes.push(code);
    }
    if (!codes.length) {
      codes.push(METRIC_CODES.CHEST_BREATHING, METRIC_CODES.ABDOMEN_BREATHING, METRIC_CODES.BREATHING_RATE);
    }

    this.sdk = new SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: codes,
      enableTelemetry: false,
      logLevel: SmartSpectraLogLevel.kWarning,
    });

    this.version = SmartSpectraSDK.version ?? null;

    this.sdk.on('processingStatus', (s) => {
      this._send({ t: 'status', code: PROCESSING_NAMES[s] ?? `status-${s}` });
    });

    this.sdk.on('validationStatus', (code, _tsUs, hint) => {
      this._send({
        t: 'validation',
        code,
        name: VALIDATION_NAMES[code] ?? 'unknown',
        hint: typeof hint === 'string' ? hint : String(hint ?? ''),
        ts: Date.now(),
      });
    });

    this.sdk.on('metrics', (buf) => this._onMetrics(buf));

    this.sdk.on('error', (code, message, retryable) => {
      this._send({
        t: 'error',
        code,
        name: ERROR_NAMES[code] ?? 'error',
        message: String(message ?? ''),
        retryable: !!retryable,
      });
      if (FATAL_ERROR_CODES.has(code) && !this.fatalFired) {
        this.fatalFired = true;
        this.running = false;
        if (this.onFatal) this.onFatal(String(message ?? ERROR_NAMES[code] ?? code));
      }
    });

    this.sdk.useCustomInput();
    this.sdk.start(); // throws on configuration failures
    this.running = true;
  }

  frame(rgb, w, h) {
    if (!this.running || !this.sdk) return false;
    let now = process.hrtime.bigint() / 1000n;
    if (now <= this._lastTs) now = this._lastTs + 1n;
    this._lastTs = now;
    try {
      const ok = this.sdk.sendFrame(rgb, w, h, w * 3, PixelFormat.kRGB, Number(now));
      this.framesIn += 1;
      if (!ok) this.framesDropped += 1;
      return ok;
    } catch (err) {
      this.framesDropped += 1;
      return false;
    }
  }

  _onMetrics(buf) {
    let m;
    try {
      m = decodeMetrics(buf);
    } catch {
      return;
    }
    if (!m || Buffer.isBuffer(m)) return;

    const b = pick(m, 'breathing') ?? m.getBreathing?.();
    const c = pick(m, 'cardio') ?? m.getCardio?.();
    const f = pick(m, 'face') ?? m.getFace?.();

    // Breathing -----------------------------------------------------------
    const rate = lastOf(pick(b, 'rate') ?? b?.getRate?.());
    if (rate) {
      const value = num(rate.value);
      if (value !== null) {
        this.lastBreathRate = {
          rate: value,
          conf: num(rate.confidence) ?? 0,
          stable: !!rate.stable,
        };
      }
    }
    const chest = lastOf(pick(b, 'upperTrace') ?? b?.getUpperTrace?.());
    if (chest) {
      const v = num(chest.value);
      if (v !== null) {
        this.chest.push(v);
        this.chest.shift();
      }
    }
    const abd = lastOf(pick(b, 'lowerTrace') ?? b?.getLowerTrace?.());
    if (abd) {
      const v = num(abd.value);
      if (v !== null) {
        this.abdomen.push(v);
        this.abdomen.shift();
      }
    }

    // Cardio --------------------------------------------------------------
    const pulse = lastOf(pick(c, 'pulseRate') ?? c?.getPulseRate?.());
    if (pulse) {
      const value = num(pulse.value);
      if (value !== null) {
        this.lastPulse = {
          rate: value,
          conf: num(pulse.confidence) ?? 0,
          stable: !!pulse.stable,
        };
      }
    }
    const press = lastOf(pick(c, 'arterialPressureTrace') ?? c?.getArterialPressureTrace?.());
    if (press) {
      const v = num(press.value);
      if (v !== null) {
        this.pressure.push(v);
        this.pressure.shift();
      }
    }

    // Face landmarks (presence / stillness) --------------------------------
    const lm = lastOf(pick(f, 'landmarks') ?? f?.getLandmarks?.());
    if (lm) {
      const pts = pick(lm, 'value');
      if (Array.isArray(pts) && pts.length) {
        let sx = 0;
        let sy = 0;
        for (const p of pts) {
          sx += num(p.x) ?? 0;
          sy += num(p.y) ?? 0;
        }
        this.lastLandmarks = {
          n: pts.length,
          x: sx / pts.length,
          y: sy / pts.length,
          stable: !!lm.stable,
        };
      }
    }

    this._maybeEmit();
  }

  _maybeEmit() {
    const now = Date.now();
    if (now - this._lastEmit < 50) return; // ~20 Hz forward rate
    this._lastEmit = now;
    this._send({
      t: 'metrics',
      ts: now,
      pulse: this.lastPulse,
      pressure: [...this.pressure],
      breath: {
        rate: this.lastBreathRate,
        chest: [...this.chest],
        abdomen: [...this.abdomen],
      },
      landmarks: this.lastLandmarks,
      stats: { framesIn: this.framesIn, framesDropped: this.framesDropped },
    });
  }

  _send(obj) {
    try {
      if (this._emit) this._emit(obj);
    } catch {
      /* client gone — ignore */
    }
  }

  async stop() {
    this.running = false;
    const sdk = this.sdk;
    this.sdk = null;
    if (!sdk) return;
    try {
      sdk.stop();
    } catch {
      /* ignore */
    }
    try {
      await sdk.stopAsync();
    } catch {
      /* ignore */
    }
    try {
      await sdk.destroy();
    } catch {
      /* ignore */
    }
  }
}
