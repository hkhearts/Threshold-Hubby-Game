// UI layer: screens, narration, hints (SDK hints shown verbatim), the breath
// guide arc, the debug overlay, and the settings panel.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.screenNames = ['screen-title', 'screen-consent', 'screen-home', 'screen-farewell', 'settings'];
    this.screens = {};
    for (const name of this.screenNames) this.screens[name] = $(name);

    this.hud = $('hud');
    this.hudAct = $('hud-act');
    this.narrationEl = $('narration');
    this.narrationLine = $('narration-line');
    this.hintEl = $('hint');
    this.hintText = $('hint-text');
    this.breathGuide = $('breath-guide');
    this.breathCanvas = $('breath-canvas');
    this.breathLabel = $('breath-label');
    this.letterboxEl = $('letterbox');
    this.fadeEl = $('fade');
    this.skipScreen = $('screen-skip');
    this.debugEl = $('debug');
    this.debugLines = $('debug-lines');
    this.debugSpark = $('debug-spark');
    this.debugActions = $('debug-actions');
    this.silhouettePanel = $('silhouette-panel');

    this.crosshair = $('crosshair');
    this.controlsHint = $('controls-hint');
    this.interactPrompt = $('interact-prompt');
    this.interactLabel = $('interact-label');
    this.storyModal = $('story-modal');
    this.storyTitle = $('story-title');
    this.storyBody = $('story-body');
    this.btnStoryClose = $('btn-story-close');
    this.hudMemories = $('hud-memories');

    if (this.btnStoryClose) {
      this.btnStoryClose.addEventListener('click', () => this.closeStory());
    }

    this._narrationTimer = null;
    this._narrationChars = 0;
    this._narrationFull = '';
    this._hintTimer = null;
    this._debounce = {};
    this.onStoryClose = null;
  }

  // ---- first person prompts & story ---------------------------------------

  setInteractPrompt(text) {
    if (!this.interactPrompt) return;
    if (text) {
      this.interactLabel.textContent = text;
      this.interactPrompt.classList.remove('hidden');
    } else {
      this.interactPrompt.classList.add('hidden');
    }
  }

  setCrosshair(show) {
    if (this.crosshair) this.crosshair.classList.toggle('hidden', !show);
  }

  setControlsHint(show) {
    if (this.controlsHint) this.controlsHint.classList.toggle('hidden', !show);
  }

  showStory(title, body, onClose) {
    if (!this.storyModal) return;
    this.storyTitle.textContent = title;
    this.storyBody.textContent = body;
    this.storyModal.classList.remove('hidden');
    this.onStoryClose = onClose;
  }

  closeStory() {
    if (!this.storyModal || this.storyModal.classList.contains('hidden')) return;
    this.storyModal.classList.add('hidden');
    if (this.onStoryClose) {
      const cb = this.onStoryClose;
      this.onStoryClose = null;
      cb();
    }
  }

  isStoryOpen() {
    return this.storyModal && !this.storyModal.classList.contains('hidden');
  }

  setMemoriesCount(count, total = 4) {
    if (this.hudMemories) {
      this.hudMemories.textContent = `✦ Memories: ${count} / ${total}`;
    }
  }

  // ---- screens ------------------------------------------------------------

  screen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      if (!el) continue;
      el.classList.toggle('hidden', key !== name);
    }
  }

  showHud(v) {
    this.hud.classList.toggle('hidden', !v);
  }

  actLabel(text) {
    this.hudAct.textContent = text;
  }

  // ---- narration (typewriter) -----------------------------------------------

  narration(text, opts = {}) {
    if (this._narrationTimer) clearInterval(this._narrationTimer);
    this._narrationFull = text;
    this._narrationChars = 0;
    this.narrationEl.classList.remove('hidden');
    this.narrationLine.classList.add('show');
    this.narrationLine.innerHTML = '<span class="caret"></span>';
    const speed = opts.fast ? 8 : 26;
    this._narrationTimer = setInterval(() => {
      this._narrationChars += 1;
      this.narrationLine.innerHTML =
        this._narrationFull.slice(0, this._narrationChars)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;') +
        '<span class="caret"></span>';
      if (this._narrationChars >= this._narrationFull.length) {
        clearInterval(this._narrationTimer);
        this._narrationTimer = null;
        if (opts.hold) {
          this._narrationTimer = setTimeout(() => this.clearNarration(), opts.hold);
        }
      }
    }, speed);
  }

  clearNarration() {
    if (this._narrationTimer) {
      clearInterval(this._narrationTimer);
      clearTimeout(this._narrationTimer);
      this._narrationTimer = null;
    }
    this.narrationLine.classList.remove('show');
    this.narrationEl.classList.add('hidden');
    this.narrationLine.textContent = '';
  }

  // ---- hints -----------------------------------------------------------------

  hint(text, opts = {}) {
    if (this._hintTimer) clearTimeout(this._hintTimer);
    this.hintEl.classList.remove('hidden');
    this.hintText.classList.toggle('verbatim', !!opts.verbatim);
    this.hintText.textContent = text;
    this.hintText.classList.add('show');
    if (opts.hold) {
      this._hintTimer = setTimeout(() => this.clearHint(), opts.hold);
    }
  }

  clearHint() {
    if (this._hintTimer) clearTimeout(this._hintTimer);
    this.hintText.classList.remove('show');
    this.hintEl.classList.add('hidden');
  }

  // ---- breath guide -----------------------------------------------------------

  showBreathGuide(v) {
    this.breathGuide.classList.toggle('hidden', !v);
  }

  drawBreathGuide(phase, reduced) {
    const c = this.breathCanvas;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2;
    const cy = c.height / 2 + 14;
    const r = 44;
    const a0 = Math.PI * 0.78;
    const a1 = Math.PI * (2 - 0.78);

    g.lineCap = 'round';

    // track
    g.strokeStyle = 'rgba(217, 145, 65, 0.25)';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();

    // progress
    const name = phase?.name ?? 'idle';
    const prog = Math.min(1, Math.max(0, phase?.progress ?? 0));
    const sweep = name === 'idle' ? 0.02 : 0.04 + prog * 0.92;
    if (sweep > 0.03) {
      const end = Math.min(a1, a0 + (a1 - a0) * sweep);
      g.strokeStyle = name === 'exhale' ? '#d97d2e' : '#b88950';
      g.shadowColor = 'rgba(217, 125, 46, 0.6)';
      g.shadowBlur = reduced ? 3 : 8;
      g.lineWidth = 4.5;
      g.beginPath();
      g.arc(cx, cy, r, a0, end);
      g.stroke();
      g.shadowBlur = 0;
    }

    // soft dot at the sweep head
    if (sweep > 0.03 && prog > 0) {
      const ang = Math.min(a1, a0 + (a1 - a0) * sweep);
      const dx = cx + Math.cos(ang) * r;
      const dy = cy + Math.sin(ang) * r;
      const gr = g.createRadialGradient(dx, dy, 0, dx, dy, 7);
      gr.addColorStop(0, '#f5bb64');
      gr.addColorStop(1, 'rgba(245, 187, 100, 0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(dx, dy, 7, 0, Math.PI * 2);
      g.fill();
    }

    const labels = {
      idle: 'breathe',
      inhale: 'in',
      exhale: prog >= 0.62 ? 'long exhale' : 'out',
    };
    this.breathLabel.textContent = labels[name] ?? 'breathe';
  }

  // ---- letterbox / fade ----------------------------------------------------------

  letterbox(v) {
    this.letterboxEl.classList.remove('hidden');
    this.letterboxEl.classList.toggle('active', !!v);
  }

  fadeTo(black, cb) {
    this.fadeEl.classList.remove('hidden');
    this.fadeEl.classList.toggle('on', !!black);
    setTimeout(() => cb?.(), 950);
  }

  fadeIn(cb) {
    this.fadeTo(false, cb);
  }

  // ---- debug overlay -------------------------------------------------------------

  debugVisible() {
    return !this.debugEl.classList.contains('hidden');
  }

  toggleDebug(v) {
    this.debugEl.classList.toggle('hidden', v === undefined ? this.debugVisible() : !v);
  }

  setDebugText(text) {
    if (this.debugLines.textContent !== text) this.debugLines.textContent = text;
  }

  drawSpark(values) {
    const c = this.debugSpark;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(217, 145, 65, 0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, c.height / 2);
    g.lineTo(c.width, c.height / 2);
    g.stroke();
    if (!values.length) return;
    g.strokeStyle = '#d97d2e';
    g.lineWidth = 1.6;
    g.beginPath();
    const step = c.width / Math.max(1, values.length - 1);
    for (let i = 0; i < values.length; i++) {
      const x = i * step;
      const y = c.height * 0.5 - (values[i] - 0.5) * c.height * 0.8;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  setDebugActions(html) {
    if (this.debugActions.innerHTML !== html) this.debugActions.innerHTML = html;
  }
}
