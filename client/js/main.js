// THRESHOLD — game orchestration.
//
// States: title → consent → intro (the walk) → wake (pulse) → turn (three
// exhales / three locks) → cross (door opens, camera enters) → home → farewell.
// Every visual, camera move, sound cue and hint is driven by the live signal
// model; the ritual can never trap the player — the door always opens.

import * as THREE from 'three';
import { createEngine } from './gfx/renderer.js';
import { buildHallway } from './gfx/hallway.js';
import { buildRoom } from './gfx/room.js';
import { buildDust, buildShaft } from './gfx/fx.js';
import { CameraDirector } from './gfx/cam.js';
import { FPSController } from './gfx/fps.js';
import { buildHands } from './gfx/hands.js';
import { buildGirl } from './gfx/girl.js';
import { buildInteractables, LOVE_STORIES } from './game/interactables.js';
import { MiniGameManager } from './game/minigames.js';
import { Signals } from './signals.js';
import { LockLogic } from './game/locks.js';
import { introWalk, INTRO_EVENTS, INTRO_DURATION, crossCutscene, CROSS_DURATION } from './game/cutscenes.js';
import { AudioEngine } from './audio.js';
import { Bridge, QUALITIES } from './net.js';
import { UI } from './ui/ui.js';
import { Silhouette } from './ui/silhouettes.js';
import { saveStill, endAndErase } from './ui/privacy.js';

const $ = (id) => document.getElementById(id);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

// ---- settings ---------------------------------------------------------------

const DEFAULTS = { audio: true, motion: false, silhouette: false, bloom: 'high', quality: 'HD' };
function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('threshold.settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem('threshold.settings', JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
const settings = loadSettings();

// ---- engine ------------------------------------------------------------------

const engine = createEngine($('scene'));
const hallway = buildHallway(engine.scene);
const room = buildRoom(engine.scene);
const girl = buildGirl(engine.scene);
const interactables = buildInteractables(engine.scene);
const dust = buildDust(engine.scene);
const shaft = buildShaft(engine.scene);
const director = new CameraDirector(engine.camera);
const signals = new Signals();
const audio = new AudioEngine();
const video = $('cam');
const bridge = new Bridge({ video, signals });
const ui = new UI();
const silhouette = new Silhouette(video);
const locks = new LockLogic();
const minigames = new MiniGameManager(engine.scene, audio, locks, ui);
const fps = new FPSController(engine.camera, engine.renderer.domElement);
fps.enabled = false;
const hands = buildHands(engine.camera);
hands.setVisible(false);

let activeStoryItem = null;
let activeMinigame = null;

// ---- game state ---------------------------------------------------------------

const game = {
  state: 'title',
  prevState: null,
  t: 0,
  introT: 0,
  introIdx: 0,
  wakeT: 0,
  wakeAcc: 0,
  turnT: 0,
  crossT: 0,
  openHow: null,
  lockFlash: [0, 0, 0],
  crossCues: {},
  mercyHinted: false,
  valNotOkSince: 0,
  stayMode: false,
  simAuto: true,
  roomOpenTarget: 0,
};

document.body.classList.toggle('reduced', settings.motion);
director.setReduced(settings.motion);
engine.bloom.strength = settings.bloom === 'low' ? 0.12 : 0.22;

// ---- wiring --------------------------------------------------------------------

signals.on('beat', (intensity) => {
  minigames.handlePulseBeat();
  if (['wake', 'turn', 'cross', 'home'].includes(game.state)) audio.pulseBeat(intensity);
});

signals.on('phase-start', (e) => {
  locks.onPhaseStart(e);
  minigames.handleBreathEvent(e.phase, e.dur);
});
signals.on('long-exhale', () => {
  locks.onLongExhale();
  minigames.handleBreathEvent('exhale');
});
signals.on('cycle', () => locks.onCycle());
signals.on('calibrated', () => {
  locks.onCalibrationDone();
});

signals.on('validation', (v) => {
  if (game.state === 'title' || game.state === 'consent') return;
  if (!v.ok) {
    game.valNotOkSince = performance.now();
    ui.hint(v.hint || v.name, { verbatim: true });
  } else {
    ui.clearHint();
  }
});

signals.on('notice', (text) => {
  if (game.state !== 'title' && game.state !== 'consent') ui.hint(text, { hold: 8000 });
});

locks.onLock = (n) => {
  game.lockFlash[n - 1] = 1;
  audio.lockClick(n - 1);
  ui.narration(['One.', 'Two.', 'Three.'][n - 1], { fast: true, hold: 1800 });
  const positions = [
    [0, 1.565, 2.25],
    [0, 1.55, 2.1],
    [0, 1.535, 1.98],
  ];
  if (!fps.enabled && n <= 3) {
    director.setIdle({ pos: positions[n - 1], look: [0, 1.5, 0], sway: 0.016 });
  }
};

locks.onCalibrated = () => {
  if (game.state === 'turn') {
    ui.hint('Three long exhales. The locks are listening.', { hold: 8000 });
  }
};

locks.onFallback = () => {
  ui.hint('The sensor can’t read your breath cleanly. Three slow, full breaths will do.', { hold: 8000 });
};

locks.onOpen = (how) => startCross(how);

bridge.onHello = (msg) => {
  game.helloMsg = msg;
};

bridge.onReconnect = () => {
  ui.hint('Reconnecting to the sensor…', { hold: 3000 });
};

// ---- state helpers ---------------------------------------------------------------

function startIntro() {
  hands.setVisible(false);
  game.state = 'intro';
  game.prevState = 'intro';
  game.introT = 0;
  game.introIdx = 0;
  game.helloNoticeShown = false;
  ui.screen(null);
  ui.showHud(true);
  ui.actLabel('Act 0 — The Walk');
  ui.clearNarration();
  ui.clearHint();
  ui.letterbox(true);
  $('screen-skip').classList.remove('hidden');
  introWalk(director);
}

function endIntro() {
  ui.letterbox(false);
  $('screen-skip').classList.add('hidden');
  game.state = 'wake';
  game.prevState = 'wake';
  game.wakeT = 0;
  game.wakeAcc = 0;
  game.valNotOkSince = 0;
  ui.actLabel('Act I — Explore & Wake');
  ui.narration('The keyhole is learning your pulse.', { hold: 7000 });
  if (signals.source === 'demo') {
    ui.hint('Explore with [WASD + Mouse]. Examine memories [E] or play mini-games to reach her.', { hold: 9000 });
  } else {
    ui.hint('Explore with [WASD + Mouse]. Sit still when ready for the keyhole to read your pulse.', { hold: 9000 });
  }
  director.stopTrack();
  director.idle = null;
  fps.setPosition(0, 1.68, 6.2, 0, 0);
  fps.enabled = true;
  hands.setVisible(true);
  ui.setCrosshair(true);
  ui.setControlsHint(true);
  ui.setMemoriesCount(0, LOVE_STORIES.length);
}

function startTurn() {
  game.state = 'turn';
  game.prevState = 'turn';
  game.turnT = 0;
  game.mercyHinted = false;
  locks.reset();
  locks.beginTurn(performance.now());
  ui.actLabel('Act II — Turn');
  ui.showBreathGuide(true);
  ui.narration('Two easy breaths, so the door learns your rhythm.', { hold: 6500 });
  if (signals.source === 'live') {
    ui.hint('Chest-up framing helps the locks hear you. Long exhales will turn the locks.', { hold: 7000 });
  }
  if (!fps.enabled) {
    director.setIdle({ pos: [0, 1.58, 2.4], look: [0, 1.5, 0], sway: 0.022 });
  }
}

function startCross(how) {
  fps.enabled = false;
  hands.setVisible(false);
  ui.setCrosshair(false);
  ui.setControlsHint(false);
  ui.setInteractPrompt(null);
  game.state = 'cross';
  game.prevState = 'cross';
  game.crossT = 0;
  game.openHow = how;
  game.crossCues = {};
  ui.actLabel('Act III — Cross');
  ui.showBreathGuide(false);
  ui.clearNarration();
  ui.clearHint();
  audio.creak();
  crossCutscene(director);
}

function finishCross() {
  game.state = 'home';
  game.prevState = 'home';
  ui.actLabel('Home');
  const mercy = game.openHow === 'mercy';
  $('home-heading').textContent = mercy ? 'You showed up. That counts.' : 'Welcome home.';
  $('home-sub').textContent = mercy
    ? 'No locks turned — and still, here you are. That is allowed.'
    : 'You crossed the threshold. She was waiting for you all along.';
  ui.screen('screen-home');
  director.setIdle({
    pos: [0.0, 1.55, -2.5],
    look: [-0.35, 1.15, -4.8],
    sway: 0.008,
    orbit: settings.motion ? { r: 0, h: 0, speed: 0 } : { r: 0.8, h: 0.05, speed: 0.04 },
  });
}

function forceOpen() {
  if (game.state === 'wake' || game.state === 'turn') {
    locks.open('debug');
  }
}

// ---- begin flows -------------------------------------------------------------------

async function begin(mode) {
  ui.screen(null);
  ui.showHud(true);
  audio.init();
  audio.setEnabled(settings.audio);
  let m = mode;
  if (mode === 'live') {
    try {
      await bridge.startCamera();
    } catch (err) {
      const declined = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      ui.hint(
        declined
          ? 'Camera permission was declined — the door opens for the demo signal instead.'
          : 'No camera found — the door opens for the demo signal instead.',
        { hold: 6000 }
      );
      m = 'demo';
    }
  }
  try {
    localStorage.setItem('threshold.consent', m);
  } catch {
    /* ignore */
  }
  bridge.connect({ mode: m, quality: QUALITIES[settings.quality] ?? QUALITIES.HD });
  ui.fadeTo(true, () => {
    startIntro();
    ui.fadeIn();
  });
}

// ---- UI events -----------------------------------------------------------------------

$('btn-begin').addEventListener('click', () => {
  audio.uiClick();
  ui.screen('screen-consent');
  $('consent-mode-note').classList.add('hidden');
});
$('btn-demo').addEventListener('click', () => {
  audio.uiClick();
  ui.screen('screen-consent');
  const note = $('consent-mode-note');
  note.textContent = 'Demo mode: the signals are simulated, and no camera is used.';
  note.classList.remove('hidden');
});
$('btn-consent-back').addEventListener('click', () => {
  audio.uiClick();
  ui.screen('screen-title');
});
$('btn-consent-yes').addEventListener('click', () => {
  audio.uiClick();
  begin('live');
});
$('btn-consent-demo').addEventListener('click', () => {
  audio.uiClick();
  begin('demo');
});

$('btn-skip').addEventListener('click', () => {
  audio.uiClick();
  game.introT = INTRO_DURATION;
});

$('btn-stay').addEventListener('click', () => {
  audio.uiClick();
  game.stayMode = true;
  ui.screen(null);
  ui.showHud(false);
});
$('btn-save-still').addEventListener('click', () => {
  saveStill({
    composer: engine.composer,
    ui,
    audio,
    onDone: () => {
      ui.screen('screen-home');
      ui.showHud(true);
    },
  });
});
$('btn-erase').addEventListener('click', () => leave());
$('btn-leave').addEventListener('click', () => leave());
$('btn-again').addEventListener('click', () => location.reload());

function leave() {
  audio.uiClick();
  ui.fadeTo(true, () => {
    audio.fadeOut();
    endAndErase({ bridge, ui });
    ui.showHud(false);
    ui.showBreathGuide(false);
    ui.actLabel('');
    game.state = 'farewell';
    game.prevState = 'farewell';
    ui.fadeIn();
  });
}

// HUD toggles
$('btn-debug').addEventListener('click', () => {
  ui.toggleDebug();
  $('btn-debug').classList.toggle('active', ui.debugVisible());
});
$('btn-silhouette').addEventListener('click', () => {
  const on = silhouette.toggle();
  $('btn-silhouette').classList.toggle('active', on);
});
$('btn-audio').addEventListener('click', () => {
  settings.audio = !settings.audio;
  audio.setEnabled(settings.audio);
  $('btn-audio').classList.toggle('active', !settings.audio);
  saveSettings(settings);
});
$('btn-settings').addEventListener('click', () => {
  audio.uiClick();
  $('set-audio').checked = settings.audio;
  $('set-motion').checked = settings.motion;
  $('set-silhouette').checked = settings.silhouette;
  $('set-bloom').value = settings.bloom;
  $('set-quality').value = settings.quality;
  ui.screen('settings');
});
$('btn-settings-close').addEventListener('click', () => {
  audio.uiClick();
  ui.screen(null);
});
$('set-audio').addEventListener('change', (e) => {
  settings.audio = e.target.checked;
  audio.setEnabled(settings.audio);
  saveSettings(settings);
});
$('set-motion').addEventListener('change', (e) => {
  settings.motion = e.target.checked;
  document.body.classList.toggle('reduced', settings.motion);
  director.setReduced(settings.motion);
  saveSettings(settings);
});
$('set-silhouette').addEventListener('change', (e) => {
  settings.silhouette = e.target.checked;
  if (e.target.checked) silhouette.show(false);
  else silhouette.hide();
  saveSettings(settings);
});
$('set-bloom').addEventListener('change', (e) => {
  settings.bloom = e.target.value;
  engine.bloom.strength = settings.bloom === 'low' ? 0.12 : 0.22;
  saveSettings(settings);
});
$('set-quality').addEventListener('change', (e) => {
  settings.quality = e.target.value;
  saveSettings(settings);
});

// keyboard
window.addEventListener('keydown', (e) => {
  if (game.stayMode) {
    game.stayMode = false;
    ui.screen('screen-home');
    ui.showHud(true);
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'e') {
    hands.triggerReach();
    if (ui.isStoryOpen()) {
      ui.closeStory();
      return;
    }
    if (activeStoryItem) {
      activeStoryItem.unlocked = true;
      audio.uiClick();
      ui.showStory(activeStoryItem.title, activeStoryItem.text, () => {});
      const unlockedCount = interactables.objects.filter((o) => o.story.unlocked).length;
      ui.setMemoriesCount(unlockedCount, LOVE_STORIES.length);
      if (unlockedCount === LOVE_STORIES.length) {
        ui.hint('All 4 memories discovered! Walk to the portal and let your breath open the door.', { hold: 8000 });
      }
      return;
    }
    if (activeMinigame) {
      audio.uiClick();
      activeMinigame.action();
      return;
    }
  } else if (k === 'd') {
    ui.toggleDebug();
    $('btn-debug').classList.toggle('active', ui.debugVisible());
  } else if (k === 's' && game.state !== 'title' && game.state !== 'consent') {
    const on = silhouette.toggle();
    $('btn-silhouette').classList.toggle('active', on);
  } else if (k === 'm') {
    settings.audio = !settings.audio;
    audio.setEnabled(settings.audio);
    $('btn-audio').classList.toggle('active', !settings.audio);
    saveSettings(settings);
  } else if (e.code === 'Space' && signals.source === 'demo' && (game.state === 'turn' || game.state === 'wake')) {
    e.preventDefault();
    hands.triggerStrike();
    if (!e.repeat) bridge.sendSim({ key: 'space', down: true });
  } else if (e.key === 'Escape') {
    if (ui.isStoryOpen()) {
      ui.closeStory();
      return;
    }
    ui.toggleDebug(false);
    if (!ui.screens.settings.classList.contains('hidden')) ui.screen(null);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && signals.source === 'demo') {
    bridge.sendSim({ key: 'space', down: false });
  }
});

// ---- per-frame visuals -------------------------------------------------------------------

function visForState(t) {
  const wakeP = clamp01(game.wakeAcc);
  let crack;
  let keyBase;
  switch (game.state) {
    case 'title':
      crack = 0.45 + 0.15 * Math.sin(t * 1.4);
      keyBase = 0.38 + 0.18 * Math.sin(t * 1.6);
      break;
    case 'consent':
      crack = 0.45;
      keyBase = 0.38;
      break;
    case 'intro':
      crack = 0.14 + 0.16 * clamp01(game.introT / INTRO_DURATION);
      keyBase = 0.12;
      break;
    case 'wake':
      crack = 0.22 + 0.35 * wakeP;
      keyBase = 0.22 + 0.38 * clamp01(signals.pulse.conf / 100) + 0.2 * wakeP;
      break;
    case 'turn':
      crack = 0.6 + 0.16 * clamp01(signals.breath.level);
      keyBase = 0.42 + 0.2 * clamp01(signals.pulse.conf / 100);
      break;
    case 'cross':
      crack = 1;
      keyBase = 0.55;
      break;
    default:
      crack = 1;
      keyBase = 0.5;
      break;
  }
  const keyPulse = signals.pulse.flash * (signals.pulse.ok ? 1 : 0.55);
  return { crack, keyBase, keyPulse };
}

// ---- state update --------------------------------------------------------------------------

function gameUpdate(t, dt, now) {
  const wakeP = clamp01(game.wakeAcc);

  switch (game.state) {
    case 'title':
      if (game.prevState !== 'title') {
        game.prevState = 'title';
        director.setIdle({ pos: [0.5, 1.72, 7.8], look: [0, 1.55, 0], sway: 0.032 });
        ui.screen('screen-title');
        ui.showHud(false);
      }
      break;

    case 'intro': {
      game.introT += dt;
      const evs = INTRO_EVENTS;
      while (game.introIdx < evs.length && evs[game.introIdx][0] <= game.introT) {
        const [, action] = evs[game.introIdx];
        if (action.letterbox) ui.letterbox(true);
        if (action.narration) ui.narration(action.narration, { hold: 5200 });
        game.introIdx += 1;
      }
      if (game.introT >= INTRO_DURATION) endIntro();
      break;
    }

    case 'wake': {
      game.wakeT += dt;
      if (signals.pulse.ok) game.wakeAcc += dt / 10;
      if (game.wakeT > 45 && wakeP < 0.15) {
        ui.narration('The keyhole hears only the house. That is fine — your breath is the key.', { hold: 6000 });
        startTurn();
      } else if (wakeP >= 1) {
        startTurn();
      }
      break;
    }

    case 'turn': {
      locks.update(now);
      const elapsed = now - (locks.turnStart ?? now);
      if (!game.mercyHinted && elapsed > 150000) {
        game.mercyHinted = true;
        ui.hint('No rush. The door will open when you do.', { hold: 6000 });
      }
      if (locks.fallback && locks.slowCycles > 0 && locks.done < 3) {
        ui.hint(`Slow breaths: ${Math.min(locks.done + 1, 3)} of 3.`, { hold: 4000 });
      }
      break;
    }

    case 'cross': {
      game.crossT += dt;
      const cues = game.crossCues;
      if (!cues.thud && game.crossT > 2.3) {
        cues.thud = true;
        audio.doorThud();
      }
      if (!cues.chord && game.crossT > 3.5) {
        cues.chord = true;
        if (game.openHow === 'mercy') audio.mercyChord();
        else audio.homeChord();
      }
      if (!cues.bell && game.crossT > 4.6) {
        cues.bell = true;
        audio.bell();
        ui.narration(game.openHow === 'mercy' ? 'You showed up. That counts.' : 'Welcome home.', { hold: 5200 });
      }
      if (game.crossT >= CROSS_DURATION + 1) finishCross();
      break;
    }

    case 'home':
      ui.showHud(true);
      break;

    default:
      break;
  }

  // door opening (cross) — the only path that opens the door
  let doorOpen = 0;
  if (game.state === 'cross') doorOpen = easeInOut(clamp01(game.crossT / 2.6));
  if (game.state === 'home' || game.state === 'farewell') doorOpen = 1;

  // room light-up follows the door
  const roomTarget =
    game.state === 'cross'
      ? clamp01((game.crossT - 1.4) / 4)
      : game.state === 'home' || game.state === 'farewell'
        ? 1
        : 0;
  game.roomOpenTarget = roomTarget;

  // validation-driven silhouette
  const val = signals.validation;
  if (!val.ok && game.state !== 'title' && game.state !== 'consent') {
    if (now - game.valNotOkSince > 3500 && !silhouette._shown) {
      silhouette.show(true);
      silhouette.setText(val.hint || 'check your framing');
    }
  } else if (silhouette._auto) {
    silhouette.hide();
  }

  // breath guide labels live in the turn
  ui.showBreathGuide(game.state === 'turn');
  if (game.state === 'turn') {
    ui.drawBreathGuide(signals.phase, settings.motion);
  }

  // first-person exploration & interaction checks
  if (fps.enabled && !ui.isStoryOpen()) {
    fps.update(dt);
    const p = fps.camera.position;
    const isMoving = fps.velocity.lengthSq() > 0.04;
    hands.setVisible(true);
    hands.update(t, dt, { moving: isMoving, breath: signals.breath.level });

    // 1. Minigames proximity
    activeMinigame = minigames.checkInteractions(p);

    // 2. Story pedestals proximity
    activeStoryItem = null;
    if (!activeMinigame) {
      let closestStory = null;
      let closestDist = 2.4;
      for (const obj of interactables.objects) {
        const d = p.distanceTo(new THREE.Vector3(...obj.story.pos));
        if (d < closestDist) {
          closestDist = d;
          closestStory = obj.story;
        }
      }
      activeStoryItem = closestStory;
    }

    // 3. Portal door keyhole proximity
    const doorDist = p.distanceTo(new THREE.Vector3(0, 1.5, 0));
    const isNearDoor = !activeMinigame && !activeStoryItem && doorDist < 2.5;

    // Update prompt
    if (activeMinigame) {
      ui.setInteractPrompt(activeMinigame.prompt);
    } else if (activeStoryItem) {
      ui.setInteractPrompt(activeStoryItem.prompt);
    } else if (isNearDoor) {
      if (signals.source === 'demo') {
        ui.setInteractPrompt('Hold SPACE to exhale & turn locks');
      } else {
        ui.setInteractPrompt('Breathe deeply to unlock portal');
      }
    } else {
      ui.setInteractPrompt(null);
    }

    if (ui.crosshair) {
      ui.crosshair.classList.toggle('active', !!(activeMinigame || activeStoryItem || isNearDoor));
    }
  } else if (!fps.enabled) {
    hands.setVisible(false);
    ui.setInteractPrompt(null);
    if (ui.crosshair) ui.crosshair.classList.remove('active');
  }

  // visual state to the hallway
  const v = visForState(t);
  hallway.update(t, dt, {
    doorOpen,
    locks: locks.lockProgress,
    lockActive: locks.fallback ? -1 : locks.done < 3 ? locks.done : -1,
    lockFlash: game.lockFlash,
    keyPulse: v.keyPulse,
    keyBase: v.keyBase,
    crack: v.crack,
    breath: signals.breath.level,
  });
  game.lockFlash = [0, 0, 0];
  room.update(t, dt, roomTarget);
  girl.update(t, dt);
  interactables.update(t, dt);
  minigames.update(t, dt);
  dust.update(t, dt, v.crack * 0.9);
  shaft.update(t, dt, v.crack);

  // camera
  if (!fps.enabled) {
    const breathOffset = settings.motion ? 0 : (signals.breath.level - 0.5) * 1.6;
    director.update(t, dt, {
      breath: breathOffset,
      fovAdd: game.state === 'wake' ? signals.pulse.flash * 0.7 : 0,
    });
  }

  // audio follow
  audio.breath(dt, signals.breath.level, signals.breath.ok);

  // silhouette + debug
  silhouette.draw();
  updateDebug(now);
}

let lastDebugAt = 0;
function updateDebug(now) {
  if (!ui.debugVisible()) return;
  if (now - lastDebugAt < 250) return;
  lastDebugAt = now;

  const p = signals.pulse;
  const b = signals.breath;
  const v = signals.validation;
  const elapsed = locks.turnStart ? Math.max(0, (now - locks.turnStart) / 1000) : 0;
  const mercy = Math.max(0, 180 - elapsed);
  const mm = Math.floor(mercy / 60);
  const ss = String(Math.floor(mercy % 60)).padStart(2, '0');
  const reason = signals.source === 'demo' ? ` · ${signals.reason ?? 'demo'}` : '';

  const lines = [
    `source      ${signals.source}${reason}`,
    `sensor      ${signals.sdkStatus}`,
    `pulse       ${p.rate ? p.rate.toFixed(1) + ' bpm' : '—'} · conf ${p.conf.toFixed(0)} ${p.ok ? '✓' : ''}`,
    `breath      ${b.rate ? b.rate.toFixed(1) + ' brpm' : '—'} · conf ${b.conf.toFixed(0)} ${b.ok ? '✓' : ''}`,
    `phase       ${signals.phase.name} · ${(signals.phase.dur / 1000).toFixed(1)}s · ${Math.round(signals.phase.progress * 100)}%`,
    `locks       ${locks.done}/3 · fallback ${locks.fallback ? 'yes' : 'no'} · cycles ${locks.slowCycles}`,
    `calibrated  ${signals.calibrated ? 'yes' : 'no'} · ${game.state} · elapsed ${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`,
    `mercy in    ${mm}:${ss}`,
    `validation  ${v.ok ? 'ok' : `${v.name}${v.hint ? ' — ' + v.hint : ''}`}`,
    `ws          ${bridge.latency === null ? '—' : bridge.latency.toFixed(1) + ' ms'} · frames ${signals.stats.framesIn} · dropped ${bridge.droppedFrames}`,
    `quality     ${settings.quality} (${bridge.quality.width}×${bridge.quality.height}@${bridge.quality.fps})`,
  ];
  ui.setDebugText(lines.join('\n'));
  ui.drawSpark(signals.chestHistory);

  if (signals.source === 'demo') {
    ui.setDebugActions(`
      <button id="dbg-auto">auto-run: ${game.simAuto ? 'ON' : 'OFF'}</button>
      <button id="dbg-force">force long exhale</button>
      <button id="dbg-open">open now (debug)</button>
      <span style="color:#5d6a83;align-self:center">hold SPACE = exhale</span>
    `);
    const autoBtn = $('dbg-auto');
    const forceBtn = $('dbg-force');
    const openBtn = $('dbg-open');
    if (autoBtn && !autoBtn._wired) {
      autoBtn._wired = true;
      autoBtn.addEventListener('click', () => {
        game.simAuto = !game.simAuto;
        bridge.sendSim({ key: 'auto', on: game.simAuto });
      });
    }
    if (forceBtn && !forceBtn._wired) {
      forceBtn._wired = true;
      forceBtn.addEventListener('click', () => bridge.sendSim({ key: 'force' }));
    }
    if (openBtn && !openBtn._wired) {
      openBtn._wired = true;
      openBtn.addEventListener('click', () => forceOpen());
    }
  } else {
    ui.setDebugActions(`
      <button id="dbg-open">open now (debug)</button>
    `);
    const openBtn = $('dbg-open');
    if (openBtn && !openBtn._wired) {
      openBtn._wired = true;
      openBtn.addEventListener('click', () => forceOpen());
    }
  }
}

// ---- main loop ------------------------------------------------------------------------------

let last = performance.now();
engine.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  signals.update(dt, now);
  gameUpdate(t, dt, now);
  engine.composer.render();
});

// ---- boot ------------------------------------------------------------------------------------

ui.screen('screen-title');
document.body.classList.remove('loading');
