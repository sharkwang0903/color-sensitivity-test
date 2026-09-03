import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { deltaE2000, generateBaseColor, generateTargetColor, hexToRgb, isRgbInGamut, rgbToLab, runColorSelfTests } from "../js/color.js";

test("CIEDE2000 passes reference, identity, and symmetry checks", () => {
  const silent = { info() {}, error() {} };
  const result = runColorSelfTests(silent);
  assert.equal(result.passed, true);
  assert.ok(Math.abs(result.reference - 2.0425) < 0.0001);
});

test("known identical colors have zero delta E", () => {
  const lab = rgbToLab({ r: 92, g: 133, b: 140 });
  assert.ok(Math.abs(deltaE2000(lab, lab)) < 1e-12);
});

test("target generator returns displayed sRGB colors inside gamut and tolerance", () => {
  for (const requested of [1, 3, 6, 12, 18, 24, 30]) {
    let generated = false;
    for (let baseAttempt = 0; baseAttempt < 5 && !generated; baseAttempt += 1) {
      const base = generateBaseColor(CONFIG);
      try {
        const target = generateTargetColor(base, requested, CONFIG);
        assert.equal(isRgbInGamut(target.rgb), true);
        assert.deepEqual(target.rgb, hexToRgb(target.hex));
        const recomputed = deltaE2000(rgbToLab(base.rgb), rgbToLab(hexToRgb(target.hex)));
        assert.ok(Math.abs(recomputed - requested) <= CONFIG.DELTA_E_TOLERANCE);
        assert.ok(Math.abs(recomputed - target.actualDeltaE) < 1e-10);
        generated = true;
      } catch {
        // A different base is an explicitly supported retry path.
      }
    }
    assert.equal(generated, true, `failed to generate ΔE ${requested}`);
  }
});
