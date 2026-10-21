import { describe, expect, it } from "vitest";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";
import { rawOpenings } from "../src/content/openings";
import { mainLine, walk } from "../src/content/tree";
import type { AnalysisFile } from "../src/content/analysis-types";

const files = import.meta.glob<AnalysisFile>("../src/content/analysis/*.json", { eager: true, import: "default" });
const byOpening = new Map(Object.values(files).map((f) => [f.opening, f]));

/**
 * 引擎分析存在時，書上的著法不可以是明顯的壞棋。
 * 主線與「也可以」的變著：損失必須小於 150（深度 12 的傳統評估偶爾有品味差異，留一點空間）；
 * 錯著：損失必須至少 100，不然不該叫錯著。
 */
describe("書上著法對照引擎", () => {
  for (const opening of rawOpenings) {
    const a = byOpening.get(opening.id);
    if (!a) continue;
    it(`${opening.title}：主線與變著不是壞棋、錯著確實是壞棋`, () => {
      const problems: string[] = [];
      for (const { node, path } of walk(opening.root)) {
        let pos = startPosition();
        for (const n of path) pos = makeMove(pos, parseChinese(pos, n.move));
        const pa = a.positions[toFEN(pos)];
        if (!pa) continue;
        const ev = pa.moves.find((m) => m.zh === node.move);
        if (!ev || ev.cpLoss === null) continue;
        const kind = node.kind ?? "main";
        if (kind !== "mistake" && ev.cpLoss >= 150) problems.push(`${node.move}（${kind}）損失 ${ev.cpLoss}`);
        if (kind === "mistake" && ev.cpLoss < 100) problems.push(`${node.move}（錯著）損失只有 ${ev.cpLoss}`);
      }
      expect(problems, problems.join("；")).toEqual([]);
    });
    it(`${opening.title}：主線每個局面都有分析`, () => {
      let pos = startPosition();
      for (const node of mainLine(opening)) {
        expect(a.positions[toFEN(pos)], `缺 ${node.move} 之前的局面`).toBeDefined();
        pos = makeMove(pos, parseChinese(pos, node.move));
      }
    });
  }
});
