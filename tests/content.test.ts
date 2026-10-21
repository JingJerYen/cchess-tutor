import { describe, expect, it } from "vitest";
import { makeMove, startPosition } from "../src/engine/board";
import { parseChinese, moveToChinese } from "../src/engine/notation";
import { mainLine, openings, walk } from "../src/content";
import type { OpeningNode } from "../src/content/types";
import type { Position } from "../src/engine/types";

/** 沿著 path 走到某個節點之前的局面 */
function positionBefore(path: OpeningNode[]): Position {
  let pos = startPosition();
  for (const n of path) pos = makeMove(pos, parseChinese(pos, n.move));
  return pos;
}

describe("開局樹資料", () => {
  for (const opening of openings) {
    describe(opening.title, () => {
      it("主線每一步都合法，記譜寫法標準", () => {
        let pos = startPosition();
        for (const node of mainLine(opening)) {
          const m = parseChinese(pos, node.move);
          expect(moveToChinese(pos, m)).toBe(node.move);
          pos = makeMove(pos, m);
        }
      });

      it("所有變著與錯著都合法，懲罰線也合法", () => {
        for (const { node, path } of walk(opening.root)) {
          const before = positionBefore(path);
          const m = parseChinese(before, node.move);
          expect(moveToChinese(before, m), `${node.move} 的寫法`).toBe(node.move);
          if (node.punish) {
            let pos = makeMove(before, m);
            for (const step of node.punish) {
              const pm = parseChinese(pos, step.move);
              expect(moveToChinese(pos, pm), `${step.move} 的寫法`).toBe(step.move);
              pos = makeMove(pos, pm);
            }
          }
        }
      });

      it("每個節點都有說明；錯著必須附推演", () => {
        for (const { node } of walk(opening.root)) {
          expect(node.note.length, `${node.move} 缺少說明`).toBeGreaterThan(0);
          if (node.kind === "mistake") {
            expect(node.punish?.length, `${node.move} 是錯著但沒有推演`).toBeGreaterThan(0);
          }
        }
      });

      it("同一節點下的著法不重複", () => {
        for (const { node } of walk(opening.root)) {
          const moves = (node.children ?? []).map((c) => c.move);
          expect(new Set(moves).size).toBe(moves.length);
        }
        const rootMoves = opening.root.map((c) => c.move);
        expect(new Set(rootMoves).size).toBe(rootMoves.length);
      });
    });
  }
});
