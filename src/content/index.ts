import type { Opening, OpeningNode } from "./types";
import { opening as c7x } from "./openings/c7x-zhongpao-guohe-che";

export const openings: Opening[] = [c7x];

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

/** 走訪整棵樹（含主線、變著、錯著），給測試與統計用 */
export function* walk(
  nodes: OpeningNode[],
  path: OpeningNode[] = [],
): Generator<{ node: OpeningNode; path: OpeningNode[] }> {
  for (const node of nodes) {
    yield { node, path };
    if (node.children) yield* walk(node.children, [...path, node]);
  }
}
