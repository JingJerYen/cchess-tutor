/**
 * 離線產線第一步：用引擎分析開局樹的每個節點。
 *
 * 對樹上的每個局面（每一步之前）：
 *   1. 把所有合法著法都搜一遍（MultiPV = 合法著法數），得到每步的分數與主變。
 *      這就是「如果我走這步呢？」的事實來源：每一步都有評價，壞棋附懲罰線。
 *   2. 記錄書上著法（主線／變著）在引擎眼中的排名與損失。
 *
 * 輸出 src/content/analysis/<opening-id>.json，由前端直接載入。
 *
 * 用法：
 *   npx tsx pipeline/analyze.ts [--depth 12] [--only <opening-id>]
 *   CCHESS_ENGINE=/path/to/pikafish npx tsx pipeline/analyze.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { legalMoves } from "../src/engine/moves";
import { moveToChinese, parseChinese } from "../src/engine/notation";
import { moveFromICCS, moveToICCS, type Position } from "../src/engine/types";
import { rawOpenings as openings } from "../src/content/openings";
import { walk } from "../src/content/tree";
import type { OpeningNode } from "../src/content/types";
import { engineFromEnv, type EngineLine } from "./engine";
import type { AnalysisFile, MoveEval, PositionAnalysis } from "../src/content/analysis-types";

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const DEPTH = Number(arg("depth") ?? 12);
const ONLY = arg("only");
const OUT_DIR = path.resolve("src/content/analysis");

/** 把引擎的主變轉成中文記譜（遇到不合法就截斷，保證前端播得出來） */
function pvToChinese(pos: Position, pv: string[]): string[] {
  const out: string[] = [];
  let p = pos;
  for (const iccs of pv) {
    try {
      const m = moveFromICCS(iccs);
      const legal = legalMoves(p).some((lm) => lm.from === m.from && lm.to === m.to);
      if (!legal) break;
      out.push(moveToChinese(p, m));
      p = makeMove(p, m);
    } catch {
      break;
    }
  }
  return out;
}

function lineToEval(pos: Position, l: EngineLine, bestCp: number | null): MoveEval {
  const m = moveFromICCS(l.move);
  const score = l.mate !== null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : (l.cp ?? 0);
  const best = bestCp ?? score;
  return {
    iccs: l.move,
    zh: moveToChinese(pos, m),
    cp: l.cp,
    mate: l.mate,
    cpLoss: Math.max(0, best - score),
    pv: l.pv.slice(0, 10),
    pvZh: pvToChinese(pos, l.pv.slice(0, 10)),
  };
}

async function main(): Promise<void> {
  const engine = engineFromEnv();
  await engine.init();
  console.error(`引擎：${engine.name}，深度 ${DEPTH}`);
  mkdirSync(OUT_DIR, { recursive: true });

  for (const opening of openings) {
    if (ONLY && opening.id !== ONLY) continue;
    const outPath = path.join(OUT_DIR, `${opening.id}.json`);
    // 可續跑：已分析過的局面直接沿用
    const prev: AnalysisFile | null = existsSync(outPath)
      ? (JSON.parse(readFileSync(outPath, "utf8")) as AnalysisFile)
      : null;
    const positions: Record<string, PositionAnalysis> = prev?.engine.depth === DEPTH ? prev.positions : {};

    // 收集所有需要分析的局面：每個節點之前的局面
    const todo = new Map<string, { pos: Position; bookMoves: Set<string> }>();
    const add = (pos: Position, node: OpeningNode | null) => {
      const fen = toFEN(pos);
      const entry = todo.get(fen) ?? { pos, bookMoves: new Set<string>() };
      if (node) entry.bookMoves.add(node.move);
      todo.set(fen, entry);
    };
    for (const { node, path: nodePath } of walk(opening.root)) {
      let pos = startPosition();
      for (const n of nodePath) pos = makeMove(pos, parseChinese(pos, n.move));
      add(pos, node);
      // 主線的最後一步之後的局面也分析，讓使用者走到底還能問
      if (!node.children?.length && (node.kind ?? "main") === "main") {
        add(makeMove(pos, parseChinese(pos, node.move)), null);
      }
    }

    let i = 0;
    for (const [fen, { pos, bookMoves }] of todo) {
      i++;
      if (positions[fen]) {
        console.error(`[${i}/${todo.size}] 已有，略過`);
        continue;
      }
      const moves = legalMoves(pos);
      const t0 = Date.now();
      const lines = await engine.analyze(fen, { depth: DEPTH, multipv: moves.length });
      const bestLine = lines[0];
      const bestCp = bestLine
        ? bestLine.mate !== null
          ? (bestLine.mate > 0 ? 10000 - bestLine.mate : -10000 - bestLine.mate)
          : bestLine.cp
        : null;
      const evals = lines.map((l) => lineToEval(pos, l, bestCp));
      // 引擎偶爾漏掉某些著法（例如被剪枝到沒有 pv），補上但標記未知
      const seen = new Set(evals.map((e) => e.iccs));
      for (const m of moves) {
        const iccs = moveToICCS(m);
        if (!seen.has(iccs)) evals.push({ iccs, zh: moveToChinese(pos, m), cp: null, mate: null, cpLoss: null, pv: [], pvZh: [] });
      }
      positions[fen] = {
        turn: pos.turn,
        depth: DEPTH,
        moves: evals,
        book: [...bookMoves].map((zh) => {
          const idx = evals.findIndex((e) => e.zh === zh);
          return { zh, rank: idx >= 0 ? idx + 1 : null, cpLoss: evals[idx]?.cpLoss ?? null };
        }),
      };
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const bookStr = positions[fen]!.book.map((b) => `${b.zh}#${b.rank}(-${b.cpLoss})`).join(" ");
      console.error(`[${i}/${todo.size}] ${secs}s 最佳 ${evals[0]?.zh} ${evals[0]?.cp}  書 ${bookStr}`);

      const file: AnalysisFile = {
        opening: opening.id,
        engine: { name: engine.name, depth: DEPTH },
        generatedAt: new Date().toISOString(),
        positions,
      };
      writeFileSync(outPath, JSON.stringify(file, null, 1));
    }
    console.error(`寫入 ${outPath}`);
  }
  engine.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
