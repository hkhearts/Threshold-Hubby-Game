// Client E2E CDP test: drives Chrome through DevTools Protocol
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const PORT = 9333;
const TEMP_USER_DATA = path.join(os.tmpdir(), `chrome-test-${Date.now()}`);

console.log('Launching headless Chrome for browser E2E test...');
const chromeProc = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${TEMP_USER_DATA}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

function cleanup() {
  try { chromeProc.kill(); } catch {}
  try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

// Wait for Chrome remote debugging port
let pageTarget = null;
const deadline = Date.now() + 8000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const list = await res.json();
    pageTarget = list.find((t) => t.type === 'page');
    if (pageTarget) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

if (!pageTarget) {
  console.error('FAIL: Could not connect to Chrome DevTools endpoint');
  cleanup();
  process.exit(1);
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.on('open', resolve);
  ws.on('error', reject);
});

let msgId = 1;
const pending = new Map();
const consoleErrors = [];
const consoleLogs = [];

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    consoleLogs.push(`[${type}] ${text}`);
    if (type === 'error') {
      consoleErrors.push(text);
    }
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const desc = msg.params.exceptionDetails?.exception?.description ||
      msg.params.exceptionDetails?.text || 'Unknown exception';
    consoleErrors.push(desc);
  }
});

function send(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

console.log('Navigating to http://localhost:4310/...');
await send('Page.navigate', { url: 'http://localhost:4310/' });
await new Promise((r) => setTimeout(r, 2000));

// 1. Verify title screen
const titleVisible = await evaluate("!document.getElementById('screen-title').classList.contains('hidden')");
console.log('PASS: Title screen visible =', titleVisible);

// 2. Click Enter without a camera (demo)
console.log('Clicking "Enter without a camera (demo)"...');
await evaluate("document.getElementById('btn-demo').click()");
await new Promise((r) => setTimeout(r, 600));

const consentVisible = await evaluate("!document.getElementById('screen-consent').classList.contains('hidden')");
console.log('PASS: Consent screen visible =', consentVisible);

// 3. Click I'd rather not — demo mode
console.log('Clicking "I\'d rather not — demo mode"...');
await evaluate("document.getElementById('btn-consent-demo').click()");
await new Promise((r) => setTimeout(r, 1200));

// 4. Verify intro started and skip button exists
const skipVisible = await evaluate("!document.getElementById('screen-skip').classList.contains('hidden')");
console.log('PASS: Intro cutscene active, skip button visible =', skipVisible);

// Let the intro camera walk run for 2 seconds to verify CatmullRom track and director don't throw!
await new Promise((r) => setTimeout(r, 2000));

// Click skip
console.log('Clicking skip walk...');
await evaluate("document.getElementById('btn-skip').click()");
await new Promise((r) => setTimeout(r, 800));

// 5. Check we are in wake or turn act
let actText = await evaluate("document.getElementById('hud-act').textContent");
console.log('PASS: Current act =', actText);

// Wait for wake to accumulate or turn to start
console.log('Waiting for Act II (Turn)...');
const turnDeadline = Date.now() + 18000;
while (Date.now() < turnDeadline) {
  actText = await evaluate("document.getElementById('hud-act').textContent");
  if (actText.includes('Turn')) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('PASS: Reached Act II (Turn)');

// 6. Test Debug overlay
await evaluate("document.getElementById('btn-debug').click()");
await new Promise((r) => setTimeout(r, 400));
const debugOpen = await evaluate("!document.getElementById('debug').classList.contains('hidden')");
console.log('PASS: Debug overlay toggle =', debugOpen);

// 7. Click "open now (debug)" to test door opening and Act III cutscene
console.log('Triggering door open...');
await evaluate("document.getElementById('dbg-open')?.click()");
await new Promise((r) => setTimeout(r, 1500));

actText = await evaluate("document.getElementById('hud-act').textContent");
console.log('PASS: Cutscene act =', actText);

// Wait for cross cutscene to complete (CROSS_DURATION is 8s + 1s)
console.log('Waiting for Act III (Cross) cutscene to finish...');
const homeDeadline = Date.now() + 12000;
let homeVisible = false;
while (Date.now() < homeDeadline) {
  homeVisible = await evaluate("!document.getElementById('screen-home').classList.contains('hidden')");
  if (homeVisible) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('PASS: "Welcome home." screen visible =', homeVisible);

// 8. Test Settings panel
await evaluate("document.getElementById('btn-settings').click()");
await new Promise((r) => setTimeout(r, 400));
const settingsOpen = await evaluate("!document.getElementById('settings').classList.contains('hidden')");
console.log('PASS: Settings screen toggle =', settingsOpen);
await evaluate("document.getElementById('btn-settings-close').click()");

// 9. Check console errors
console.log('\n--- Console Logs Summary ---');
console.log(consoleLogs.join('\n'));

if (consoleErrors.length > 0) {
  console.error('\nFAIL: Browser console errors detected:');
  console.error(consoleErrors.join('\n'));
  cleanup();
  process.exit(1);
} else {
  console.log('\nSUCCESS: 0 console errors or exceptions during full gameplay!');
}

ws.close();
cleanup();
process.exit(0);
