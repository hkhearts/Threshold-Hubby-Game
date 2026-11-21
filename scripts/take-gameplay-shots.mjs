// Capture screenshots of title, first-person exploration, story modal, and the girl in the sanctuary
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const PORT = 9444;
const TEMP_USER_DATA = path.join(os.tmpdir(), `chrome-shots-${Date.now()}`);

console.log('Launching headless Chrome for screenshots...');
const chromeProc = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,720',
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
  console.error('FAIL: Could not connect to Chrome endpoint');
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

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
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
  return res.result?.value;
}

async function snap(filename) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filename, Buffer.from(data, 'base64'));
  console.log(`Saved screenshot: ${filename}`);
}

await send('Page.enable');
await send('Runtime.enable');

console.log('Navigating to http://localhost:4310/...');
await send('Page.navigate', { url: 'http://localhost:4310/' });
await new Promise((r) => setTimeout(r, 2500));

// Shot 1: Title Screen
await snap('screenshot_title.png');

// Enter demo mode
await evaluate("document.getElementById('btn-demo').click()");
await new Promise((r) => setTimeout(r, 600));
await evaluate("document.getElementById('btn-consent-demo').click()");
await new Promise((r) => setTimeout(r, 2200)); // wait for fade to intro

// Skip walk into Courtyard exploration
await evaluate("document.getElementById('btn-skip').click()");
await new Promise((r) => setTimeout(r, 1200));

// Shot 2: Courtyard First-Person View (WASD, crosshair, memory counter)
await snap('screenshot_explore.png');

// Trigger story modal to preview narrative love story
await evaluate(`
  document.getElementById('story-title').textContent = 'Memory I — The Rain & The Umbrella';
  document.getElementById('story-body').textContent = 'You were standing beneath the bookstore awning, shivering from the autumn rain. I had an umbrella, but honestly, I only wanted an excuse to stand beside you. That afternoon the whole city was grey, but your laugh held the warmth of an entire summer. I knew right then that I would walk through any storm to bring you home.';
  document.getElementById('story-modal').classList.remove('hidden');
`);
await new Promise((r) => setTimeout(r, 600));
await snap('screenshot_story.png');

// Close story modal
await evaluate("document.getElementById('btn-story-close').click()");
await new Promise((r) => setTimeout(r, 600));

// Open debug overlay to trigger door open
await evaluate("document.getElementById('btn-debug').click()");
await new Promise((r) => setTimeout(r, 500));
await evaluate("document.getElementById('dbg-open')?.click()");
await new Promise((r) => setTimeout(r, 300));
await evaluate("document.getElementById('btn-debug').click()"); // close debug

// Wait for cross cutscene to finish and settle on the girl
console.log('Waiting for cross cutscene into room...');
const deadlineHome = Date.now() + 14000;
while (Date.now() < deadlineHome) {
  const homeVis = await evaluate("!document.getElementById('screen-home').classList.contains('hidden')");
  if (homeVis) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 1000));

// Temporarily hide modal overlay to get a clear view of the girl and sanctuary
await evaluate("document.getElementById('screen-home').classList.add('hidden')");
await new Promise((r) => setTimeout(r, 300));
await snap('screenshot_girl.png');

await evaluate("document.getElementById('screen-home').classList.remove('hidden')");
await new Promise((r) => setTimeout(r, 300));
await snap('screenshot_home.png');

console.log('Screenshots complete!');
ws.close();
cleanup();
process.exit(0);
