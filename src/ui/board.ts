/**
 * 電子墨水友善的 SVG 棋盤。
 *
 * - 不用顏色區分紅黑：紅方棋子是雙圈白底，黑方棋子是單圈灰底。
 * - 沒有動畫；每次狀態改變就整個重畫（SVG 很小，重畫很快）。
 * - 觸控區是整格，方便手指點。
 */
import { type Move, type Position, type Square, FILES, RANKS, fileOf, rankOf, sq, sideOf } from "../engine/types";
import { pieceName } from "../engine/moves";

const CELL = 60;
const MARGIN = 58;
export const BOARD_W = CELL * (FILES - 1) + MARGIN * 2;
export const BOARD_H = CELL * (RANKS - 1) + MARGIN * 2;

export interface BoardOptions {
  /** 黑方在下 */
  flipped?: boolean;
  selected?: Square | null;
  /** 可走的目的地 */
  targets?: Square[];
  lastMove?: Move | null;
  /** 額外標記的格子（例如講解裡提到的位置） */
  marks?: Square[];
  onTap?: (s: Square) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function createBoard(container: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${BOARD_W} ${BOARD_H}`);
  svg.setAttribute("class", "board");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "象棋棋盤");
  container.appendChild(svg);
  return svg;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

function xy(s: Square, flipped: boolean): [number, number] {
  const f = flipped ? FILES - 1 - fileOf(s) : fileOf(s);
  const r = flipped ? rankOf(s) : RANKS - 1 - rankOf(s);
  return [MARGIN + f * CELL, MARGIN + r * CELL];
}

const RED_FILE_LABELS = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
const BLACK_FILE_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** 炮位與兵位的小記號 */
function drawPositionMark(g: SVGGElement, x: number, y: number, fileIndex: number): void {
  const d = 5, len = 12;
  const dirs: [number, number][] = [];
  if (fileIndex > 0) dirs.push([-1, -1], [-1, 1]);
  if (fileIndex < FILES - 1) dirs.push([1, -1], [1, 1]);
  for (const [sx, sy] of dirs) {
    const path = `M ${x + sx * d} ${y + sy * (d + len)} L ${x + sx * d} ${y + sy * d} L ${x + sx * (d + len)} ${y + sy * d}`;
    g.appendChild(el("path", { d: path, class: "mark" }));
  }
}

function drawGrid(svg: SVGSVGElement, flipped: boolean): void {
  const g = el("g", { class: "grid" });
  const left = MARGIN, right = MARGIN + CELL * (FILES - 1);
  const top = MARGIN, bottom = MARGIN + CELL * (RANKS - 1);

  // 橫線
  for (let r = 0; r < RANKS; r++) {
    const y = top + r * CELL;
    g.appendChild(el("line", { x1: left, y1: y, x2: right, y2: y }));
  }
  // 直線：兩側貫通，中間在河界斷開
  for (let f = 0; f < FILES; f++) {
    const x = left + f * CELL;
    if (f === 0 || f === FILES - 1) {
      g.appendChild(el("line", { x1: x, y1: top, x2: x, y2: bottom }));
    } else {
      g.appendChild(el("line", { x1: x, y1: top, x2: x, y2: top + 4 * CELL }));
      g.appendChild(el("line", { x1: x, y1: top + 5 * CELL, x2: x, y2: bottom }));
    }
  }
  // 外框加粗
  g.appendChild(el("rect", { x: left - 4, y: top - 4, width: right - left + 8, height: bottom - top + 8, class: "frame" }));
  // 九宮斜線（上下各一）
  for (const y0 of [top, bottom - 2 * CELL]) {
    g.appendChild(el("line", { x1: left + 3 * CELL, y1: y0, x2: left + 5 * CELL, y2: y0 + 2 * CELL }));
    g.appendChild(el("line", { x1: left + 5 * CELL, y1: y0, x2: left + 3 * CELL, y2: y0 + 2 * CELL }));
  }
  // 炮位、兵位記號
  for (const [f, rk] of [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]] as const) {
    const [x, y] = xy(sq(f, rk), flipped);
    drawPositionMark(g, x, y, flipped ? FILES - 1 - f : f);
  }
  // 河界
  const riverY = top + 4.5 * CELL;
  g.appendChild(el("text", { x: left + 2 * CELL, y: riverY, class: "river" }, "楚 河"));
  g.appendChild(el("text", { x: left + 6 * CELL, y: riverY, class: "river" }, "漢 界"));

  // 路數：下方是在下那一方的數字
  const bottomLabels = flipped ? [...BLACK_FILE_LABELS].reverse() : RED_FILE_LABELS;
  const topLabels = flipped ? [...RED_FILE_LABELS].reverse() : BLACK_FILE_LABELS;
  for (let i = 0; i < FILES; i++) {
    const x = left + i * CELL;
    g.appendChild(el("text", { x, y: bottom + 46, class: "coord" }, bottomLabels[i]!));
    g.appendChild(el("text", { x, y: top - 34, class: "coord" }, topLabels[i]!));
  }
  svg.appendChild(g);
}

export function renderBoard(svg: SVGSVGElement, pos: Position, opts: BoardOptions = {}): void {
  const flipped = opts.flipped ?? false;
  svg.replaceChildren();
  svg.appendChild(el("rect", { x: 0, y: 0, width: BOARD_W, height: BOARD_H, class: "bg" }));
  drawGrid(svg, flipped);

  const layer = el("g", { class: "pieces" });
  const R = 25;

  // 上一步的起點與終點
  if (opts.lastMove) {
    for (const s of [opts.lastMove.from, opts.lastMove.to]) {
      const [x, y] = xy(s, flipped);
      layer.appendChild(el("rect", { x: x - R - 4, y: y - R - 4, width: 2 * R + 8, height: 2 * R + 8, class: "last" }));
    }
  }
  for (const s of opts.marks ?? []) {
    const [x, y] = xy(s, flipped);
    layer.appendChild(el("circle", { cx: x, cy: y, r: R + 6, class: "markring" }));
  }

  pos.board.forEach((p, s) => {
    if (!p) return;
    const [x, y] = xy(s, flipped);
    const side = sideOf(p);
    const g = el("g", { class: `piece ${side === "r" ? "red" : "black"}`, "data-sq": s });
    g.appendChild(el("circle", { cx: x, cy: y, r: R, class: "outer" }));
    if (side === "r") g.appendChild(el("circle", { cx: x, cy: y, r: R - 5, class: "inner" }));
    g.appendChild(el("text", { x, y: y + 1, class: "label" }, pieceName(p)));
    layer.appendChild(g);
  });

  if (opts.selected !== null && opts.selected !== undefined) {
    const [x, y] = xy(opts.selected, flipped);
    layer.appendChild(el("rect", { x: x - R - 5, y: y - R - 5, width: 2 * R + 10, height: 2 * R + 10, class: "selected" }));
  }
  for (const t of opts.targets ?? []) {
    const [x, y] = xy(t, flipped);
    if (pos.board[t]) layer.appendChild(el("circle", { cx: x, cy: y, r: R + 4, class: "capture" }));
    else layer.appendChild(el("circle", { cx: x, cy: y, r: 8, class: "dot" }));
  }
  svg.appendChild(layer);

  // 觸控層：每個交叉點一整格
  const touch = el("g", { class: "touch" });
  for (let s = 0; s < FILES * RANKS; s++) {
    const [x, y] = xy(s, flipped);
    const rect = el("rect", { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, "data-sq": s });
    rect.addEventListener("click", () => opts.onTap?.(s));
    touch.appendChild(rect);
  }
  svg.appendChild(touch);
}
