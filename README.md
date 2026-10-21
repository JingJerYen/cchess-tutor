# 象棋開局教練 cchess-tutor

給只懂規則的初學者用的象棋開局練習網站。重點不是「哪步好」，而是「為什麼」：
隨時可以問「為什麼不能這樣走？」，App 會用人話回答並逐步推演。

主要目標裝置是電子墨水平板（Boox Go 10.3），介面黑白、無動畫、大觸控區。

設計文件見 [docs/DESIGN.md](docs/DESIGN.md)。

## 開發

```bash
npm install
npm run dev        # 開發伺服器（--host，可用平板連進來看）
npm test           # 規則引擎、記譜、開局樹資料的測試
npm run build      # 產出 dist/
```

## 目前進度（P0）

- [x] 規則引擎：走法產生、合法性、違規原因說明（絆馬腳、塞象眼、將帥照面、送將……）
- [x] 中文記譜 ⇄ 座標，含前／後／中
- [x] 電子墨水棋盤（SVG）
- [x] 學習／測驗／自由走三種模式
- [x] 「如果我走這步呢？」：對照開局樹回答，常見錯誤可逐步推演
- [x] 第一課：中炮過河車對屏風馬（草稿，尚未經引擎與審稿驗證）
- [x] 離線產線第一段：引擎分析開局樹每個局面的所有合法著法（`npm run analyze`）
- [x] 「如果我走這步呢？」接上引擎資料：樹外走法也有評價與推演
- [x] 離線產線第二段：Claude 產生講解＋著法驗證＋審稿（`npm run explain`，需 API key）
- [ ] 跑過產線的講解取代手寫草稿（等 API key）
- [ ] 擴充到 5–8 個開局
- [ ] Render 後端：即時問答（回答「疑問」）與快取

產線說明見 [pipeline/README.md](pipeline/README.md)。

## 目錄

```
src/engine/    規則、記譜（事實的來源，不經過 LLM）
src/content/   開局樹內容（中文記譜撰寫，測試驗證每一步合法）
               analysis/ 引擎分析、explanations/ 產線講解（JSON，由 pipeline 產生）
pipeline/      離線產線：引擎分析、LLM 講解與審稿
src/ui/        SVG 棋盤
src/app.ts     三種模式的畫面與互動
tests/         vitest
docs/          設計文件
```
