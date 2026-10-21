/**
 * 精簡版事實清單：給人（或在對話中的模型）撰寫講解用。
 * 比 explain.ts --dry-run 短很多：每個節點只列引擎前三名與書上著法；
 * 每個局面的錯著候選依「初學者會不會走」排序，只取前幾個，懲罰線只列三步。
 *
 * 用法：npx tsx pipeline/facts.ts <opening-id> [--mistakes 6]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";
import { moveFeatures } from "../src/engine/features";
import { typeOf, type Position } from "../src/engine/types";
import { rawOpenings } from "../src/content/openings";
import { walk } from "../src/content/tree";
import type { AnalysisFile, MoveEval } from "../src/content/analysis-types";

const id = process.argv[2];
const args = process.argv.slice(3);
const nMist = Number(args[args.indexOf("--mistakes") + 1] || 6);
const opening = rawOpenings.find((o) => o.id === id);
if (!opening) throw new Error(`找不到開局 ${id}`);
const aPath = path.resolve("src/content/analysis", `${opening.id}.json`);
if (!existsSync(aPath)) throw new Error(`沒有分析檔 ${aPath}`);
const analysis = JSON.parse(readFileSync(aPath, "utf8")) as AnalysisFile;

function shortFacts(pos: Position, zh: string): string {
  const f = moveFeatures(pos, parseChinese(pos, zh));
  const parts: string[] = [];
  if (f.captured) parts.push(`吃${f.captured}`);
  if (f.givesCheck) parts.push("將軍");
  const atk = f.attacks.filter((a) => a.undefended || /車/.test(a.name));
  if (atk.length) parts.push(`捉${atk.map((a) => a.name + (a.undefended ? "(無根)" : "")).join("、")}`);
  if (f.hanging.length) parts.push(`己方${f.hanging.map((h) => `${h.name}被${h.by}`).join("、")}`);
  if (f.develops) parts.push("出子");
  if (f.crossesRiver) parts.push("過河");
  return parts.join("；");
}

/** 初學者會不會走這步：越像出子、吃子、推兵越高分 */
function naturalness(pos: Position, m: MoveEval): number {
  const mv = parseChinese(pos, m.zh);
  const p = pos.board[mv.from]!;
  const f = moveFeatures(pos, mv);
  let s = 0;
  if (f.develops) s += 2;
  if (f.captured) s += 2;
  if (f.crossesRiver) s += 1;
  const t = typeOf(p);
  if (t === "K") s -= 4;
  if (t === "A") s -= 2;
  if (t === "B") s -= 1;
  if (t === "P") s += 1;
  return s;
}

const seen = new Set<string>();
console.log(`# ${opening.title}（${opening.id}）引擎 ${analysis.engine.name.split(" ")[0]} 深度 ${analysis.engine.depth}\n`);
for (const { node, path: nodePath } of walk(opening.root)) {
  let pos = startPosition();
  for (const n of nodePath) pos = makeMove(pos, parseChinese(pos, n.move));
  const fen = toFEN(pos);
  const pa = analysis.positions[fen];
  const key = [...nodePath, node].map((n) => n.move).join("/");
  const side = pos.turn === "r" ? "紅" : "黑";
  console.log(`## NODE ${key}`);
  console.log(`${side}走 ${node.move}（${node.kind ?? "main"}）事實：${shortFacts(pos, node.move) || "—"}`);
  if (pa) {
    const top = pa.moves.slice(0, 3).map((m, i) => `#${i + 1} ${m.zh}(${m.cp})`).join("  ");
    const me = pa.moves.find((m) => m.zh === node.move);
    const rank = me ? pa.moves.indexOf(me) + 1 : "?";
    console.log(`引擎：${top}｜此步 #${rank} 損失 ${me?.cpLoss ?? "?"}｜主變 ${me?.pvZh.slice(0, 6).join(" ") ?? ""}`);
  }
  console.log("");

  if (pa && !seen.has(fen)) {
    seen.add(fen);
    const siblings = new Set((nodePath.length ? nodePath[nodePath.length - 1]!.children ?? [] : opening.root).map((c) => c.move));
    const cands = pa.moves
      .filter((m) => m.cpLoss !== null && m.cpLoss >= 100 && m.pvZh.length >= 2 && !siblings.has(m.zh))
      .map((m) => ({ m, n: naturalness(pos, m) }))
      .sort((a, b) => b.n - a.n || (b.m.cpLoss ?? 0) - (a.m.cpLoss ?? 0))
      .slice(0, nMist);
    if (cands.length) {
      console.log(`## MISTAKES @ ${nodePath.map((n) => n.move).join("/")}  （${side}走，引擎最佳 ${pa.moves[0]?.zh}）`);
      for (const { m } of cands) {
        let p = pos;
        const steps = m.pvZh.slice(0, 4).map((zh) => {
          const f = shortFacts(p, zh);
          p = makeMove(p, parseChinese(p, zh));
          return `${zh}［${f || "—"}］`;
        });
        console.log(`- ${m.zh} 損失${m.cpLoss}：${steps.join(" → ")}`);
      }
      console.log("");
    }
  }
}
