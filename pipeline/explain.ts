/**
 * 離線產線第二步：用 Claude 把引擎事實寫成人話，並自動驗證＋審稿。
 *
 * 原則：LLM 不算棋。它拿到的是
 *   - 走到這裡的著法序列（中文記譜）
 *   - 引擎對此局面所有著法的排名、損失、主變（中文記譜）
 *   - 程式算出的特徵（吃子、將軍、捉子、無根）
 * 它只負責解釋。產出的每一個著法記號都會對照「允許清單」（引擎與事實裡出現過的著法），
 * 出現沒見過的著法就退回重寫；最後由第二個模型審稿。
 *
 * 用法：
 *   ANTHROPIC_API_KEY=... npx tsx pipeline/explain.ts [--only <id>] [--limit N] [--dry-run]
 *   --dry-run 只印出會送出的提示，不呼叫 API。
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";
import { featuresToText, moveFeatures } from "../src/engine/features";
import type { Position } from "../src/engine/types";
import { rawOpenings as openings } from "../src/content/openings";
import { walk } from "../src/content/tree";
import type { Opening, OpeningNode } from "../src/content/types";
import type { AnalysisFile, PositionAnalysis } from "../src/content/analysis-types";
import type { ExplanationsFile, GeneratedMistake, GeneratedNode } from "../src/content/explanations-types";

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes("--dry-run");
const ONLY = arg("only");
const LIMIT = Number(arg("limit") ?? Infinity);
const WRITER_MODEL = process.env.CCHESS_WRITER_MODEL ?? "claude-opus-5-5";
const REVIEWER_MODEL = process.env.CCHESS_REVIEWER_MODEL ?? "claude-sonnet-5-5";

const ANALYSIS_DIR = path.resolve("src/content/analysis");
const OUT_DIR = path.resolve("src/content/explanations");

// ---------- 輸出格式 ----------

const NodeSchema = z.object({
  note: z.string().describe("一句話重點，30 字以內，說這步在做什麼、為什麼"),
  detail: z.string().describe("詳細說明，80–150 字，只根據提供的事實"),
  principle: z.string().describe("可以帶走的原則，15 字以內；沒有合適的就空字串"),
});

const MistakeSchema = z.object({
  mistakes: z.array(
    z.object({
      move: z.string().describe("錯著的中文記譜，必須是候選清單裡的"),
      note: z.string().describe("一句話說這步壞在哪裡，30 字以內"),
      detail: z.string().describe("60–120 字，解釋為什麼"),
      punishNotes: z.array(z.string()).describe("對應懲罰線每一步的一句說明，數量必須等於給定的步數"),
      summary: z.string().describe("推演結束後的結論，40 字以內"),
      principle: z.string().describe("原則，15 字以內；可空"),
    }),
  ),
});

const ReviewSchema = z.object({
  ok: z.boolean().describe("講解是否與事實一致、沒有誇大、沒有編造"),
  concerns: z.array(z.string()).describe("具體問題，每條一句；ok 時為空陣列"),
});

// ---------- 事實整理 ----------

const SYSTEM = `你是象棋教練，學生是只懂規則的成年初學者。你用繁體中文、口語、短句說明。
鐵律：
1. 你不自己算棋。所有關於「接下來會怎樣」的判斷，只能來自提供的引擎資料與事實清單。
2. 只能提到資料裡出現過的著法。不要自己發明著法。
3. 不確定就不要說。寧可少講，不要講錯。不要誇大（「必勝」「崩潰」這類詞不要用，除非引擎顯示殺棋或損失超過一個車）。
4. 用初學者聽得懂的話：解釋「為什麼」和「接下來的計畫」，不要堆術語。可用的術語：出子、活馬、當頭炮、屏風馬、過河車、巡河車、兌子、牽制、無根、捉子、補士、固防。
5. 一個數字的意義：引擎分數 100 ≈ 一個兵的價值；損失 30 以內算差不多，100 以上算明顯吃虧。`;

function historyText(nodePath: OpeningNode[]): string {
  if (!nodePath.length) return "（開局，紅方先走）";
  const parts: string[] = [];
  nodePath.forEach((n, i) => {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}. ${n.move}`);
    else parts[parts.length - 1] += ` ${n.move}`;
  });
  return parts.join("　");
}

function engineText(pa: PositionAnalysis, highlight: string[], top = 4): string {
  const lines = pa.moves.slice(0, top).map((m, i) =>
    `  第 ${i + 1} 名 ${m.zh}（分數 ${m.cp ?? (m.mate !== null ? `殺 ${m.mate}` : "?")}，主變：${m.pvZh.slice(0, 6).join(" ")}）`,
  );
  for (const zh of highlight) {
    const i = pa.moves.findIndex((m) => m.zh === zh);
    if (i >= top) {
      const m = pa.moves[i]!;
      lines.push(`  第 ${i + 1} 名 ${m.zh}（損失 ${m.cpLoss}，主變：${m.pvZh.slice(0, 6).join(" ")}）`);
    }
  }
  return `引擎（深度 ${pa.depth}）對此局面 ${pa.moves.length} 個合法著法的排名：\n${lines.join("\n")}`;
}

function factsForMove(pos: Position, zh: string): string {
  const m = parseChinese(pos, zh);
  return featuresToText(moveFeatures(pos, m));
}

/** 文字裡出現的所有中文記譜記號 */
const MOVE_RE = /[前中後]?[車馬炮砲相象仕士兵卒帥將][一二三四五六七八九1-9]?[進退平][一二三四五六七八九1-9]/g;
function movesMentioned(text: string): string[] {
  return [...new Set(text.match(MOVE_RE) ?? [])];
}

/** 檢查文字裡提到的著法是否都在允許清單裡；回傳違規項目 */
function validateMoves(texts: string[], allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const t of texts) for (const m of movesMentioned(t)) if (!allowed.has(m)) bad.push(m);
  return [...new Set(bad)];
}

// ---------- LLM 呼叫 ----------

const client = DRY ? null : new Anthropic();

async function ask<T>(model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  if (!client) throw new Error("dry-run");
  const res = await client.messages.parse({
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "high", format: zodOutputFormat(schema) },
  });
  if (res.stop_reason === "refusal") throw new Error(`模型拒絕回答（${res.stop_details?.category ?? "?"}）`);
  if (!res.parsed_output) throw new Error("模型沒有回傳符合格式的 JSON");
  return res.parsed_output as T;
}

async function review(facts: string, text: string): Promise<{ ok: boolean; concerns: string[] }> {
  const user = `以下是給初學者的象棋講解，以及它應該依據的事實。請嚴格檢查：
- 講解裡的每個判斷是否都能從事實推出？
- 有沒有提到事實裡沒有的著法或結果？
- 有沒有誇大？
- 初學者看得懂嗎？

【事實】
${facts}

【講解】
${text}`;
  return ask(REVIEWER_MODEL, "你是嚴格的象棋編輯，只看證據。", user, ReviewSchema);
}

// ---------- 主流程 ----------

async function explainNode(
  opening: Opening,
  node: OpeningNode,
  nodePath: OpeningNode[],
  pos: Position,
  pa: PositionAnalysis | undefined,
): Promise<GeneratedNode | null> {
  const kind = node.kind ?? "main";
  const kindText = kind === "main" ? "本課主線" : kind === "alt" ? "可行的變著（本課不展開）" : "常見錯誤";
  const facts = [
    `開局：${opening.title}。${opening.summary}`,
    `走到這裡的著法：${historyText(nodePath)}`,
    `現在輪到${pos.turn === "r" ? "紅" : "黑"}方。要解釋的這一步：${node.move}（${kindText}）`,
    `這一步的事實：${factsForMove(pos, node.move)}`,
    pa ? engineText(pa, [node.move]) : "（沒有引擎資料）",
    node.note ? `人工草稿（僅供參考，可能不準）：${node.note}${node.detail ? " " + node.detail : ""}` : "",
  ].filter(Boolean).join("\n\n");

  const allowed = new Set<string>([node.move]);
  for (const n of nodePath) allowed.add(n.move);
  if (pa) for (const m of pa.moves) { allowed.add(m.zh); m.pvZh.forEach((z) => allowed.add(z)); }

  const user = `${facts}\n\n請寫出 note、detail、principle。detail 要回答：這步在做什麼？為什麼現在走？接下來的計畫是什麼？`;
  if (DRY) { console.log("=== NODE", nodePath.map((n) => n.move).join("/"), node.move, "\n", user, "\n"); return null; }

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await ask(WRITER_MODEL, SYSTEM, lastError ? `${user}\n\n上一版的問題：${lastError}，請修正。` : user, NodeSchema);
    const bad = validateMoves([out.note, out.detail, out.principle], allowed);
    if (bad.length) { lastError = `提到了資料裡沒有的著法：${bad.join("、")}`; continue; }
    const r = await review(facts, `${out.note}\n${out.detail}\n${out.principle}`);
    if (!r.ok && attempt < 2) { lastError = `審稿意見：${r.concerns.join("；")}`; continue; }
    return { note: out.note, detail: out.detail, principle: out.principle || undefined, reviewed: r.ok, concerns: r.ok ? undefined : r.concerns };
  }
  console.error(`  放棄：${node.move}（${lastError}）`);
  return null;
}

async function explainMistakes(
  opening: Opening,
  nodePath: OpeningNode[],
  pos: Position,
  pa: PositionAnalysis,
  existing: Set<string>,
): Promise<GeneratedMistake[]> {
  // 候選：損失 ≥ 100 且引擎有給主變，排除樹上已有的
  const candidates = pa.moves
    .filter((m) => m.cpLoss !== null && m.cpLoss >= 100 && m.pvZh.length >= 2 && !existing.has(m.zh))
    .slice(0, 12);
  if (!candidates.length) return [];

  const candText = candidates.map((m) => {
    let p = pos;
    const steps = m.pvZh.slice(0, 5).map((zh) => {
      const f = factsForMove(p, zh);
      p = makeMove(p, parseChinese(p, zh));
      return `${zh}［${f}］`;
    });
    return `- ${m.zh}：損失 ${m.cpLoss}。懲罰線（${steps.length} 步）：${steps.join(" → ")}`;
  }).join("\n");

  const facts = [
    `開局：${opening.title}。`,
    `走到這裡的著法：${historyText(nodePath)}`,
    `現在輪到${pos.turn === "r" ? "紅" : "黑"}方。引擎最佳：${pa.moves[0]?.zh}。`,
    `以下是引擎認為明顯吃虧的著法，每步附懲罰線與每一步的事實：\n${candText}`,
  ].join("\n\n");
  const user = `${facts}

請從候選裡挑出最多 3 個「初學者最可能走」的錯著（看起來自然、像在出子或吃子的那種；明顯亂走的不要挑），每個寫 note、detail、punishNotes（數量必須等於該懲罰線的步數，每句說明那一步在做什麼、為什麼厲害）、summary、principle。`;
  if (DRY) { console.log("=== MISTAKES", nodePath.map((n) => n.move).join("/"), "\n", user, "\n"); return []; }

  const allowed = new Set<string>();
  for (const n of nodePath) allowed.add(n.move);
  for (const m of pa.moves) { allowed.add(m.zh); m.pvZh.forEach((z) => allowed.add(z)); }

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await ask(WRITER_MODEL, SYSTEM, lastError ? `${user}\n\n上一版的問題：${lastError}，請修正。` : user, MistakeSchema);
    const problems: string[] = [];
    const results: GeneratedMistake[] = [];
    for (const mk of out.mistakes) {
      const cand = candidates.find((c) => c.zh === mk.move);
      if (!cand) { problems.push(`${mk.move} 不在候選清單`); continue; }
      const steps = cand.pvZh.slice(0, 5);
      if (mk.punishNotes.length !== steps.length) { problems.push(`${mk.move} 的 punishNotes 應有 ${steps.length} 句`); continue; }
      const bad = validateMoves([mk.note, mk.detail, mk.summary, ...mk.punishNotes], allowed);
      if (bad.length) { problems.push(`${mk.move} 提到資料裡沒有的著法：${bad.join("、")}`); continue; }
      results.push({
        zh: mk.move, note: mk.note, detail: mk.detail,
        punish: steps.slice(1).map((move, i) => ({ move, note: mk.punishNotes[i + 1] ?? "" })),
        summary: mk.summary, principle: mk.principle || undefined, reviewed: false,
      });
    }
    if (problems.length && attempt < 2) { lastError = problems.join("；"); continue; }
    for (const r of results) {
      const rv = await review(facts, `${r.zh}：${r.note}\n${r.detail}\n${r.punish.map((p) => `${p.move}：${p.note}`).join("\n")}\n${r.summary}`);
      r.reviewed = rv.ok;
      if (!rv.ok) r.concerns = rv.concerns;
    }
    return results;
  }
  console.error(`  放棄錯著（${lastError}）`);
  return [];
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const opening of openings) {
    if (ONLY && opening.id !== ONLY) continue;
    const aPath = path.join(ANALYSIS_DIR, `${opening.id}.json`);
    const analysis: AnalysisFile | null = existsSync(aPath) ? JSON.parse(readFileSync(aPath, "utf8")) : null;
    if (!analysis) console.error(`沒有引擎分析（${aPath}），講解品質會降低`);
    const outPath = path.join(OUT_DIR, `${opening.id}.json`);
    const out: ExplanationsFile = existsSync(outPath)
      ? JSON.parse(readFileSync(outPath, "utf8"))
      : { opening: opening.id, model: WRITER_MODEL, generatedAt: "", nodes: {}, mistakes: {} };

    const donePositions = new Set<string>();
    for (const { node, path: nodePath } of walk(opening.root)) {
      if (count >= LIMIT) break;
      const key = [...nodePath, node].map((n) => n.move).join("/");
      let pos = startPosition();
      for (const n of nodePath) pos = makeMove(pos, parseChinese(pos, n.move));
      const fen = toFEN(pos);
      const pa = analysis?.positions[fen];

      if (!out.nodes[key]) {
        console.error(`講解 ${key}`);
        const g = await explainNode(opening, node, nodePath, pos, pa);
        if (g) { out.nodes[key] = g; count++; }
      }
      if (pa && !donePositions.has(fen) && !out.mistakes[fen]) {
        donePositions.add(fen);
        console.error(`錯著 @ ${nodePath.map((n) => n.move).join("/") || "起始"}`);
        const siblings = new Set((nodePath.length ? nodePath[nodePath.length - 1]!.children ?? [] : opening.root).map((c) => c.move));
        const ms = await explainMistakes(opening, nodePath, pos, pa, siblings);
        if (ms.length) out.mistakes[fen] = ms;
      }
      if (!DRY) {
        out.generatedAt = new Date().toISOString();
        writeFileSync(outPath, JSON.stringify(out, null, 1));
      }
    }
    if (!DRY) console.error(`寫入 ${outPath}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
