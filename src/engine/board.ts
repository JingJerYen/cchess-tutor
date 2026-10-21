import {
  FILES,
  RANKS,
  type Move,
  type Piece,
  type Position,
  type Side,
  type Square,
  fileOf,
  rankOf,
  sq,
  opposite,
  typeOf,
  sideOf,
} from "./types";

export const START_FEN =
  "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

const PIECE_CHARS = new Set("KABNRCPkabnrcp");

/** 解析象棋 FEN（只讀棋子擺放與輪走方，其餘欄位忽略） */
export function parseFEN(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const placement = parts[0];
  if (!placement) throw new Error("FEN 為空");
  const rows = placement.split("/");
  if (rows.length !== RANKS) throw new Error(`FEN 應有 ${RANKS} 行，實際 ${rows.length} 行`);

  const board: (Piece | null)[] = new Array(FILES * RANKS).fill(null);
  // FEN 第一行是黑方底線（rank 9）
  rows.forEach((row, i) => {
    const rank = RANKS - 1 - i;
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "9") {
        file += Number(ch);
      } else if (PIECE_CHARS.has(ch)) {
        if (file >= FILES) throw new Error(`FEN 第 ${i + 1} 行超出棋盤`);
        board[sq(file, rank)] = ch as Piece;
        file++;
      } else {
        throw new Error(`FEN 含無效字元：${ch}`);
      }
    }
    if (file !== FILES) throw new Error(`FEN 第 ${i + 1} 行寬度錯誤`);
  });

  const turnField = parts[1] ?? "w";
  const turn: Side = turnField === "b" ? "b" : "r";
  return { board, turn };
}

export function toFEN(pos: Position): string {
  const rows: string[] = [];
  for (let rank = RANKS - 1; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < FILES; file++) {
      const p = pos.board[sq(file, rank)];
      if (p) {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += p;
      } else {
        empty++;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${pos.turn === "r" ? "w" : "b"} - - 0 1`;
}

export function startPosition(): Position {
  return parseFEN(START_FEN);
}

export function clonePosition(pos: Position): Position {
  return { board: pos.board.slice(), turn: pos.turn };
}

/** 走一步，回傳新局面（不檢查合法性） */
export function makeMove(pos: Position, m: Move): Position {
  const next = clonePosition(pos);
  next.board[m.to] = next.board[m.from] ?? null;
  next.board[m.from] = null;
  next.turn = opposite(pos.turn);
  return next;
}

/** 找不到時回傳 -1（例如測試用的殘局，或對方的將剛被吃掉） */
export function findKing(pos: Position, side: Side): Square {
  const k: Piece = side === "r" ? "K" : "k";
  return pos.board.indexOf(k);
}

/** 列出某方所有棋子的位置 */
export function piecesOf(pos: Position, side: Side): Square[] {
  const out: Square[] = [];
  pos.board.forEach((p, i) => {
    if (p && sideOf(p) === side) out.push(i);
  });
  return out;
}

/** 兩格之間（同直線或同橫線，不含端點）的棋子數 */
export function piecesBetween(pos: Position, a: Square, b: Square): number {
  const fa = fileOf(a), ra = rankOf(a), fb = fileOf(b), rb = rankOf(b);
  if (fa !== fb && ra !== rb) throw new Error("piecesBetween 只適用同線");
  const df = Math.sign(fb - fa), dr = Math.sign(rb - ra);
  let n = 0;
  let f = fa + df, r = ra + dr;
  while (f !== fb || r !== rb) {
    if (pos.board[sq(f, r)]) n++;
    f += df;
    r += dr;
  }
  return n;
}

export { typeOf, sideOf };
