/**
 * 把一步棋翻成人看得懂的「事實」：吃了什麼、將軍、捉了什麼、走完哪個子沒根。
 *
 * 這些都是程式算出來的，給兩個地方用：
 * - 前端：引擎推演時每一步的簡短說明（不需要 LLM）。
 * - 產線：餵給 LLM 的特徵，讓它只解釋事實、不自己算棋。
 */
import { makeMove } from "./board";
import { attackersOf, inCheck, pieceName, pseudoMovesFrom } from "./moves";
import {
  type Move,
  type Piece,
  type PieceType,
  type Position,
  type Side,
  fileOf,
  rankOf,
  sideOf,
  typeOf,
  onOwnSide,
  opposite,
} from "./types";
import { piecesOf } from "./board";

/** 子力價值（兵為 1） */
export function pieceValue(p: Piece, rank: number): number {
  const t = typeOf(p);
  const v: Record<PieceType, number> = { K: 100, R: 9, C: 4.5, N: 4, B: 2, A: 2, P: 1 };
  if (t === "P" && !onOwnSide(rank, sideOf(p))) return 2; // 過河兵
  return v[t];
}

export interface MoveFeatures {
  mover: string;
  /** 吃掉的子 */
  captured: string | null;
  givesCheck: boolean;
  /** 走完後，這顆子新攻擊到的對方棋子（含是否無根） */
  attacks: { name: string; undefended: boolean }[];
  /** 走完後，自己有哪些子被攻擊而且沒有保護（或被低價值子攻擊） */
  hanging: { name: string; by: string }[];
  /** 從底線出動 */
  develops: boolean;
  crossesRiver: boolean;
}

/** side 方在 sq 的棋子有沒有保護（同方攻擊該格） */
function defended(pos: Position, sq: number, side: Side): boolean {
  // 把該格暫時當成敵子來看自己人能不能「吃到」它
  const probe: Position = { board: pos.board.slice(), turn: pos.turn };
  const original = probe.board[sq]!;
  const dummy: Piece = side === "r" ? "p" : "P"; // 任何對方的子都行
  probe.board[sq] = dummy;
  const ok = attackersOf(probe, sq, side).length > 0;
  probe.board[sq] = original;
  return ok;
}

function fullName(p: Piece): string {
  return (sideOf(p) === "r" ? "紅" : "黑") + pieceName(p);
}

export function moveFeatures(pos: Position, m: Move): MoveFeatures {
  const p = pos.board[m.from]!;
  const side = sideOf(p);
  const enemy = opposite(side);
  const target = pos.board[m.to];
  const after = makeMove(pos, m);

  const attacks: MoveFeatures["attacks"] = [];
  for (const sq of pseudoMovesFrom(after, m.to)) {
    const t = after.board[sq];
    if (!t || sideOf(t) !== enemy || typeOf(t) === "K") continue;
    attacks.push({ name: fullName(t), undefended: !defended(after, sq, enemy) });
  }

  const hanging: MoveFeatures["hanging"] = [];
  for (const sq of piecesOf(after, side)) {
    const mine = after.board[sq]!;
    if (typeOf(mine) === "K") continue;
    const attackers = attackersOf(after, sq, enemy);
    if (!attackers.length) continue;
    const cheapest = Math.min(...attackers.map((a) => pieceValue(after.board[a]!, rankOf(a))));
    const myValue = pieceValue(mine, rankOf(sq));
    if (!defended(after, sq, side) || cheapest < myValue) {
      const by = attackers.map((a) => fullName(after.board[a]!)).join("、");
      hanging.push({ name: fullName(mine), by });
    }
  }

  const backRank = side === "r" ? 0 : 9;
  const t = typeOf(p);
  return {
    mover: fullName(p),
    captured: target ? fullName(target) : null,
    givesCheck: inCheck(after, enemy),
    attacks,
    hanging,
    develops: rankOf(m.from) === backRank && (t === "N" || t === "R" || t === "C"),
    crossesRiver: onOwnSide(rankOf(m.from), side) && !onOwnSide(rankOf(m.to), side),
  };
}

/** 一句話描述這步做了什麼；沒什麼特別就回傳空字串 */
export function describeMove(pos: Position, m: Move): string {
  const f = moveFeatures(pos, m);
  const parts: string[] = [];
  if (f.captured) parts.push(`吃掉${f.captured}`);
  if (f.givesCheck) parts.push("將軍");
  const juicy = f.attacks.filter((a) => a.undefended || /車/.test(a.name));
  if (juicy.length) parts.push(`捉${juicy.map((a) => a.name + (a.undefended ? "（無根）" : "")).join("、")}`);
  if (f.hanging.length) {
    const h = f.hanging[0]!;
    parts.push(`但自己的${h.name}暴露在${h.by}攻擊之下`);
  }
  if (!parts.length && f.develops) parts.push("出動子力");
  return parts.join("，");
}

/** 給 LLM 用的純文字摘要 */
export function featuresToText(f: MoveFeatures): string {
  const lines = [`走子：${f.mover}`];
  if (f.captured) lines.push(`吃子：${f.captured}`);
  if (f.givesCheck) lines.push("將軍");
  if (f.attacks.length) lines.push(`攻擊：${f.attacks.map((a) => a.name + (a.undefended ? "（無根）" : "")).join("、")}`);
  if (f.hanging.length) lines.push(`走完後己方無根或被低價值子攻擊：${f.hanging.map((h) => `${h.name}（被${h.by}）`).join("、")}`);
  if (f.develops) lines.push("出動底線子力");
  if (f.crossesRiver) lines.push("過河");
  return lines.join("；");
}

/** 把格子寫成人看的位置，例如「紅方五路第 3 排」給 LLM 用 */
export function squareText(sq: number): string {
  return `${String.fromCharCode(97 + fileOf(sq))}${rankOf(sq)}`;
}
