// Procedural audio engine — every sound is synthesized, no assets.
// Room tone (brown noise + low rumble), the keyhole's soft pulse thump,
// breath wind that follows the chest trace, three rising lock clanks, the
// door's long creak, and the warm chord + bell of "Welcome home."

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.breathGain = null;
    this.breathFilter = null;
    this._noiseBuf = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this._startAmbient();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.35);
    }
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    this._noiseBuf = buf;
    return buf;
  }

  _startAmbient() {
    const ctx = this.ctx;

    // brown-noise room tone
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();

    // low house rumble
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 46;
    const og = ctx.createGain();
    og.gain.value = 0.016;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 0.007;
    lfo.connect(lg);
    lg.connect(og.gain);
    o.connect(og);
    og.connect(this.master);
    o.start();
    lfo.start();

    // breath wind channel (follows the chest trace)
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this._noiseBuffer();
    wsrc.loop = true;
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 520;
    this.breathFilter.Q.value = 0.9;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    wsrc.connect(this.breathFilter);
    this.breathFilter.connect(this.breathGain);
    this.breathGain.connect(this.master);
    wsrc.start();
  }

  // helpers ---------------------------------------------------------------

  _tone(type, f0, f1, t, dur, gain, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseHit(t, dur, freq, q, gain, type = 'bandpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    src.playbackRate.value = 1.7;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 2, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  // public events -----------------------------------------------------------

  pulseBeat(intensity) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const i = clamp01(intensity);
    this._tone('sine', 58, 40, t, 0.16, 0.10 * i);
  }

  breath(dt, level, trusted) {
    if (!this.ctx || !this.enabled || !this.breathGain) return;
    const t = this._now();
    const target = trusted ? 0.012 + level * 0.05 : 0.005;
    this.breathGain.gain.setTargetAtTime(target, t, 0.3);
    if (this.breathFilter) {
      this.breathFilter.frequency.setTargetAtTime(430 + level * 320, t, 0.35);
    }
  }

  lockClick(i) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const p = 1 + i * 0.055;
    // tick — keyway seats
    this._noiseHit(t, 0.03, 2600 * p, 7, 0.1);
    // clank partials, rising per lock
    this._tone('sine', 168 * p, null, t, 0.17, 0.16);
    this._tone('sine', 254 * p, null, t, 0.15, 0.12);
    this._tone('sine', 407 * p, null, t, 0.11, 0.07);
    // body thunk
    this._tone('sine', 84, 60, t, 0.22, 0.22);
    this._noiseHit(t, 0.12, 1500 + 350 * i, 4, 0.12, 'bandpass');
  }

  creak() {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const dur = 2.4;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(78, t);
    o.frequency.linearRampToValueAtTime(148, t + dur * 0.55);
    o.frequency.linearRampToValueAtTime(112, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.35);
    const wob = this.ctx.createOscillator();
    wob.frequency.value = 5.6;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.018;
    wob.connect(wg);
    wg.connect(g.gain);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    o.start(t);
    wob.start(t);
    o.stop(t + dur + 0.1);
    wob.stop(t + dur + 0.1);
    this._noiseHit(t + 0.2, dur * 0.8, 320, 0.8, 0.02, 'bandpass');
  }

  doorThud() {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    this._tone('sine', 72, 36, t, 0.6, 0.3);
    this._noiseHit(t, 0.35, 130, 1, 0.14, 'lowpass');
  }

  _pad(notes, gain, attack, release, cutoff) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    for (const f of notes) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + attack + release * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + attack + release);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + attack + release + 0.1);
    }
  }

  homeChord() {
    this._pad([174.6, 220.0, 261.6, 329.6], 0.055, 1.4, 9.0, 1400); // F maj7, warm
  }

  mercyChord() {
    this._pad([220.0, 261.6, 329.6, 392.0], 0.04, 1.6, 9.0, 1100); // Am7, gentle
  }

  bell() {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    this._tone('sine', 659.3, null, t, 3.4, 0.05);
    this._tone('sine', 1318.5, null, t, 2.2, 0.02);
  }

  uiClick() {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    this._tone('sine', 1250, 900, t, 0.05, 0.045);
  }

  fadeOut(dur = 1.2) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this._now(), dur / 3);
  }
}
