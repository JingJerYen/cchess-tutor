# 離線產線

把「引擎事實」變成「人話講解」的兩段式流程。在開發者的電腦上跑，產物 commit 進 repo，
前端直接載入，使用者端不需要引擎也不需要網路。

```
開局樹（src/content/openings/*.ts，中文記譜手寫）
   │
   ▼  pipeline/analyze.ts
引擎分析（src/content/analysis/<id>.json）
   每個局面的所有合法著法：分數、損失、主變
   │
   ▼  pipeline/explain.ts
講解（src/content/explanations/<id>.json）
   每個節點的 note/detail/principle；每個局面挑出的常見錯誤與懲罰線說明
   每一段都經過：著法驗證（只能提到資料裡的著法）→ 第二個模型審稿
   │
   ▼  前端 src/content/index.ts 合併
通過審稿的講解取代手寫草稿；錯著加進樹；全部通過時拿掉「草稿」標示
```

## 1. 引擎分析

```bash
npm run analyze -- --depth 12          # 預設用 npm 內建的 Fairy-Stockfish（wasm）
CCHESS_ENGINE=/path/to/pikafish npm run analyze -- --depth 18   # 用 Pikafish
```

- 預設引擎是 `fairy-stockfish-nnue.wasm`（npm 套件，不用另外下載）。沒有 NNUE 權重時用傳統評估，
  戰術判斷可靠，開局的「風格」判斷不一定符合人類理論，所以**主線以人類實戰為準，引擎只負責抓明顯吃虧的著法**。
- 有 Pikafish 的話用 `CCHESS_ENGINE` 指到執行檔（座標是 0–9 列，與本專案一致；
  Fairy-Stockfish 原生執行檔是 1–10 列，要加 `CCHESS_ENGINE_RANKS=1-10`）。
- 可續跑：同深度已分析過的局面會略過。

## 2. 講解

```bash
export ANTHROPIC_API_KEY=...
npm run explain -- --dry-run           # 只印出提示，不花錢
npm run explain -- --limit 3           # 先做三個節點看看品質
npm run explain                        # 全部
```

- 寫作模型預設 `claude-opus-5-5`，審稿模型 `claude-sonnet-5-5`；可用
  `CCHESS_WRITER_MODEL` / `CCHESS_REVIEWER_MODEL` 覆寫。
- 可續跑：已有講解的節點會略過。想重做某一段，把 JSON 裡那一筆刪掉再跑。
- 沒通過審稿的段落會留在 JSON 裡（`reviewed: false` 並附 `concerns`），前端不會採用，方便人工檢查。

## 品質把關的位置

| 風險 | 擋在哪裡 |
|---|---|
| LLM 編造著法 | `validateMoves`：講解裡每個記譜記號都必須出現在提供的資料裡，否則退回重寫 |
| LLM 誇大或推論過頭 | 第二個模型審稿，不通過就帶著意見重寫，三次仍不過就標記不採用 |
| 引擎開局品味與人類不同 | 主線取自人類實戰；引擎排名只當參考顯示，不改變主線 |
| 懲罰線不合法 | `pvToChinese` 轉記譜時逐步驗證合法性，不合法就截斷 |
