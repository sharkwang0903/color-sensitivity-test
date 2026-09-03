import { CONFIG } from "./config.js";
import { generateBaseColor, generateTargetColor, runColorSelfTests } from "./color.js";
import { StaircaseController } from "./staircase.js";
import { calculateResults, renderReactionTimeChart } from "./results.js";

const elements = {
  screens: {
    landing: document.querySelector("#landing-screen"),
    game: document.querySelector("#game-screen"),
    results: document.querySelector("#results-screen"),
    error: document.querySelector("#error-screen"),
  },
  start: document.querySelector("#start-button"),
  restart: document.querySelector("#restart-button"),
  errorRestart: document.querySelector("#error-restart-button"),
  brandHome: document.querySelector("#brand-home"),
  phaseLabel: document.querySelector("#phase-label"),
  trialProgress: document.querySelector("#trial-progress"),
  timeRemaining: document.querySelector("#time-remaining"),
  progressBar: document.querySelector("#progress-bar"),
  grid: document.querySelector("#color-grid"),
  gameStatus: document.querySelector("#game-status"),
  accuracy: document.querySelector("#accuracy-value"),
  accuracyDetail: document.querySelector("#accuracy-detail"),
  medianRt: document.querySelector("#median-rt-value"),
  meanRt: document.querySelector("#mean-rt-value"),
  threshold: document.querySelector("#threshold-value"),
  confidence: document.querySelector("#threshold-confidence"),
  thresholdNote: document.querySelector("#threshold-note"),
  thresholdMethodResult: document.querySelector("#threshold-method-result"),
  chart: document.querySelector("#reaction-chart"),
  tableBody: document.querySelector("#trial-table-body"),
  errorMessage: document.querySelector("#error-message"),
};

const staircase = new StaircaseController(CONFIG);
const state = {
  phase: "landing",
  sessionBaseColor: null,
  practiceIndex: 0,
  formalIndex: 0,
  trials: [],
  lastTargetIndex: null,
  currentTrial: null,
  runToken: 0,
};

let timeoutId = null;
let countdownId = null;
let nextTrialId = null;
let frameIds = [];

function cleanupTimers() {
  if (timeoutId !== null) clearTimeout(timeoutId);
  if (countdownId !== null) clearInterval(countdownId);
  if (nextTrialId !== null) clearTimeout(nextTrialId);
  frameIds.forEach((id) => cancelAnimationFrame(id));
  timeoutId = countdownId = nextTrialId = null;
  frameIds = [];
}

function showScreen(name) {
  Object.entries(elements.screens).forEach(([screenName, element]) => {
    const isActive = screenName === name;
    element.hidden = !isActive;
    element.classList.toggle("is-active", isActive);
  });
}

function resetState() {
  cleanupTimers();
  state.runToken += 1;
  state.phase = "landing";
  state.sessionBaseColor = null;
  state.practiceIndex = 0;
  state.formalIndex = 0;
  state.trials = [];
  state.lastTargetIndex = null;
  state.currentTrial = null;
  staircase.reset();
  elements.grid.replaceChildren();
  elements.gameStatus.classList.remove("is-visible");
  elements.gameStatus.textContent = "";
  elements.timeRemaining.textContent = `${(CONFIG.MAX_TIME_PER_TRIAL_MS / 1000).toFixed(1)} 秒`;
  elements.progressBar.style.width = "0%";
}

function returnHome(event) {
  event?.preventDefault();
  resetState();
  showScreen("landing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function randomTargetIndex() {
  const count = CONFIG.GRID_SIZE ** 2;
  let index = Math.floor(Math.random() * count);
  if (count > 1 && index === state.lastTargetIndex) index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
  state.lastTargetIndex = index;
  return index;
}

function createColorPair(baseColor, targetDeltaE) {
  let lastError;
  for (let attempt = 0; attempt < CONFIG.MAX_TRIAL_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return generateTargetColor(baseColor, targetDeltaE, CONFIG);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Unknown target color generation error.");
}

function createTrial() {
  const isPractice = state.phase === "practice";
  const base = isPractice ? generateBaseColor(CONFIG) : state.sessionBaseColor;
  const targetDeltaE = isPractice ? CONFIG.PRACTICE_DELTA_E : staircase.currentDeltaE;
  const target = createColorPair(base, targetDeltaE);
  return {
    trialNumber: isPractice ? state.practiceIndex + 1 : state.formalIndex + 1,
    phase: state.phase,
    baseColor: base.hex,
    targetColor: target.hex,
    targetDeltaE,
    actualDeltaE: target.actualDeltaE,
    targetIndex: randomTargetIndex(),
    selectedIndex: null,
    correct: false,
    timeout: false,
    responseTime: null,
    trialShownAt: null,
    finished: false,
    lightnessDifference: target.lightnessDifference,
    staircaseStep: isPractice ? null : staircase.stepSize,
  };
}

function updateTrialHeader() {
  const isPractice = state.phase === "practice";
  const current = isPractice ? state.practiceIndex + 1 : state.formalIndex + 1;
  const total = isPractice ? CONFIG.PRACTICE_TRIALS : CONFIG.MAX_TRIALS;
  elements.phaseLabel.innerHTML = `<span></span> ${isPractice ? "練習階段" : "正式測驗"}`;
  elements.trialProgress.textContent = `${isPractice ? "練習" : "題目"} ${current} / ${total}`;
  const practiceProgress = isPractice ? (current - 1) / CONFIG.PRACTICE_TRIALS : 1;
  const formalProgress = isPractice ? 0 : (current - 1) / CONFIG.MAX_TRIALS;
  const totalUnits = CONFIG.PRACTICE_TRIALS + CONFIG.MAX_TRIALS;
  const completedUnits = isPractice ? practiceProgress * CONFIG.PRACTICE_TRIALS : CONFIG.PRACTICE_TRIALS + formalProgress * CONFIG.MAX_TRIALS;
  elements.progressBar.style.width = `${(completedUnits / totalUnits) * 100}%`;
}

function renderGrid(trial) {
  const fragment = document.createDocumentFragment();
  const count = CONFIG.GRID_SIZE ** 2;
  elements.grid.style.setProperty("--grid-size", CONFIG.GRID_SIZE);
  elements.grid.classList.add("is-switching");
  for (let index = 0; index < count; index += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "color-cell";
    cell.dataset.index = String(index);
    cell.style.backgroundColor = index === trial.targetIndex ? trial.targetColor : trial.baseColor;
    cell.setAttribute("aria-label", `色彩格 ${index + 1}`);
    cell.addEventListener("click", () => finishTrial({ selectedIndex: index, timeout: false }));
    fragment.append(cell);
  }
  elements.grid.replaceChildren(fragment);
}

function beginTiming(trial, runToken) {
  if (state.runToken !== runToken || state.currentTrial !== trial || trial.finished) return;
  trial.trialShownAt = performance.now();
  elements.grid.classList.remove("is-switching");
  const updateCountdown = () => {
    if (trial.finished || trial.trialShownAt === null) return;
    const elapsed = performance.now() - trial.trialShownAt;
    const remaining = Math.max(0, CONFIG.MAX_TIME_PER_TRIAL_MS - elapsed);
    elements.timeRemaining.textContent = `${(remaining / 1000).toFixed(1)} 秒`;
  };
  updateCountdown();
  countdownId = setInterval(updateCountdown, 50);
  timeoutId = setTimeout(() => finishTrial({ selectedIndex: null, timeout: true }), CONFIG.MAX_TIME_PER_TRIAL_MS);
}

function showNextTrial() {
  cleanupTimers();
  const runToken = state.runToken;
  let trial;
  try {
    trial = createTrial();
  } catch (error) {
    console.error("[Trial generation] Unable to generate a valid in-gamut target.", error);
    state.phase = "error";
    elements.errorMessage.textContent = "目前的色彩組合無法在安全色域內收斂。請重新開始；未完成資料不會保留。";
    showScreen("error");
    return;
  }
  state.currentTrial = trial;
  updateTrialHeader();
  elements.timeRemaining.textContent = `${(CONFIG.MAX_TIME_PER_TRIAL_MS / 1000).toFixed(1)} 秒`;
  elements.gameStatus.classList.remove("is-visible");
  elements.gameStatus.textContent = "";
  renderGrid(trial);
  const firstFrame = requestAnimationFrame(() => {
    const secondFrame = requestAnimationFrame(() => beginTiming(trial, runToken));
    frameIds.push(secondFrame);
  });
  frameIds.push(firstFrame);
}

function finishTrial({ selectedIndex, timeout }) {
  const trial = state.currentTrial;
  if (!trial || trial.finished || trial.trialShownAt === null) return false;
  trial.finished = true;
  cleanupTimers();

  trial.timeout = Boolean(timeout);
  trial.selectedIndex = timeout ? null : selectedIndex;
  trial.correct = !timeout && selectedIndex === trial.targetIndex;
  if (!timeout) {
    const measured = performance.now() - trial.trialShownAt;
    trial.responseTime = Number.isFinite(measured) && measured >= 0 ? measured : null;
  }
  elements.grid.querySelectorAll("button").forEach((cell) => { cell.disabled = true; });

  const isPractice = state.phase === "practice";
  if (isPractice) {
    elements.gameStatus.textContent = timeout ? "逾時" : trial.correct ? "答對了" : "下一題";
    state.practiceIndex += 1;
  } else {
    state.trials.push({ ...trial });
    staircase.update({
      correct: trial.correct,
      trialNumber: trial.trialNumber,
      targetDeltaE: trial.targetDeltaE,
      actualDeltaE: trial.actualDeltaE,
    });
    state.formalIndex += 1;
    elements.gameStatus.textContent = timeout ? "逾時" : trial.correct ? "已記錄" : "已記錄";
  }
  elements.gameStatus.classList.add("is-visible");

  nextTrialId = setTimeout(() => {
    if (isPractice && state.practiceIndex >= CONFIG.PRACTICE_TRIALS) {
      state.phase = "formal";
      state.formalIndex = 0;
      try {
        state.sessionBaseColor = generateBaseColor(CONFIG);
      } catch (error) {
        console.error("[Session] Unable to create base color.", error);
        state.phase = "error";
        showScreen("error");
        return;
      }
    }
    if (!isPractice && state.formalIndex >= CONFIG.MAX_TRIALS) {
      showResults();
      return;
    }
    showNextTrial();
  }, CONFIG.NEXT_TRIAL_DELAY_MS);
  return true;
}

function startGame() {
  resetState();
  state.phase = "practice";
  showScreen("game");
  window.scrollTo({ top: 0, behavior: "smooth" });
  showNextTrial();
}

function formatSeconds(milliseconds) {
  return Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(2)} 秒` : "無資料";
}

function confidenceCopy(confidence) {
  if (confidence === "standard") return { badge: "標準估計", note: "" };
  if (confidence === "low") return { badge: "低信心估計", note: "有效轉向次數較少，請將此數值視為初步估計。" };
  return { badge: "資料不足", note: "本次資料不足，閾值僅供粗略參考。" };
}

function thresholdMethodCopy(threshold) {
  if (!Number.isFinite(threshold.estimatedThreshold) || threshold.sourceCount === 0) {
    return "本次沒有足夠的有效 ΔE00 資料，暫時無法估計閾值。";
  }
  if (threshold.confidence === "standard") {
    return `本次使用最後 ${threshold.sourceCount} 次有效 reversal 的 actual ΔE00 中位數。`;
  }
  if (threshold.confidence === "low") {
    return `本次使用 ${threshold.sourceCount} 次有效 reversal 的 actual ΔE00 中位數；資料量較少，請視為初步估計。`;
  }
  return `因有效 reversal 不足，本次改用最後 ${threshold.sourceCount} 題正式題的 actual ΔE00 中位數作為粗略參考。`;
}

function renderTrialTable(trials) {
  const fragment = document.createDocumentFragment();
  trials.forEach((trial) => {
    const row = document.createElement("tr");
    const status = trial.timeout ? "逾時" : trial.correct ? "答對" : "答錯";
    const resultClass = trial.correct ? "result-correct" : "result-wrong";
    row.innerHTML = `<td>${trial.trialNumber}</td><td>${trial.actualDeltaE.toFixed(2)}</td><td class="${resultClass}">${status}</td><td>${trial.timeout ? "—" : formatSeconds(trial.responseTime)}</td>`;
    fragment.append(row);
  });
  elements.tableBody.replaceChildren(fragment);
}

function showResults() {
  cleanupTimers();
  state.phase = "results";
  state.currentTrial = null;
  const results = calculateResults(state.trials, staircase.reversals, CONFIG);
  elements.accuracy.textContent = `${(results.accuracy * 100).toFixed(1)}%`;
  elements.accuracyDetail.textContent = `${results.correctTrials} / ${results.totalTrials} 題答對`;
  elements.medianRt.textContent = formatSeconds(results.medianReactionTime);
  elements.meanRt.textContent = formatSeconds(results.meanReactionTime);
  elements.threshold.textContent = Number.isFinite(results.threshold.estimatedThreshold)
    ? `ΔE00 ≈ ${results.threshold.estimatedThreshold.toFixed(1)}`
    : "無法估計";
  const confidence = confidenceCopy(results.threshold.confidence);
  elements.confidence.textContent = confidence.badge;
  elements.thresholdNote.textContent = confidence.note;
  elements.thresholdMethodResult.textContent = thresholdMethodCopy(results.threshold);
  renderReactionTimeChart(elements.chart, state.trials, CONFIG.MAX_TIME_PER_TRIAL_MS);
  renderTrialTable(state.trials);
  showScreen("results");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

elements.start.addEventListener("click", startGame);
elements.restart.addEventListener("click", startGame);
elements.errorRestart.addEventListener("click", startGame);
elements.brandHome.addEventListener("click", returnHome);
window.addEventListener("beforeunload", cleanupTimers);

runColorSelfTests();
resetState();
showScreen("landing");

export { state, staircase, startGame, finishTrial, cleanupTimers };

