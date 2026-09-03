# 色彩敏感度測試 / Color Sensitivity Test

一款純前端、娛樂型的色彩差異辨識測驗。玩家在固定的 8 × 8 方格中找出唯一顏色不同的格子；測驗使用 CIELAB、CIEDE2000（ΔE00）與 2-down / 1-up adaptive staircase，提供可解釋、可替換的 V1 色彩辨識閾值估計。

> 這不是醫療或臨床診斷工具。V1 threshold 是遊戲條件下的 **operational estimate（操作型估計）**，不是臨床測量值。

## 檔案架構

```text
.
├── index.html              # 頁面結構：Landing、Game、Results、Error
├── styles.css              # 中性測驗介面、responsive layout、結果儀表板
├── js/
│   ├── config.js           # 所有可調遊戲與搜尋參數
│   ├── color.js            # sRGB/Linear RGB/XYZ/Lab、CIEDE2000、色彩生成
│   ├── staircase.js        # 2-down / 1-up adaptive staircase
│   ├── results.js          # 統計、threshold estimator、原生 SVG 圖表
│   └── app.js              # 遊戲流程、狀態、計時與 UI 事件
├── tests/                  # Node 內建測試，不需要第三方套件
├── package.json            # 僅提供 ES module 與測試指令
└── README.md
```

## 本機執行

這是普通靜態網站，不需要安裝 npm 套件或 build。

建議用任一靜態 HTTP server 在專案根目錄啟動，例如：

```bash
python -m http.server 8000
```

然後開啟 `http://localhost:8000/`。

也可以使用 VS Code Live Server。由於 JavaScript 使用原生 ES modules，不建議直接用 `file://` 雙擊開啟（部分瀏覽器會限制 module 載入）。

執行自動測試（需要 Node.js 18+）：

```bash
npm test
```

測試只使用 Node 內建 test runner，沒有 npm dependencies。

## 遊戲規則與流程

1. Landing page 說明規則與測量環境建議。
2. 兩題練習題使用明顯色差，不進入任何正式統計。
3. 30 題正式測驗固定使用同一個 `sessionBaseColor` 與固定 8 × 8 grid。
4. 每題重新計時 10 秒；第一次有效點擊立即鎖定答案，不能繼續猜。
5. 逾時記為錯誤，`selectedIndex` 與 `responseTime` 均為 `null`。
6. 結果頁顯示正確率、正確題的平均/中位反應時間、threshold estimate、互動式 SVG 趨勢圖與可展開逐題紀錄。

方格在建立完成後，會跨過兩個 `requestAnimationFrame` 才設定 `trialShownAt`。點擊與 timeout 共用有 atomic guard 的 `finishTrial()`，確保同一題只結算一次。重新開始會清除 timeout、interval、下一題延遲與尚未執行的 animation frame。

## ΔE00 與 target color

ΔE00（CIEDE2000）是比較兩個 CIELAB 顏色知覺差異的公式。數值較大通常代表差異較明顯；數值較小代表顏色更接近。程式使用標準 sRGB D65：

```text
sRGB → Linear RGB → XYZ (D65) → CIELAB (D65) → CIEDE2000
```

正式測驗開始時只生成一次安全色域內的 base color。每一題保持 intended Lab `L*` 不變，在 `a* / b*` 平面選取隨機方向，沿該方向尋找 gamut boundary，再以 binary search 找到接近目前 target ΔE00 的顏色。

Lab 轉回 sRGB 後不會用 clipping 修正超出色域的 channel；任何 out-of-gamut candidate 都會被拒絕。最終 CSS 顯示色採整數 sRGB，再轉回 Lab 重新計算 `actualDeltaE`；只有在 `DELTA_E_TOLERANCE` 內才接受。搜尋有明確的 iteration 與 retry 上限，失敗時進入可恢復的錯誤畫面，不會形成 infinite loop。

`deltaE2000(colorA, colorB)` 是可獨立測試的 export。載入遊戲時會執行 self-test：

- Sharma reference pair 預期 `ΔE00 ≈ 2.0425`
- `deltaE(A, A) ≈ 0`
- `deltaE(A, B) ≈ deltaE(B, A)`

失敗會在 console 顯示明確 error。

## Adaptive staircase

V1 使用 2-down / 1-up staircase，在此遊戲中視為追蹤約 70.7% 正確辨識區域的 operational estimate：

- 第一次連續答對：只累積 `consecutiveCorrect`，難度不變。
- 連續第二次答對：ΔE 降低（變難），計數歸零。
- 答錯或逾時：ΔE 提高（變容易），計數歸零。
- 初始方向為 `null`，第一次實際難度調整不算 reversal。
- direction 由 down 變 up 或由 up 變 down時，記錄轉向前、剛完成題目的 `targetDeltaE` 與 `actualDeltaE`。
- clamp 後沒有實際改變，就不改 direction 且不記 reversal。

Step schedule：

| Reversals | Step size |
|---:|---:|
| 0–1 | 4 |
| 2–3 | 2 |
| 4–5 | 1 |
| ≥ 6 | 0.5 |

所有數值都集中在 `js/config.js`；staircase 本身位於獨立 controller，未來可換成 QUEST、Bayesian method 或其他規則，不必重寫 UI。

## Threshold V1 estimator

Estimator 使用每題最終顯示顏色重新計算的 `actualDeltaE`，不使用理想 target 值：

- reversal ≥ 6：最後 6 次 reversal actual ΔE00 的 median，`confidence = "standard"`。
- reversal 4–5：所有 reversal actual ΔE00 的 median，`confidence = "low"`。
- reversal < 4：最後最多 6 題正式 trial actual ΔE00 的 median，`confidence = "insufficient"`；UI 明確顯示資料不足、僅供粗略參考。
- 完全沒有有效數值：`estimatedThreshold = null`，顯示「無法估計」，不輸出 NaN 或虛構數字。

Threshold 越低，代表在本次裝置、光線、距離與遊戲條件下，能辨認更細微的色彩差異。它只適合互動體驗與相對比較。

## 每題資料

正式 trial 在記憶體中保存：

```js
{
  trialNumber,
  phase,
  baseColor,
  targetColor,
  targetDeltaE,
  actualDeltaE,
  targetIndex,
  selectedIndex,
  correct,
  timeout,
  responseTime,
  trialShownAt,
  lightnessDifference,
  staircaseStep
}
```

沒有 localStorage、API upload、後端或資料庫。此物件結構可在未來直接序列化並送往經同意的 backend。

## 科學與產品限制

- 未校正不同螢幕的色域、gamma、白點、亮度、對比與色彩管理差異。
- 未控制環境光線、觀看距離、視角、顯示器像素密度與使用者疲勞。
- 固定 base color 可減少場內變因，但一次 session 只取樣一個局部色域，不能代表完整色覺能力。
- 色彩搜尋保持 intended `L*` 固定，但轉成整數 sRGB 後仍會有很小的實際 lightness 差異。
- 30 題與有限 reversal 的估計變異可能很大；fallback median 尤其粗略。
- 2-down / 1-up 的理論收斂條件來自受控 psychophysical procedure；本遊戲的視覺搜尋、猜測、裝置與玩家策略會影響結果。
- target 位置雖避免連續完全相同，仍為 pseudo-random，未做位置平衡或 gaze tracking。

## 未來升級方向

- 顯示器校正、色彩管理與標準化觀看條件流程。
- 加入多個受控 base hue / lightness block，並分析方向性差異。
- 增加 catch trials、位置平衡、反應模型與 session quality checks。
- 用 psychometric curve fitting、Bayesian adaptive method 或 QUEST 取代 V1 staircase/estimator。
- 增加 seedable random generator，支援可重現的研究測試。
- 在取得明確同意及隱私設計後，再考慮 backend 與縱向資料比較。
