function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function stepForReversals(reversalCount, config) {
  const match = config.STEP_SCHEDULE.find(({ minReversals, maxReversals }) => reversalCount >= minReversals && reversalCount <= maxReversals);
  return match ? Math.max(config.MIN_STEP, match.step) : config.MIN_STEP;
}

export class StaircaseController {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.currentDeltaE = this.config.INITIAL_DELTA_E;
    this.consecutiveCorrect = 0;
    this.direction = null;
    this.reversals = [];
    this.stepSize = stepForReversals(0, this.config);
  }

  update({ correct, trialNumber, targetDeltaE, actualDeltaE }) {
    const completedLevel = Number.isFinite(targetDeltaE) ? targetDeltaE : this.currentDeltaE;
    let nextDirection = null;

    if (correct) {
      this.consecutiveCorrect += 1;
      if (this.consecutiveCorrect < 2) return this.snapshot(false);
      this.consecutiveCorrect = 0;
      nextDirection = "down";
    } else {
      this.consecutiveCorrect = 0;
      nextDirection = "up";
    }

    const signedStep = nextDirection === "down" ? -this.stepSize : this.stepSize;
    const proposed = clamp(completedLevel + signedStep, this.config.MIN_DELTA_E, this.config.MAX_DELTA_E);
    const changed = Math.abs(proposed - completedLevel) > 1e-12;
    if (!changed) return this.snapshot(false);

    const isReversal = this.direction !== null && this.direction !== nextDirection;
    if (isReversal) {
      this.reversals.push({
        trialNumber,
        targetDeltaE: completedLevel,
        actualDeltaE: Number.isFinite(actualDeltaE) ? actualDeltaE : null,
        fromDirection: this.direction,
        toDirection: nextDirection,
      });
    }

    this.currentDeltaE = proposed;
    this.direction = nextDirection;
    this.stepSize = stepForReversals(this.reversals.length, this.config);
    return this.snapshot(isReversal);
  }

  snapshot(isReversal = false) {
    return {
      currentDeltaE: this.currentDeltaE,
      consecutiveCorrect: this.consecutiveCorrect,
      direction: this.direction,
      reversals: this.reversals.map((item) => ({ ...item })),
      stepSize: this.stepSize,
      isReversal,
    };
  }
}
