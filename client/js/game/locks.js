// The three-lock logic.
//
// Normal path: each long exhale (>= 2.6 s, healthy amplitude) turns one lock.
// A lock completes the moment the ongoing exhale crosses ~3.2 s (the turn is
// felt as it happens), or when the exhale ends, whichever comes first.
//
// Fallback path: if no long exhale has arrived 100 s into Act II, the door
// accepts three slow full breath cycles instead.
//
// Mercy: after three minutes the door opens anyway — "You showed up. That
// counts." There is no failure state; the player is never trapped.

const LONG_EXHALE_TARGET = 3200; // ms of exhale that visually completes a lock

export class LockLogic {
  constructor({ onLock, onCalibrated, onFallback, onMercy, onOpen } = {}) {
    this.onLock = onLock;
    this.onCalibrated = onCalibrated;
    this.onFallback = onFallback;
    this.onMercy = onMercy;
    this.onOpen = onOpen;
    this.reset();
  }

  reset() {
    this.done = 0;
    this.lockProgress = [0, 0, 0];
    this.active = 0;
    this.exhaleStart = null;
    this.exhaleConsumed = false;
    this.fallback = false;
    this.slowCycles = 0;
    this.turnStart = null;
    this.opened = false;
    this.calibrated = false;
  }

  beginTurn(now) {
    this.turnStart = now;
  }

  onPhaseStart(e) {
    if (this.opened) return;
    if (e.dir === 'exhale') this.beginExhale(e.t0 ?? performance.now());
    else this.endExhale();
  }

  beginExhale(now) {
    if (this.opened || this.fallback) return;
    if (!this.exhaleStart) {
      this.exhaleStart = now;
      this.exhaleConsumed = false;
    }
  }

  endExhale() {
    this.exhaleStart = null;
  }

  onLongExhale() {
    if (this.opened || this.fallback) return;
    // If the lock already completed mid-exhale (the 3.2 s mark), this
    // end-of-exhale event belongs to the same breath — do not double-count.
    if (this.exhaleConsumed) {
      this.exhaleConsumed = false;
      this.endExhale();
      return;
    }
    this._complete();
  }

  onCycle() {
    if (this.opened || !this.fallback) return;
    this.slowCycles += 1;
    this._complete();
  }

  onCalibrationDone() {
    if (this.calibrated) return;
    this.calibrated = true;
    if (this.onCalibrated) this.onCalibrated();
  }

  update(now) {
    if (this.opened || !this.turnStart) return;

    const elapsed = now - this.turnStart;
    if (!this.fallback && elapsed > 100000) {
      this.fallback = true;
      this.exhaleStart = null;
      if (this.onFallback) this.onFallback();
    }
    if (elapsed > 180000) {
      this.open('mercy');
      return;
    }

    // the active lock follows the ongoing exhale
    if (this.exhaleStart && !this.fallback && this.done < 3) {
      const p = Math.min(1, (now - this.exhaleStart) / LONG_EXHALE_TARGET);
      this.lockProgress[this.done] = Math.max(this.lockProgress[this.done], p);
      if (p >= 1) {
        this.exhaleConsumed = true;
        this._complete();
      }
    }
  }

  _complete() {
    if (this.opened) return;
    const i = this.done;
    if (i >= 3) return;
    this.lockProgress[i] = 1;
    this.done += 1;
    this.active = this.done;
    this.exhaleStart = null;
    if (this.onLock) this.onLock(this.done);
    if (this.done >= 3) this.open('breath');
  }

  open(how) {
    if (this.opened) return;
    this.opened = true;
    this.exhaleStart = null;
    if (this.onOpen) this.onOpen(how);
  }
}
