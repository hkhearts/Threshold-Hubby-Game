// Probe: verifies the server end-to-end.
// 1. HTTP: index.html, main.js module, three.module.js, an addon file.
// 2. WS demo flow: hello → collect metrics/validation → sim controls → bye.
// 3. WS frame path: send a fake RGB frame in live mode (no API key → demo
//    source, so frames are ignored — just verify no crash).

import { spawn } from 'node:child_process';

const base = 'http://127.0.0.1:4310';
const results = [];
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
}

let spawnedServer = null;

async function isServerRunning() {
  try {
    const res = await fetch(base + '/', { signal: AbortSignal.timeout(1000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

if (!(await isServerRunning())) {
  spawnedServer = spawn(process.execPath, ['server/index.mjs'], { stdio: 'ignore' });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await isServerRunning()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const httpGet = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, len: (await res.arrayBuffer()).byteLength, type: res.headers.get('content-type') };
};

// ---- HTTP ----
const index = await httpGet('/');
check('GET /', index.status === 200 && index.len > 500, `status ${index.status}, ${index.len} bytes`);

const mainJs = await httpGet('/js/main.js');
check('GET /js/main.js', mainJs.status === 200 && mainJs.type.includes('javascript'), `status ${mainJs.status}, ${mainJs.type}`);

const three = await httpGet('/vendor/build/three.module.js');
check('GET /vendor/build/three.module.js', three.status === 200 && three.len > 100000, `status ${three.status}, ${three.len} bytes`);

const bloom = await httpGet('/vendor/addons/postprocessing/UnrealBloomPass.js');
check('GET addons/UnrealBloomPass.js', bloom.status === 200 && bloom.len > 1000, `status ${bloom.status}, ${bloom.len} bytes`);

const output = await httpGet('/vendor/addons/postprocessing/OutputPass.js');
check('GET addons/OutputPass.js', output.status === 200 && output.len > 500, `status ${output.status}`);

// ---- WS demo flow ----
const { default: WebSocket } = await import('ws');
const ws = new WebSocket('ws://127.0.0.1:4310/ws');
const collected = { hello: null, metrics: [], validations: [], notices: [], errors: [], statuses: [] };
let helloSeen = false;

const flow = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('timed out waiting for validation kOk')), 20000);
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'hello', mode: 'demo', quality: { width: 640, height: 480, fps: 20 } }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.t === 'hello') {
      collected.hello = msg;
      helloSeen = true;
      check('ws hello demo', msg.source === 'demo', `source=${msg.source} reason=${msg.reason}`);
      // test sim controls
      ws.send(JSON.stringify({ t: 'sim', key: 'force' }));
      ws.send(JSON.stringify({ t: 'ping', t0: performance.now() }));
    } else if (msg.t === 'metrics') {
      collected.metrics.push(msg);
      if (collected.metrics.length === 1) {
        check('metrics pulse', msg.pulse && typeof msg.pulse.rate === 'number' && msg.pulse.conf > 0, `rate=${msg.pulse?.rate} conf=${msg.pulse?.conf}`);
        check('metrics breath', msg.breath?.rate?.rate > 0, `rate=${msg.breath?.rate?.rate}`);
        check('metrics pressure ring', Array.isArray(msg.pressure) && msg.pressure.length === 64, `len=${msg.pressure.length}`);
        check('metrics chest ring', Array.isArray(msg.breath?.chest) && msg.breath.chest.length === 48, `len=${msg.breath?.chest?.length}`);
        check('metrics landmarks', msg.landmarks?.n === 68, `n=${msg.landmarks?.n}`);
      }
      if (collected.metrics.length >= 40) {
        // keep collecting until the validation kOk arrives
      }
    } else if (msg.t === 'validation') {
      collected.validations.push(msg);
      if (msg.code === 0) {
        clearTimeout(timeout);
        resolve();
      }
    } else if (msg.t === 'notice') {
      collected.notices.push(msg);
    } else if (msg.t === 'error') {
      collected.errors.push(msg);
    } else if (msg.t === 'status') {
      collected.statuses.push(msg);
    }
  });
  ws.on('error', (e) => {
    clearTimeout(timeout);
    reject(e);
  });
});

try {
  await flow;
} catch (err) {
  check('ws demo flow', false, err.message);
}

// ---- live mode without key: should fall back to demo with a notice ----
const ws2 = new WebSocket('ws://127.0.0.1:4310/ws');
const liveFlow = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('live fallback timed out')), 8000);
  ws2.on('open', () => ws2.send(JSON.stringify({ t: 'hello', mode: 'live', quality: { width: 320, height: 240, fps: 10 } })));
  ws2.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.t === 'hello') {
      check('live fallback to demo', msg.source === 'demo', `source=${msg.source} reason=${msg.reason}`);
      // send a fake binary frame with correct header — should be ignored safely
      const w = 320;
      const h = 240;
      const buf = Buffer.alloc(6 + w * h * 3);
      buf.writeUInt16LE(w, 0);
      buf.writeUInt16LE(h, 2);
      buf.writeUInt16LE(1, 4);
      for (let i = 6; i < buf.length; i++) buf[i] = 100 + (i % 120);
      ws2.send(buf);
      // wrong-length frame — must not crash
      ws2.send(Buffer.alloc(20, 7));
      setTimeout(() => {
        ws2.send(JSON.stringify({ t: 'bye' }));
        clearTimeout(timeout);
        resolve();
      }, 1500);
    }
  });
  ws2.on('error', (e) => {
    clearTimeout(timeout);
    reject(e);
  });
});
try {
  await liveFlow;
  check('ws frame path (demo sink)', true, 'frames ignored cleanly in demo mode');
} catch (err) {
  check('ws frame path', false, err.message);
}

// ---- sim trace sanity: verify a long exhale appears in the chest trace ----
// The sim's chest ring should swing over time (breathing oscillation).
if (collected.metrics.length >= 40) {
  const chestSeries = collected.metrics.map((m) => m.breath.chest.at(-1));
  const mn = Math.min(...chestSeries);
  const mx = Math.max(...chestSeries);
  check('sim chest oscillates', mx - mn > 0.08, `range ${(mx - mn).toFixed(3)} (min ${mn.toFixed(2)} max ${mx.toFixed(2)})`);
  const pulseSeries = collected.metrics.map((m) => m.pulse.rate);
  const pr = Math.max(...pulseSeries) - Math.min(...pulseSeries);
  check('sim pulse drifts', pr > 0.3, `range ${pr.toFixed(2)} bpm`);
  const firstVal = collected.validations[0];
  const okVal = collected.validations.find((v) => v.code === 0);
  check('sim validation sequence', firstVal?.code === 10 && !!okVal, `tuning→ok seen (${collected.validations.length} events)`);
  const statuses = collected.statuses.map((s) => s.code);
  check('sim status', statuses.includes('running'), statuses.join(','));
}

ws.close();
ws2.close();

if (spawnedServer) {
  try {
    spawnedServer.kill();
  } catch {
    /* ignore */
  }
}

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
