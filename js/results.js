export function median(values) {
  const valid = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

export function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function estimateThreshold(trials, reversals, config) {
  const validReversals = reversals.filter((item) => Number.isFinite(item.actualDeltaE));
  if (validReversals.length >= config.THRESHOLD_STANDARD_REVERSALS) {
    const values = validReversals.slice(-config.THRESHOLD_REVERSAL_WINDOW).map((item) => item.actualDeltaE);
    return { estimatedThreshold: median(values), confidence: "standard", sourceCount: values.length };
  }
  if (validReversals.length >= config.THRESHOLD_LOW_REVERSALS) {
    const values = validReversals.map((item) => item.actualDeltaE);
    return { estimatedThreshold: median(values), confidence: "low", sourceCount: values.length };
  }
  const values = trials
    .filter((trial) => Number.isFinite(trial.actualDeltaE))
    .slice(-config.THRESHOLD_FALLBACK_TRIAL_WINDOW)
    .map((trial) => trial.actualDeltaE);
  return { estimatedThreshold: median(values), confidence: "insufficient", sourceCount: values.length };
}

export function calculateResults(trials, reversals, config) {
  const totalTrials = trials.length;
  const correctTrials = trials.filter((trial) => trial.correct).length;
  const validReactionTimes = trials
    .filter((trial) => trial.correct === true && trial.timeout === false && Number.isFinite(trial.responseTime))
    .map((trial) => trial.responseTime);
  return {
    totalTrials,
    correctTrials,
    accuracy: totalTrials ? correctTrials / totalTrials : 0,
    meanReactionTime: mean(validReactionTimes),
    medianReactionTime: median(validReactionTimes),
    validReactionTimeCount: validReactionTimes.length,
    threshold: estimateThreshold(trials, reversals, config),
  };
}

const svgElement = (name, attributes = {}) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
};

export function renderReactionTimeChart(container, trials, maxTimeMs) {
  container.replaceChildren();
  const width = 900;
  const height = 330;
  const margin = { top: 20, right: 20, bottom: 47, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxSeconds = maxTimeMs / 1000;
  const x = (trialNumber) => margin.left + ((trialNumber - 1) / Math.max(1, trials.length - 1)) * plotWidth;
  const y = (seconds) => margin.top + plotHeight - (Math.min(maxSeconds, Math.max(0, seconds)) / maxSeconds) * plotHeight;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "chart-title chart-desc" });
  const title = svgElement("title", { id: "chart-title" });
  title.textContent = "正式測驗每題反應時間";
  const desc = svgElement("desc", { id: "chart-desc" });
  desc.textContent = "橫軸為題次，縱軸為秒數。綠色表示答對，橘色表示答錯，菱形表示逾時。";
  svg.append(title, desc);

  for (let seconds = 0; seconds <= maxSeconds; seconds += 2) {
    const gridY = y(seconds);
    svg.append(svgElement("line", { x1: margin.left, y1: gridY, x2: width - margin.right, y2: gridY, stroke: "#d9dfe0", "stroke-width": 1 }));
    const label = svgElement("text", { x: margin.left - 12, y: gridY + 4, "text-anchor": "end", fill: "#69767a", "font-size": 11 });
    label.textContent = `${seconds}s`;
    svg.append(label);
  }

  [1, 5, 10, 15, 20, 25, 30].filter((number) => number <= trials.length).forEach((number) => {
    const label = svgElement("text", { x: x(number), y: height - 17, "text-anchor": "middle", fill: "#69767a", "font-size": 11 });
    label.textContent = number;
    svg.append(label);
  });

  const xLabel = svgElement("text", { x: margin.left + plotWidth / 2, y: height - 1, "text-anchor": "middle", fill: "#69767a", "font-size": 11 });
  xLabel.textContent = "題次 / Trial";
  svg.append(xLabel);

  const answered = trials.filter((trial) => Number.isFinite(trial.responseTime));
  if (answered.length > 1) {
    const pathData = answered.map((trial, index) => `${index ? "L" : "M"}${x(trial.trialNumber).toFixed(2)},${y(trial.responseTime / 1000).toFixed(2)}`).join(" ");
    svg.append(svgElement("path", { d: pathData, fill: "none", stroke: "#8d999c", "stroke-width": 1.5, "stroke-linejoin": "round", opacity: .8 }));
  }

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  const showTooltip = (event, trial, pointX, pointY) => {
    const status = trial.timeout ? "逾時" : trial.correct ? "答對" : "答錯";
    const reaction = trial.timeout ? "逾時" : Number.isFinite(trial.responseTime) ? `${(trial.responseTime / 1000).toFixed(2)} 秒` : "無資料";
    tooltip.innerHTML = `<strong>第 ${trial.trialNumber} 題 · ${status}</strong><br>ΔE00 ${trial.actualDeltaE.toFixed(2)}<br>反應時間 ${reaction}`;
    const bounds = container.getBoundingClientRect();
    const svgBounds = svg.getBoundingClientRect();
    tooltip.style.left = `${svgBounds.left - bounds.left + (pointX / width) * svgBounds.width}px`;
    tooltip.style.top = `${svgBounds.top - bounds.top + (pointY / height) * svgBounds.height}px`;
    tooltip.hidden = false;
    event?.stopPropagation();
  };
  const hideTooltip = () => { tooltip.hidden = true; };

  trials.forEach((trial) => {
    const pointX = x(trial.trialNumber);
    const hasResponse = Number.isFinite(trial.responseTime);
    const seconds = trial.timeout ? maxSeconds : hasResponse ? trial.responseTime / 1000 : 0;
    const pointY = y(seconds);
    const color = trial.timeout ? "#6c777a" : trial.correct ? "#087f79" : "#bd5f44";
    const marker = trial.timeout
      ? svgElement("rect", { x: pointX - 4.5, y: pointY - 4.5, width: 9, height: 9, fill: color, transform: `rotate(45 ${pointX} ${pointY})` })
      : svgElement("circle", { cx: pointX, cy: pointY, r: 4.5, fill: color, stroke: "#f7f8f8", "stroke-width": 1.5 });
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("role", "button");
    marker.setAttribute("aria-label", `第 ${trial.trialNumber} 題，${trial.timeout ? "逾時" : trial.correct ? "答對" : "答錯"}${!trial.timeout && !hasResponse ? "，反應時間無資料" : ""}`);
    marker.addEventListener("mouseenter", (event) => showTooltip(event, trial, pointX, pointY));
    marker.addEventListener("focus", (event) => showTooltip(event, trial, pointX, pointY));
    marker.addEventListener("click", (event) => showTooltip(event, trial, pointX, pointY));
    marker.addEventListener("mouseleave", hideTooltip);
    marker.addEventListener("blur", hideTooltip);
    svg.append(marker);
  });

  container.append(svg, tooltip);
  container.addEventListener("click", (event) => { if (event.target === container || event.target === svg) hideTooltip(); });
}
