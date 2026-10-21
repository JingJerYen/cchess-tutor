/**
 * 基本型別。
 *
 * 座標：file 0–8（由紅方左手邊數起，對應 ICCS 的 a–i），
 *       rank 0–9（紅方底線為 0，對應 ICCS 的 0–9）。
 * 格子索引 sq = rank * 9 + file。
 */

export type Side = "r" | "b";

/** 棋子種類（與 FEN 字母一致）：K 帥將、A 仕士、B 相象、N 馬、R 車、C 炮、P 兵卒 */
export type PieceType = "K" | "A" | "B" | "N" | "R" | "C" | "P";

/** 大寫為紅方，小寫為黑方 */
export type Piece =
  | "K" | "A" | "B" | "N" | "R" | "C" | "P"
  | "k" | "a" | "b" | "n" | "r" | "c" | "p";

export type Square = number; // 0..89

export interface Move {
  from: Square;
  to: Square;
}

export interface Position {
  board: (Piece | null)[];
  turn: Side;
}

export const FILES = 9;
export const RANKS = 10;

export function sq(file: number, rank: number): Square {
  return rank * FILES + file;
}
export function fileOf(s: Square): number {
  return s % FILES;
}
export function rankOf(s: Square): number {
  return Math.floor(s / FILES);
}
export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < FILES && rank >= 0 && rank < RANKS;
}

export function sideOf(p: Piece): Side {
  return p === p.toUpperCase() ? "r" : "b";
}
export function typeOf(p: Piece): PieceType {
  return p.toUpperCase() as PieceType;
}
export function opposite(s: Side): Side {
  return s === "r" ? "b" : "r";
}

/** 九宮：file 3–5，紅方 rank 0–2，黑方 rank 7–9 */
export function inPalace(file: number, rank: number, side: Side): boolean {
  if (file < 3 || file > 5) return false;
  return side === "r" ? rank <= 2 : rank >= 7;
}

/** 是否在己方河界這一側（相象不能過河） */
export function onOwnSide(rank: number, side: Side): boolean {
  return side === "r" ? rank <= 4 : rank >= 5;
}

/** ICCS 座標字串，例如 "h2" */
export function toICCS(s: Square): string {
  return String.fromCharCode(97 + fileOf(s)) + String(rankOf(s));
}
export function fromICCS(str: string): Square {
  const file = str.charCodeAt(0) - 97;
  const rank = Number(str[1]);
  if (!onBoard(file, rank)) throw new Error(`無效的 ICCS 座標：${str}`);
  return sq(file, rank);
}
/** 著法的 ICCS 字串，例如 "h2e2" */
export function moveToICCS(m: Move): string {
  return toICCS(m.from) + toICCS(m.to);
}
export function moveFromICCS(str: string): Move {
  if (str.length !== 4) throw new Error(`無效的 ICCS 著法：${str}`);
  return { from: fromICCS(str.slice(0, 2)), to: fromICCS(str.slice(2, 4)) };
}
