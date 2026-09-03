import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { calculateResults, estimateThreshold, mean, median } from "../js/results.js";

test("mean and median ignore invalid values and return null for empty input", () => {
  assert.equal(mean([100, 200, null, Number.NaN]), 150);
  assert.equal(median([3, 1, 2, null]), 2);
  assert.equal(median([]), null);
  assert.equal(mean([]), null);
});

test("reaction statistics use only correct non-timeout trials", () => {
  const trials = [
    { correct: true, timeout: false, responseTime: 1000, actualDeltaE: 8 },
    { correct: false, timeout: false, responseTime: 50, actualDeltaE: 7 },
    { correct: false, timeout: true, responseTime: null, actualDeltaE: 6 },
    { correct: true, timeout: false, responseTime: 3000, actualDeltaE: 5 },
  ];
  const results = calculateResults(trials, [], CONFIG);
  assert.equal(results.accuracy, 0.5);
  assert.equal(results.meanReactionTime, 2000);
  assert.equal(results.medianReactionTime, 2000);
});

test("threshold uses the last six actual reversal values", () => {
  const reversals = [10, 9, 8, 7, 6, 5, 4].map((actualDeltaE) => ({ actualDeltaE }));
  const result = estimateThreshold([], reversals, CONFIG);
  assert.equal(result.confidence, "standard");
  assert.equal(result.estimatedThreshold, 6.5);
});

test("threshold confidence falls back to low and insufficient without inventing values", () => {
  const low = estimateThreshold([], [8, 7, 6, 5].map((actualDeltaE) => ({ actualDeltaE })), CONFIG);
  assert.equal(low.confidence, "low");
  assert.equal(low.estimatedThreshold, 6.5);

  const trials = [9, 8, 7, 6, 5, 4, 3].map((actualDeltaE) => ({ actualDeltaE }));
  const insufficient = estimateThreshold(trials, [], CONFIG);
  assert.equal(insufficient.confidence, "insufficient");
  assert.equal(insufficient.estimatedThreshold, 5.5);

  const empty = estimateThreshold([], [], CONFIG);
  assert.equal(empty.estimatedThreshold, null);
});
