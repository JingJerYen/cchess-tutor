/**
 * 把人工（或在對話中由模型）撰寫的講解匯入成 src/content/explanations/<id>.json，
 * 並套用和自動產線完全相同的驗證：
 *   - 每個節點 key 必須存在於開局樹
 *   - 講解裡提到的著法只能是：走到這裡的著法、該局面引擎列出的著法與主變
 *   - 錯著必須是引擎資料裡的著法；懲罰線必須是引擎主變的前綴
 *
 * 用法：npx tsx pipeline/import-manual.ts pipeline/manual/<id>.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";
import type { Position } from "../src/engine/types";
import { rawOpenings } from "../src/content/openings";
import { walk } from "../src/content/tree";
import type { AnalysisFile, PositionAnalysis } from "../src/content/analysis-types";
import type { ExplanationsFile, GeneratedMistake } from "../src/content/explanations-types";
import { validateMoves } from "./validate";

interface ManualFile {
  opening: string;
  model: string;
  nodes: Record<string, { note: string; detail: string; principle?: string }>;
  /** key 是路徑（「」代表起始局面） */
  mistakesByPath: Record<string, Omit<GeneratedMistake, "reviewed" | "concerns">[]>;
}

const src = process.argv[2];
if (!src) throw new Error("請指定來源檔");
const manual = JSON.parse(readFileSync(src, "utf8")) as ManualFile;
const opening = rawOpenings.find((o) => o.id === manual.opening);
if (!opening) throw new Error(`找不到開局 ${manual.opening}`);
const aPath = path.resolve("src/content/analysis", `${opening.id}.json`);
const analysis: AnalysisFile | null = existsSync(aPath) ? JSON.parse(readFileSync(aPath, "utf8")) : null;

const errors: string[] = [];
const treeKeys = new Map<string, { pathMoves: string[]; pos: Position }>();
for (const { node, path: nodePath } of walk(opening.root)) {
  let pos = startPosition();
  for (const n of nodePath) pos = makeMove(pos, parseChinese(pos, n.move));
  treeKeys.set([...nodePath, node].map((n) => n.move).join("/"), { pathMoves: nodePath.map((n) => n.move), pos });
}

function allowedFor(pathMoves: string[], pa: PositionAnalysis | undefined): Set<string> {
  const allowed = new Set(pathMoves);
  if (pa) for (const m of pa.moves) { allowed.add(m.zh); m.pvZh.forEach((z) => allowed.add(z)); }
  return allowed;
}

const out: ExplanationsFile = { opening: opening.id, model: manual.model, generatedAt: new Date().toISOString(), nodes: {}, mistakes: {} };

for (const [key, g] of Object.entries(manual.nodes)) {
  const t = treeKeys.get(key);
  if (!t) { errors.push(`節點不存在：${key}`); continue; }
  const pa = analysis?.positions[toFEN(t.pos)];
  const allowed = allowedFor(t.pathMoves, pa);
  allowed.add(key.split("/").pop()!);
  const bad = validateMoves([g.note, g.detail, g.principle ?? ""], allowed);
  if (bad.length) errors.push(`${key}：提到資料裡沒有的著法 ${bad.join("、")}`);
  if (!g.note || !g.detail) errors.push(`${key}：note/detail 不可為空`);
  out.nodes[key] = { note: g.note, detail: g.detail, principle: g.principle || undefined, reviewed: true };
}
for (const key of treeKeys.keys()) if (!manual.nodes[key]) errors.push(`缺少節點講解：${key}`);

for (const [pathKey, list] of Object.entries(manual.mistakesByPath)) {
  const pathMoves = pathKey ? pathKey.split("/") : [];
  let pos = startPosition();
  try { for (const m of pathMoves) pos = makeMove(pos, parseChinese(pos, m)); }
  catch (e) { errors.push(`錯著路徑無效：${pathKey}（${(e as Error).message}）`); continue; }
  const fen = toFEN(pos);
  const pa = analysis?.positions[fen];
  if (!pa) { errors.push(`錯著 @${pathKey}：沒有引擎分析`); continue; }
  const allowed = allowedFor(pathMoves, pa);
  const results: GeneratedMistake[] = [];
  for (const mk of list) {
    const ev = pa.moves.find((m) => m.zh === mk.zh);
    if (!ev) { errors.push(`錯著 @${pathKey} ${mk.zh}：引擎資料裡沒有這步`); continue; }
    if (ev.cpLoss === null || ev.cpLoss < 100) errors.push(`錯著 @${pathKey} ${mk.zh}：引擎損失只有 ${ev.cpLoss}，不算錯著`);
    mk.punish.forEach((p, i) => {
      if (ev.pvZh[i + 1] !== p.move) errors.push(`錯著 @${pathKey} ${mk.zh}：懲罰線第 ${i + 1} 步應為 ${ev.pvZh[i + 1]}，寫的是 ${p.move}`);
    });
    if (!mk.punish.length) errors.push(`錯著 @${pathKey} ${mk.zh}：沒有懲罰線`);
    const bad = validateMoves([mk.note, mk.detail ?? "", mk.summary, mk.principle ?? "", ...mk.punish.map((p) => p.note)], allowed);
    if (bad.length) errors.push(`錯著 @${pathKey} ${mk.zh}：提到資料裡沒有的著法 ${bad.join("、")}`);
    results.push({ ...mk, principle: mk.principle || undefined, reviewed: true });
  }
  if (results.length) out.mistakes[fen] = results;
}

if (errors.length) {
  console.error(`驗證失敗（${errors.length} 項）：\n- ` + errors.join("\n- "));
  process.exit(1);
}
const outPath = path.resolve("src/content/explanations", `${opening.id}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 1));
const nMist = Object.values(out.mistakes).reduce((a, l) => a + l.length, 0);
console.error(`通過驗證：${Object.keys(out.nodes).length} 個節點、${nMist} 個錯著 → ${outPath}`);
