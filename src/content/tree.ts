/**
 * 開局樹的純函式：走訪、主線、合併產線講解。
 * 不碰 Vite 專用的 import.meta.glob，所以產線腳本（Node）也能用。
 */
import type { Opening, OpeningNode } from "./types";
import type { ExplanationsFile } from "./explanations-types";
import { makeMove, startPosition, toFEN } from "../engine/board";
import { parseChinese } from "../engine/notation";
import type { Position } from "../engine/types";

/** 主線：從根開始，每層取第一個 main 節點 */
export function mainLine(opening: Opening): OpeningNode[] {
  const line: OpeningNode[] = [];
  let children: OpeningNode[] | undefined = opening.root;
  while (children) {
    const next: OpeningNode | undefined = children.find((n) => (n.kind ?? "main") === "main");
    if (!next) break;
    line.push(next);
    children = next.children;
  }
  return line;
}

/** 走訪整棵樹（含主線、變著、錯著） */
export function* walk(
  nodes: OpeningNode[],
  path: OpeningNode[] = [],
): Generator<{ node: OpeningNode; path: OpeningNode[] }> {
  for (const node of nodes) {
    yield { node, path };
    if (node.children) yield* walk(node.children, [...path, node]);
  }
}

/**
 * 把產線的講解合併進手寫的開局樹：
 * - 有產生且通過審稿的節點，取代手寫的 note / detail / principle
 * - 產線挑出的常見錯誤，加進該局面的子節點（kind: mistake，附懲罰線）
 * - 所有主線節點都有通過審稿的講解時，整個開局標為 verified
 */
export function applyExplanations(opening: Opening, g: ExplanationsFile | undefined): Opening {
  if (!g) return opening;
  const clone: Opening = structuredClone(opening);
  let allMainVerified = true;

  const visit = (nodes: OpeningNode[], path: OpeningNode[], pos: Position) => {
    const fen = toFEN(pos);
    for (const node of nodes) {
      const key = [...path, node].map((n) => n.move).join("/");
      const gen = g.nodes[key];
      if (gen && gen.reviewed) {
        node.note = gen.note;
        node.detail = gen.detail;
        if (gen.principle) node.principle = gen.principle;
        node.verified = true;
      } else if ((node.kind ?? "main") === "main") {
        allMainVerified = false;
      }
      if (node.children) visit(node.children, [...path, node], makeMove(pos, parseChinese(pos, node.move)));
    }
    for (const mk of g.mistakes[fen] ?? []) {
      if (!mk.reviewed || nodes.some((n) => n.move === mk.zh)) continue;
      nodes.push({
        move: mk.zh,
        kind: "mistake",
        note: mk.note,
        detail: mk.detail,
        principle: mk.principle,
        punish: mk.punish,
        punishSummary: mk.summary,
        verified: true,
      });
    }
  };
  visit(clone.root, [], startPosition());
  clone.verified = allMainVerified;
  return clone;
}
