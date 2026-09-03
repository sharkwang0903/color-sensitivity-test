import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { StaircaseController, stepForReversals } from "../js/staircase.js";

const answer = (staircase, trialNumber, correct, actualDeltaE = staircase.currentDeltaE) => staircase.update({
  correct,
  trialNumber,
  targetDeltaE: staircase.currentDeltaE,
  actualDeltaE,
});

test("2-down / 1-up obeys first-correct hold and second-correct decrease", () => {
  const staircase = new StaircaseController(CONFIG);
  answer(staircase, 1, true);
  assert.equal(staircase.currentDeltaE, 18);
  assert.equal(staircase.consecutiveCorrect, 1);
  answer(staircase, 2, true);
  assert.equal(staircase.currentDeltaE, 14);
  assert.equal(staircase.direction, "down");
  assert.equal(staircase.reversals.length, 0);
});

test("wrong answer increases delta E and records reversal at completed level", () => {
  const staircase = new StaircaseController(CONFIG);
  answer(staircase, 1, true);
  answer(staircase, 2, true);
  const beforeWrong = staircase.currentDeltaE;
  answer(staircase, 3, false, beforeWrong + 0.1);
  assert.equal(staircase.currentDeltaE, beforeWrong + 4);
  assert.equal(staircase.reversals.length, 1);
  assert.equal(staircase.reversals[0].targetDeltaE, beforeWrong);
  assert.equal(staircase.reversals[0].actualDeltaE, beforeWrong + 0.1);
});

test("clamped no-op is not a reversal", () => {
  const staircase = new StaircaseController({ ...CONFIG, INITIAL_DELTA_E: CONFIG.MAX_DELTA_E });
  answer(staircase, 1, false);
  assert.equal(staircase.currentDeltaE, CONFIG.MAX_DELTA_E);
  assert.equal(staircase.direction, null);
  assert.equal(staircase.reversals.length, 0);
});

test("step schedule follows reversal count", () => {
  assert.equal(stepForReversals(0, CONFIG), 4);
  assert.equal(stepForReversals(1, CONFIG), 4);
  assert.equal(stepForReversals(2, CONFIG), 2);
  assert.equal(stepForReversals(4, CONFIG), 1);
  assert.equal(stepForReversals(6, CONFIG), 0.5);
});
