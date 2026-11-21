// Threshold — server.
//
// Serves the game (static client + vendored three.js) and hosts the local
// WebSocket at /ws. The browser pushes webcam frames over that socket; when a
// SmartSpectra API key is configured we feed them to the real SDK, otherwise
// (or on any fatal SDK error) we serve the honest, clearly-labelled simulated
// demo signal instead. The game always works; it never fakes data silently.
//
// Privacy: nothing is logged to disk, no cloud backend, SDK telemetry off.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { SdkBridge } from './sdk-bridge.mjs';
import { Simulator } from './simulator.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // server/
const APP = path.resolve(ROOT, '..'); // project root
const CLIENT = path.join(APP, 'client');

const DEFAULT_METRICS = [
  'CHEST_BREATHING',
  'ABDOMEN_BREATHING',
  'BREATHING_RATE',
  'PULSE_RATE',
  'ARTERIAL_PRESSURE_TRACE',
  'FACE_LANDMARKS',
];

function loadConfig() {
  const cfg = {
    apiKey: '',
    enableTelemetry: false,
    port: 4310,
    metrics: [...DEFAULT_METRICS],
    quality: { width: 640, height: 480, fps: 20 },
  };
  const cfgPath = path.join(APP, 'threshold.config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
    } catch (err) {
      console.warn('[threshold] could not parse threshold.config.json:', err.message);
    }
  }
  if (process.env.SMARTSPECTRA_API_KEY) cfg.apiKey = String(process.env.SMARTSPECTRA_API_KEY);
  if (process.env.PORT) {
    const p = Number(process.env.PORT);
    if (Number.isFinite(p) && p > 0) cfg.port = p;
  }
  if (!Array.isArray(cfg.metrics) || !cfg.metrics.length) cfg.metrics = [...DEFAULT_METRICS];
  return cfg;
}

const config = loadConfig();

// The SDK package is optional at the import level: if the native runtime is
// missing or broken we still serve the game with the simulator.
let sdkAvailable = true;
let sdkLoadError = null;
try {
  await import('@smartspectra/node-sdk');
} catch (err) {
  sdkAvailable = false;
  sdkLoadError = err;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function normalizeQuality(q) {
  const d = config.quality;
  return {
    width: clamp(Math.round(q?.width ?? d.width), 320, 1280),
    height: clamp(Math.round(q?.height ?? d.height), 240, 720),
    fps: clamp(Math.round(q?.fps ?? d.fps), 8, 30),
  };
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Vendored three.js (the client uses an import map pointing at these routes).
app.use('/vendor/build', express.static(path.join(APP, 'node_modules', 'three', 'build')));
app.use('/vendor/addons', express.static(path.join(APP, 'node_modules', 'three', 'examples', 'jsm')));

// The game itself.
app.use(express.static(CLIENT, { index: 'index.html' }));
app.get('/', (_req, res) => res.sendFile(path.join(CLIENT, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 * 1024 });

let active = null; // { kind: 'live' | 'demo', source, conn }

function send(conn, obj) {
  try {
    if (conn.readyState === 1) conn.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function stopActive() {
  const a = active;
  active = null;
  if (a) {
    try {
      const p = a.source.stop();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

function startDemoSource(conn, quality, emit, reason, notice) {
  const sim = new Simulator();
  sim.start(quality, emit);
  active = { kind: 'demo', source: sim, conn };
  emit({ t: 'hello', source: 'demo', reason, sdkVersion: null, quality, telemetry: false });
  if (notice) emit({ t: 'notice', text: notice });
  console.log(`[threshold] source=demo (${reason})`);
}

function swapToDemo(conn, quality, emit, errMsg) {
  if (active && active.conn === conn && active.kind === 'live') stopActive();
  startDemoSource(
    conn,
    quality,
    emit,
    'sensor-error',
    'The sensor reported an error and stopped. Demo signals continue — the door still opens.'
  );
  console.warn('[threshold] swapped to demo after sensor error:', errMsg);
}

function startSource(conn, hello) {
  stopActive();
  const mode = hello.mode === 'live' ? 'live' : 'demo';
  const quality = normalizeQuality(hello.quality);
  const emit = (m) => send(conn, m);

  if (mode === 'live' && sdkAvailable && config.apiKey) {
    try {
      const bridge = new SdkBridge({ apiKey: config.apiKey, metricNames: config.metrics });
      bridge.onFatal = (errMsg) => swapToDemo(conn, quality, emit, errMsg);
      bridge.start(quality, emit);
      active = { kind: 'live', source: bridge, conn };
      send(conn, {
        t: 'hello',
        source: 'live',
        reason: null,
        sdkVersion: bridge.version,
        quality,
        telemetry: false,
      });
      console.log(`[threshold] source=live (SmartSpectra ${bridge.version ?? '?'})`);
      return;
    } catch (err) {
      console.warn('[threshold] live SDK failed to start:', err?.message ?? err);
      startDemoSource(
        conn,
        quality,
        emit,
        'sensor-unavailable',
        'The sensor could not start. Demo signals continue — the door still opens.'
      );
      return;
    }
  }

  let reason = 'demo-requested';
  let notice = null;
  if (mode === 'live') {
    if (!sdkAvailable) {
      reason = 'sdk-unavailable';
      notice = `SmartSpectra SDK unavailable (${sdkLoadError?.message ?? 'unknown error'}). Demo signals continue.`;
    } else if (!config.apiKey) {
      reason = 'no-api-key';
      notice = 'No SmartSpectra API key configured — running the simulated demo signal. Add one in threshold.config.json for live sensing.';
    }
  }
  startDemoSource(conn, quality, emit, reason, notice);
}

wss.on('connection', (conn) => {
  conn.isAlive = true;
  let helloed = false;
  const helloTimer = setTimeout(() => {
    if (!helloed) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
  }, 10000);

  conn.on('message', (data, isBinary) => {
    if (isBinary) {
      const a = active;
      if (a && a.kind === 'live' && a.conn === conn) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length >= 6) {
          const w = buf.readUInt16LE(0);
          const h = buf.readUInt16LE(2);
          const payload = buf.subarray(6);
          if (w > 0 && h > 0 && payload.length === w * h * 3) {
            a.source.frame(payload, w, h);
          }
        }
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'hello') {
      helloed = true;
      clearTimeout(helloTimer);
      startSource(conn, msg);
    } else if (msg.t === 'ping') {
      send(conn, { t: 'pong', t0: msg.t0, t1: Date.now() });
    } else if (msg.t === 'bye') {
      if (active && active.conn === conn) stopActive();
    } else if (msg.t === 'sim') {
      const a = active;
      if (a && a.kind === 'demo' && a.conn === conn) a.source.control(msg);
    }
  });

  conn.on('close', () => {
    clearTimeout(helloTimer);
    if (active && active.conn === conn) stopActive();
  });
  conn.on('pong', () => {
    conn.isAlive = true;
  });
  conn.on('error', () => {
    /* ignore */
  });
});

// Heartbeat: drop dead sockets.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30000);
heartbeat.unref();

server.listen(config.port, () => {
  const sensorLine = !sdkAvailable
    ? 'demo sim only (SDK failed to load)'
    : config.apiKey
      ? 'SmartSpectra LIVE — API key configured'
      : 'demo sim — no API key (add one in threshold.config.json)';
  console.log('');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   T H R E S H O L D');
  console.log('   a three-minute doorway between work and home');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   game     → http://localhost:${config.port}`);
  console.log(`   sensor   → ${sensorLine}`);
  console.log('   telemetry → OFF');
  console.log('   privacy  → frames stay in memory; nothing stored');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

function shutdown() {
  stopActive();
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
  }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
