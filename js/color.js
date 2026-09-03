const D65 = Object.freeze({ x: 95.047, y: 100, z: 108.883 });
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const normalizeHue = (degrees) => ((degrees % 360) + 360) % 360;
const clampByte = (value) => Math.min(255, Math.max(0, Math.round(value)));

export function srgbChannelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(channel) {
  const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return value * 255;
}

export function rgbToXyz({ r, g, b }) {
  const red = srgbChannelToLinear(r);
  const green = srgbChannelToLinear(g);
  const blue = srgbChannelToLinear(b);
  return {
    x: (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) * 100,
    y: (red * 0.2126729 + green * 0.7151522 + blue * 0.072175) * 100,
    z: (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) * 100,
  };
}

export function xyzToLinearRgb({ x, y, z }) {
  const nx = x / 100;
  const ny = y / 100;
  const nz = z / 100;
  return {
    r: nx * 3.2404542 + ny * -1.5371385 + nz * -0.4985314,
    g: nx * -0.969266 + ny * 1.8760108 + nz * 0.041556,
    b: nx * 0.0556434 + ny * -0.2040259 + nz * 1.0572252,
  };
}

export function xyzToLab({ x, y, z }) {
  const transform = (value) => (value > EPSILON ? Math.cbrt(value) : (KAPPA * value + 16) / 116);
  const fx = transform(x / D65.x);
  const fy = transform(y / D65.y);
  const fz = transform(z / D65.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz({ L, a, b }) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (value) => {
    const cube = value ** 3;
    return cube > EPSILON ? cube : (116 * value - 16) / KAPPA;
  };
  return { x: D65.x * inverse(fx), y: D65.y * inverse(fy), z: D65.z * inverse(fz) };
}

export function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

export function labToRgbRaw(lab) {
  const linear = xyzToLinearRgb(labToXyz(lab));
  return {
    r: linearChannelToSrgb(linear.r),
    g: linearChannelToSrgb(linear.g),
    b: linearChannelToSrgb(linear.b),
  };
}

export function isRgbInGamut(rgb, epsilon = 1e-7) {
  return [rgb.r, rgb.g, rgb.b].every((channel) => Number.isFinite(channel) && channel >= -epsilon && channel <= 255 + epsilon);
}

export function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => clampByte(value).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new TypeError(`Invalid hex color: ${hex}`);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function labToDisplayRgb(lab) {
  const raw = labToRgbRaw(lab);
  if (!isRgbInGamut(raw)) return null;
  return { r: clampByte(raw.r), g: clampByte(raw.g), b: clampByte(raw.b) };
}

export function deltaE2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const cBar = (C1 + C2) / 2;
  const cBar7 = cBar ** 7;
  const G = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1Prime = (1 + G) * a1;
  const a2Prime = (1 + G) * a2;
  const C1Prime = Math.hypot(a1Prime, b1);
  const C2Prime = Math.hypot(a2Prime, b2);
  const h1Prime = normalizeHue(toDegrees(Math.atan2(b1, a1Prime)));
  const h2Prime = normalizeHue(toDegrees(Math.atan2(b2, a2Prime)));

  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;
  let deltaHAngle = 0;
  if (C1Prime * C2Prime !== 0) {
    const difference = h2Prime - h1Prime;
    deltaHAngle = Math.abs(difference) <= 180 ? difference : difference > 180 ? difference - 360 : difference + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin(toRadians(deltaHAngle / 2));

  const lBarPrime = (L1 + L2) / 2;
  const cBarPrime = (C1Prime + C2Prime) / 2;
  let hBarPrime = h1Prime + h2Prime;
  if (C1Prime * C2Prime !== 0) {
    const difference = Math.abs(h1Prime - h2Prime);
    hBarPrime = difference <= 180
      ? (h1Prime + h2Prime) / 2
      : h1Prime + h2Prime < 360
        ? (h1Prime + h2Prime + 360) / 2
        : (h1Prime + h2Prime - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos(toRadians(hBarPrime - 30))
    + 0.24 * Math.cos(toRadians(2 * hBarPrime))
    + 0.32 * Math.cos(toRadians(3 * hBarPrime + 6))
    - 0.2 * Math.cos(toRadians(4 * hBarPrime - 63));
  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const Rc = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + 25 ** 7));
  const Sl = 1 + (0.015 * (lBarPrime - 50) ** 2) / Math.sqrt(20 + (lBarPrime - 50) ** 2);
  const Sc = 1 + 0.045 * cBarPrime;
  const Sh = 1 + 0.015 * cBarPrime * T;
  const Rt = -Math.sin(toRadians(2 * deltaTheta)) * Rc;
  const lTerm = deltaLPrime / (kL * Sl);
  const cTerm = deltaCPrime / (kC * Sc);
  const hTerm = deltaHPrime / (kH * Sh);
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + Rt * cTerm * hTerm);
}

function randomBetween(min, max, random) {
  return min + (max - min) * random();
}

export function generateBaseColor(config, random = Math.random) {
  for (let attempt = 0; attempt < config.BASE_COLOR_ATTEMPTS; attempt += 1) {
    const L = randomBetween(config.MIN_BASE_LIGHTNESS, config.MAX_BASE_LIGHTNESS, random);
    const chroma = randomBetween(config.MIN_BASE_CHROMA, config.MAX_BASE_CHROMA, random);
    const hue = randomBetween(0, Math.PI * 2, random);
    const rgb = labToDisplayRgb({ L, a: chroma * Math.cos(hue), b: chroma * Math.sin(hue) });
    if (rgb) {
      const hex = rgbToHex(rgb);
      return { rgb, hex, lab: rgbToLab(rgb) };
    }
  }
  throw new Error("Unable to generate an in-gamut base color.");
}

function candidateAt(baseLab, angle, magnitude) {
  return { L: baseLab.L, a: baseLab.a + Math.cos(angle) * magnitude, b: baseLab.b + Math.sin(angle) * magnitude };
}

function findGamutBoundary(baseLab, angle, config) {
  let lastValid = 0;
  const scanStep = 2;
  for (let magnitude = scanStep; magnitude <= config.MAX_AB_SHIFT; magnitude += scanStep) {
    if (!isRgbInGamut(labToRgbRaw(candidateAt(baseLab, angle, magnitude)))) break;
    lastValid = magnitude;
  }
  return lastValid;
}

export function generateTargetColor(baseColor, targetDeltaE, config, random = Math.random) {
  const baseRgb = typeof baseColor === "string" ? hexToRgb(baseColor) : baseColor.rgb ?? baseColor;
  const baseHex = rgbToHex(baseRgb);
  const baseLab = rgbToLab(baseRgb);
  let globalBest = null;

  for (let directionAttempt = 0; directionAttempt < config.COLOR_DIRECTION_ATTEMPTS; directionAttempt += 1) {
    const angle = randomBetween(0, Math.PI * 2, random);
    const maxMagnitude = findGamutBoundary(baseLab, angle, config);
    if (maxMagnitude <= 0) continue;

    const edgeRgb = labToDisplayRgb(candidateAt(baseLab, angle, maxMagnitude));
    if (!edgeRgb || deltaE2000(baseLab, rgbToLab(edgeRgb)) < targetDeltaE - config.DELTA_E_TOLERANCE) continue;

    let low = 0;
    let high = maxMagnitude;
    let directionBest = null;
    for (let iteration = 0; iteration < config.COLOR_SEARCH_ITERATIONS; iteration += 1) {
      const magnitude = (low + high) / 2;
      const intendedLab = candidateAt(baseLab, angle, magnitude);
      const displayRgb = labToDisplayRgb(intendedLab);
      if (!displayRgb) {
        high = magnitude;
        continue;
      }

      const targetHex = rgbToHex(displayRgb);
      const actualLab = rgbToLab(displayRgb);
      const actualDeltaE = deltaE2000(baseLab, actualLab);
      const error = Math.abs(actualDeltaE - targetDeltaE);
      const candidate = { rgb: displayRgb, hex: targetHex, lab: actualLab, actualDeltaE, intendedLab, lightnessDifference: Math.abs(actualLab.L - baseLab.L) };
      if (targetHex !== baseHex && (!directionBest || error < Math.abs(directionBest.actualDeltaE - targetDeltaE))) directionBest = candidate;
      if (actualDeltaE < targetDeltaE) low = magnitude;
      else high = magnitude;
    }

    if (directionBest && (!globalBest || Math.abs(directionBest.actualDeltaE - targetDeltaE) < Math.abs(globalBest.actualDeltaE - targetDeltaE))) {
      globalBest = directionBest;
    }
    if (directionBest && Math.abs(directionBest.actualDeltaE - targetDeltaE) <= config.DELTA_E_TOLERANCE) return directionBest;
  }

  const bestError = globalBest ? Math.abs(globalBest.actualDeltaE - targetDeltaE).toFixed(3) : "none";
  throw new Error(`Target color search did not converge (best error: ${bestError}).`);
}

export function runColorSelfTests(logger = console) {
  const referenceA = { L: 50, a: 2.6772, b: -79.7751 };
  const referenceB = { L: 50, a: 0, b: -82.7485 };
  const reference = deltaE2000(referenceA, referenceB);
  const identity = deltaE2000(referenceA, referenceA);
  const reverse = deltaE2000(referenceB, referenceA);
  const checks = {
    reference: Math.abs(reference - 2.0425) < 0.0001,
    identity: Math.abs(identity) < 1e-12,
    symmetry: Math.abs(reference - reverse) < 1e-12,
  };
  const passed = Object.values(checks).every(Boolean);
  if (!passed) logger.error("[Color self-test] CIEDE2000 validation FAILED.", { reference, identity, reverse, checks });
  else logger.info("[Color self-test] CIEDE2000 validation passed.", { reference: reference.toFixed(4) });
  return { passed, reference, identity, reverse, checks };
}
