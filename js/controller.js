/**
 * controller.js
 * -------------
 * Drives a generator (from construction.js or improvement.js) on a timer,
 * exposing play/pause/step/reset/speed controls without the algorithms
 * needing to know anything about timing or UI state.
 *
 * Usage:
 *   const controller = new AlgorithmController({
 *     onStep: (step) => { ...render step... },
 *     onFinish: (step) => { ...handle completion... },
 *   });
 *   controller.load(generatorFn, points, distanceMatrix, extraArgs);
 *   controller.play();
 */

class AlgorithmController {
  constructor({ onStep, onFinish, onStateChange }) {
    this.onStep = onStep || (() => {});
    this.onFinish = onFinish || (() => {});
    this.onStateChange = onStateChange || (() => {});

    this.generator = null;
    this.timerId = null;
    this.isPlaying = false;
    this.isFinished = true;
    this.stepCount = 0;

    // Lower delay = faster. Range matched to the speed slider in index.html.
    this.delayMs = 250;
  }

  /**
   * @param {Function} generatorFn  a generator function from construction.js/improvement.js
   * @param  {...any} args  forwarded to generatorFn
   */
  load(generatorFn, ...args) {
    this.pause();
    this.generator = generatorFn(...args);
    this.isFinished = false;
    this.stepCount = 0;
    this._setState("ready");
  }

  play() {
    if (!this.generator || this.isFinished) return;
    this.isPlaying = true;
    this._setState("playing");
    this._tick();
  }

  pause() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (!this.isFinished && this.generator) this._setState("paused");
  }

  /** Advances exactly one step, regardless of play state. */
  stepOnce() {
    if (!this.generator || this.isFinished) return;
    this._advance();
  }

  setSpeed(delayMs) {
    this.delayMs = delayMs;
  }

  _tick() {
    if (!this.isPlaying) return;
    const finished = this._advance();
    if (!finished && this.isPlaying) {
      this.timerId = setTimeout(() => this._tick(), this.delayMs);
    }
  }

  _advance() {
    const result = this.generator.next();
    if (result.done) {
      this.isFinished = true;
      this.isPlaying = false;
      this._setState("finished");
      return true;
    }
    this.stepCount++;
    const step = result.value;
    this.onStep(step, this.stepCount);
    if (step.done) {
      this.isFinished = true;
      this.isPlaying = false;
      this._setState("finished");
      this.onFinish(step, this.stepCount);
      return true;
    }
    return false;
  }

  _setState(state) {
    this.onStateChange(state);
  }
}

window.AlgorithmController = AlgorithmController;
