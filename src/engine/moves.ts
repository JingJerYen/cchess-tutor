/**
 * 走法產生、合法性判斷、違規原因說明。
 *
 * 規則程式是「事實」的來源：這裡的判斷不經過 LLM，百分之百確定。
 */
import { findKing, makeMove, piecesBetween, piecesOf } from "./board";
import {
  type Move,
  type Piece,
  type PieceType,
  type Position,
  type Side,
  type Square,
  fileOf,
  rankOf,
  sq,
  onBoard,
  inPalace,
  onOwnSide,
  sideOf,
  typeOf,
  opposite,
  toICCS,
} from "./types";

const ORTHO: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

/** 紅方往上（rank 增加）為前進，黑方相反 */
export function forward(side: Side): number {
  return side === "r" ? 1 : -1;
}

/** 棋子的中文名稱（紅黑不同字） */
export function pieceName(p: Piece): string {
  const names: Record<Piece, string> = {
    K: "帥", A: "仕", B: "相", N: "馬", R: "車", C: "炮", P: "兵",
    k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒",
  };
  return names[p];
}

/** 不分紅黑的通稱，用在規則說明 */
function genericName(t: PieceType): string {
  const names: Record<PieceType, string> = {
    K: "帥（將）", A: "仕（士）", B: "相（象）", N: "馬", R: "車", C: "炮", P: "兵（卒）",
  };
  return names[t];
}

/**
 * 某個棋子的偽合法走法（不考慮送將與將帥照面）。
 * 回傳可以到達的格子；吃子時目標格是對方棋子。
 */
export function pseudoMovesFrom(pos: Position, from: Square): Square[] {
  const p = pos.board[from];
  if (!p) return [];
  const side = sideOf(p);
  const f = fileOf(from), r = rankOf(from);
  const out: Square[] = [];
  const canLand = (file: number, rank: number): boolean => {
    if (!onBoard(file, rank)) return false;
    const t = pos.board[sq(file, rank)];
    return !t || sideOf(t) !== side;
  };

  switch (typeOf(p)) {
    case "R": {
      for (const [df, dr] of ORTHO) {
        let nf = f + df, nr = r + dr;
        while (onBoard(nf, nr)) {
          const t = pos.board[sq(nf, nr)];
          if (!t) out.push(sq(nf, nr));
          else {
            if (sideOf(t) !== side) out.push(sq(nf, nr));
            break;
          }
          nf += df; nr += dr;
        }
      }
      break;
    }
    case "C": {
      for (const [df, dr] of ORTHO) {
        let nf = f + df, nr = r + dr;
        let screen = false;
        while (onBoard(nf, nr)) {
          const t = pos.board[sq(nf, nr)];
          if (!screen) {
            if (!t) out.push(sq(nf, nr));
            else screen = true;
          } else if (t) {
            if (sideOf(t) !== side) out.push(sq(nf, nr));
            break;
          }
          nf += df; nr += dr;
        }
      }
      break;
    }
    case "N": {
      for (const [df, dr] of HORSE) {
        const legF = f + (Math.abs(df) === 2 ? Math.sign(df) : 0);
        const legR = r + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
        if (pos.board[sq(legF, legR)]) continue; // 絆馬腳
        if (canLand(f + df, r + dr)) out.push(sq(f + df, r + dr));
      }
      break;
    }
    case "B": {
      for (const [df, dr] of DIAG) {
        const nf = f + 2 * df, nr = r + 2 * dr;
        if (!onBoard(nf, nr) || !onOwnSide(nr, side)) continue;
        if (pos.board[sq(f + df, r + dr)]) continue; // 塞象眼
        if (canLand(nf, nr)) out.push(sq(nf, nr));
      }
      break;
    }
    case "A": {
      for (const [df, dr] of DIAG) {
        const nf = f + df, nr = r + dr;
        if (inPalace(nf, nr, side) && canLand(nf, nr)) out.push(sq(nf, nr));
      }
      break;
    }
    case "K": {
      for (const [df, dr] of ORTHO) {
        const nf = f + df, nr = r + dr;
        if (inPalace(nf, nr, side) && canLand(nf, nr)) out.push(sq(nf, nr));
      }
      break;
    }
    case "P": {
      const fw = forward(side);
      if (canLand(f, r + fw)) out.push(sq(f, r + fw));
      if (!onOwnSide(r, side)) {
        if (canLand(f + 1, r)) out.push(sq(f + 1, r));
        if (canLand(f - 1, r)) out.push(sq(f - 1, r));
      }
      break;
    }
  }
  return out;
}

/** 某格是否被 by 方攻擊（不含將帥照面） */
export function isAttacked(pos: Position, target: Square, by: Side): boolean {
  return attackersOf(pos, target, by).length > 0;
}

/** 攻擊某格的 by 方棋子 */
export function attackersOf(pos: Position, target: Square, by: Side): Square[] {
  const out: Square[] = [];
  for (const from of piecesOf(pos, by)) {
    if (pseudoMovesFrom(pos, from).includes(target)) out.push(from);
  }
  return out;
}

/** 將帥是否照面（同一直線且中間無子） */
export function kingsFacing(pos: Position): boolean {
  const rk = findKing(pos, "r"), bk = findKing(pos, "b");
  if (rk < 0 || bk < 0) return false;
  if (fileOf(rk) !== fileOf(bk)) return false;
  return piecesBetween(pos, rk, bk) === 0;
}

/** side 方是否正被將軍 */
export function inCheck(pos: Position, side: Side): boolean {
  const k = findKing(pos, side);
  if (k < 0) return false;
  return isAttacked(pos, k, opposite(side));
}

/** 走完這步之後，走子方是否陷入不合法狀態（送將或將帥照面） */
function leavesKingExposed(pos: Position, m: Move): boolean {
  const next = makeMove(pos, m);
  return kingsFacing(next) || inCheck(next, pos.turn);
}

export function legalMovesFrom(pos: Position, from: Square): Square[] {
  const p = pos.board[from];
  if (!p || sideOf(p) !== pos.turn) return [];
  return pseudoMovesFrom(pos, from).filter((to) => !leavesKingExposed(pos, { from, to }));
}

export function legalMoves(pos: Position): Move[] {
  const out: Move[] = [];
  for (const from of piecesOf(pos, pos.turn)) {
    for (const to of legalMovesFrom(pos, from)) out.push({ from, to });
  }
  return out;
}

export function isLegal(pos: Position, m: Move): boolean {
  return legalMovesFrom(pos, m.from).includes(m.to);
}

export function hasLegalMoves(pos: Position): boolean {
  return legalMoves(pos).length > 0;
}

/** 輪走方無步可走：被將軍是「將死」，否則是「困斃」，兩者在象棋裡都算輸 */
export function gameResult(pos: Position): "checkmate" | "stalemate" | null {
  if (hasLegalMoves(pos)) return null;
  return inCheck(pos, pos.turn) ? "checkmate" : "stalemate";
}

/**
 * 解釋一步棋為什麼不合法。合法時回傳 null。
 * 這是「為什麼不能這樣走」第一種情況（違反規則）的回答來源。
 */
export function explainIllegal(pos: Position, m: Move): string | null {
  const p = pos.board[m.from];
  if (!p) return "這個位置沒有棋子。";
  const side = sideOf(p);
  const sideName = pos.turn === "r" ? "紅" : "黑";
  if (side !== pos.turn) return `這是對方的棋子，現在輪到${sideName}方走。`;
  if (m.from === m.to) return "棋子沒有移動。";
  const target = pos.board[m.to];
  if (target && sideOf(target) === side) return "不能吃自己的棋子。";

  const t = typeOf(p);
  const name = genericName(t);
  const f = fileOf(m.from), r = rankOf(m.from);
  const tf = fileOf(m.to), tr = rankOf(m.to);
  const df = tf - f, dr = tr - r;

  switch (t) {
    case "R": {
      if (df !== 0 && dr !== 0) return "車只能走直線：直走或橫走，不能走斜的。";
      const n = piecesBetween(pos, m.from, m.to);
      if (n > 0) return "車的路上有棋子擋住。車不能跳過其他棋子。";
      break;
    }
    case "C": {
      if (df !== 0 && dr !== 0) return "炮只能走直線：直走或橫走，不能走斜的。";
      const n = piecesBetween(pos, m.from, m.to);
      if (!target && n > 0) return "炮移動（不吃子）的時候，路上不能有棋子擋住。";
      if (target && n === 0)
        return "炮吃子時，中間必須隔著一個棋子當「炮架」。這裡中間沒有棋子，所以不能吃。";
      if (target && n > 1)
        return `炮吃子時，中間只能隔一個棋子。這裡中間隔了 ${n} 個，太多了。`;
      break;
    }
    case "N": {
      const isL = (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1);
      if (!isL) return "馬走「日」字：先直走一格，再斜走一格。";
      const legF = f + (Math.abs(df) === 2 ? Math.sign(df) : 0);
      const legR = r + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
      const leg = pos.board[sq(legF, legR)];
      if (leg)
        return `絆馬腳：馬往這個方向走，要先經過旁邊的 ${toICCS(sq(legF, legR))} 那一格，那裡有${pieceName(leg)}擋住，馬就跳不過去。`;
      break;
    }
    case "B": {
      if (Math.abs(df) !== 2 || Math.abs(dr) !== 2) return `${name}走「田」字：斜走兩格。`;
      if (!onOwnSide(tr, side)) return `${name}不能過河，只能留在自己這一邊防守。`;
      const eye = pos.board[sq(f + df / 2, r + dr / 2)];
      if (eye)
        return `塞象眼：「田」字的中心 ${toICCS(sq(f + df / 2, r + dr / 2))} 有${pieceName(eye)}擋住，${name}就不能走。`;
      break;
    }
    case "A": {
      if (Math.abs(df) !== 1 || Math.abs(dr) !== 1) return `${name}只能斜走一格。`;
      if (!inPalace(tf, tr, side)) return `${name}不能離開九宮（中間那個有斜線的方格）。`;
      break;
    }
    case "K": {
      if (Math.abs(df) + Math.abs(dr) !== 1) return `${name}只能直走或橫走一格。`;
      if (!inPalace(tf, tr, side)) return `${name}不能離開九宮。`;
      break;
    }
    case "P": {
      const fw = forward(side);
      if (dr === -fw) return `${name}不能後退。`;
      if (dr === 0 && Math.abs(df) === 1 && onOwnSide(r, side))
        return `${name}過河以前只能往前走，過河之後才可以橫走。`;
      if (!(dr === fw && df === 0) && !(dr === 0 && Math.abs(df) === 1))
        return `${name}每次只能走一格：往前一格，過河後也可以左右一格。`;
      break;
    }
  }

  // 偽合法但會讓自己出問題
  const next = makeMove(pos, m);
  if (kingsFacing(next))
    return "將帥不能在同一直線上面對面（中間沒有其他棋子）。這步走完會變成「將帥照面」，所以不行。";
  const king = findKing(next, side);
  const attackers = attackersOf(next, king, opposite(side));
  if (attackers.length > 0) {
    const who = attackers.map((s) => pieceName(next.board[s] as Piece)).join("、");
    if (inCheck(pos, side))
      return `你正在被對方的${who}將軍，這步棋沒有解除將軍。必須先應將。`;
    return `這步會讓自己的${name}被對方的${who}將軍（送將），所以不能走。`;
  }
  return null;
}
