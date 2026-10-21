/**
 * 中文記譜 ⇄ 座標著法。
 *
 * 規則：
 * - 紅方用中文數字（一～九），從紅方右手邊數起：file 8 = 一，file 0 = 九。
 * - 黑方用阿拉伯數字（1～9），從黑方右手邊數起：file 0 = 1，file 8 = 9。
 * - 進／退／平：前進、後退、橫移。
 * - 車炮兵帥（將）直走時，進退後面的數字是「走幾步」；平後面是目的地路數。
 * - 馬相仕斜走時，進退後面的數字是「目的地路數」。
 * - 同一路上有兩個以上同種棋子時，用「前／後」（三個用前／中／後）代替路數。
 *   仕相不需要，因為進退方向已能區分。
 *
 * 這是確定性轉換，不經過 LLM。
 */
import { legalMovesFrom } from "./moves";
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
  sideOf,
  typeOf,
} from "./types";
import { piecesOf } from "./board";
import { forward, pieceName } from "./moves";

const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** 路數（1–9）轉成該方的顯示數字 */
function numStr(n: number, side: Side): string {
  return side === "r" ? CN_NUM[n]! : String(n);
}

/** 記譜用的棋子名稱：紅黑的炮都寫「炮」，與常見棋書一致 */
function notationName(p: Piece): string {
  return typeOf(p) === "C" ? "炮" : pieceName(p);
}

/** 棋盤 file → 該方路數 1–9 */
export function fileNumber(file: number, side: Side): number {
  return side === "r" ? 9 - file : file + 1;
}
/** 該方路數 1–9 → 棋盤 file */
export function fileFromNumber(n: number, side: Side): number {
  return side === "r" ? 9 - n : n - 1;
}

/** 這類棋子直走，進退後面的數字是步數 */
function movesStraight(t: PieceType): boolean {
  return t === "R" || t === "C" || t === "P" || t === "K";
}

/** 同路上同種棋子，依「前」到「後」排序（前 = 離對方較近） */
function sameFileGroup(pos: Position, from: Square): Square[] {
  const p = pos.board[from]!;
  const side = sideOf(p);
  const t = typeOf(p);
  const file = fileOf(from);
  const group = piecesOf(pos, side).filter(
    (s) => fileOf(s) === file && typeOf(pos.board[s]!) === t,
  );
  const fw = forward(side);
  group.sort((a, b) => (rankOf(b) - rankOf(a)) * fw);
  return group;
}

function orderPrefix(index: number, total: number): string {
  if (total === 2) return index === 0 ? "前" : "後";
  if (total === 3) return ["前", "中", "後"][index]!;
  // 四個以上（只可能是兵）：前、二、三、…、後
  if (index === 0) return "前";
  if (index === total - 1) return "後";
  return CN_NUM[index + 1]!;
}

/** 座標著法 → 中文記譜。著法必須是該局面下走子方的棋子（不要求合法）。 */
export function moveToChinese(pos: Position, m: Move): string {
  const p = pos.board[m.from];
  if (!p) throw new Error("起點沒有棋子");
  const side = sideOf(p);
  const t = typeOf(p);
  const name = notationName(p);
  const fromFile = fileOf(m.from), fromRank = rankOf(m.from);
  const toFile = fileOf(m.to), toRank = rankOf(m.to);
  const fw = forward(side);

  let head: string;
  const group = t === "A" || t === "B" ? [m.from] : sameFileGroup(pos, m.from);
  if (group.length >= 2) {
    const prefix = orderPrefix(group.indexOf(m.from), group.length);
    // 兵在多路都有重複時，保留路數以免混淆：前兵三進一
    const otherDup =
      t === "P" &&
      piecesOf(pos, side).some(
        (s) =>
          typeOf(pos.board[s]!) === "P" &&
          fileOf(s) !== fromFile &&
          sameFileGroup(pos, s).length >= 2,
      );
    head = otherDup ? prefix + name + numStr(fileNumber(fromFile, side), side) : prefix + name;
  } else {
    head = name + numStr(fileNumber(fromFile, side), side);
  }

  const dr = (toRank - fromRank) * fw;
  let dir: string;
  let tail: string;
  if (dr === 0) {
    dir = "平";
    tail = numStr(fileNumber(toFile, side), side);
  } else {
    dir = dr > 0 ? "進" : "退";
    tail = movesStraight(t)
      ? numStr(Math.abs(dr), side)
      : numStr(fileNumber(toFile, side), side);
  }
  return head + dir + tail;
}

// ---------- 解析 ----------

const PIECE_BY_CHAR: Record<string, PieceType> = {
  帥: "K", 將: "K", 将: "K", 帅: "K",
  仕: "A", 士: "A",
  相: "B", 象: "B",
  馬: "N", 马: "N", 傌: "N",
  車: "R", 车: "R", 俥: "R",
  炮: "C", 砲: "C", 包: "C",
  兵: "P", 卒: "P",
};

const NUM_BY_CHAR: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "１": 1, "２": 2, "３": 3, "４": 4, "５": 5, "６": 6, "７": 7, "８": 8, "９": 9,
};

const PREFIX_INDEX: Record<string, number> = { 前: 0, 中: 1, 後: -1, 后: -1 };

export class NotationError extends Error {}

/**
 * 中文記譜 → 座標著法。只接受在該局面下合法的著法；
 * 找不到或有歧義時丟出 NotationError。
 */
export function parseChinese(pos: Position, text: string): Move {
  const s = text.replace(/\s+/g, "");
  const side = pos.turn;
  let i = 0;

  // 前綴（前／中／後，或四個以上兵時的二三四）
  let prefixIdx: number | null = null;
  const c0 = s[i] ?? "";
  if (c0 in PREFIX_INDEX) {
    prefixIdx = PREFIX_INDEX[c0]!;
    i++;
  } else if (c0 in NUM_BY_CHAR && (s[i + 1] ?? "") in PIECE_BY_CHAR) {
    prefixIdx = NUM_BY_CHAR[c0]! - 1;
    i++;
  }

  const pieceChar = s[i] ?? "";
  const t = PIECE_BY_CHAR[pieceChar];
  if (!t) throw new NotationError(`看不懂的棋子：「${text}」`);
  i++;

  // 路數（有前綴時可省略）
  let fileNum: number | null = null;
  const cFile = s[i] ?? "";
  if (cFile in NUM_BY_CHAR) {
    fileNum = NUM_BY_CHAR[cFile]!;
    i++;
  } else if (prefixIdx === null) {
    throw new NotationError(`缺少路數：「${text}」`);
  }

  const dirChar = s[i] ?? "";
  if (!"進退平进".includes(dirChar) || dirChar === "") {
    throw new NotationError(`缺少進／退／平：「${text}」`);
  }
  const dir = dirChar === "平" ? 0 : dirChar === "退" ? -1 : 1;
  i++;

  const n = NUM_BY_CHAR[s[i] ?? ""];
  if (!n) throw new NotationError(`缺少數字：「${text}」`);
  if (i + 1 !== s.length) throw new NotationError(`多餘的字：「${text}」`);

  // 候選棋子
  let candidates = piecesOf(pos, side).filter((sqr) => typeOf(pos.board[sqr]!) === t);
  if (fileNum !== null) {
    const file = fileFromNumber(fileNum, side);
    candidates = candidates.filter((sqr) => fileOf(sqr) === file);
  }
  if (prefixIdx !== null) {
    // 找出有重複棋子的那一路
    const byFile = new Map<number, Square[]>();
    for (const sqr of candidates) {
      const list = byFile.get(fileOf(sqr)) ?? [];
      list.push(sqr);
      byFile.set(fileOf(sqr), list);
    }
    const dupFiles = [...byFile.values()].filter((l) => l.length >= 2);
    if (dupFiles.length !== 1) {
      throw new NotationError(`「${text}」的前／後無法對應到唯一一路`);
    }
    const group = sameFileGroup(pos, dupFiles[0]![0]!);
    const idx = prefixIdx < 0 ? group.length - 1 : prefixIdx;
    const chosen = group[idx];
    if (chosen === undefined) throw new NotationError(`「${text}」找不到對應的棋子`);
    candidates = [chosen];
  }

  // 計算每個候選的目的地
  const fw = forward(side);
  const results: Move[] = [];
  for (const from of candidates) {
    const f = fileOf(from), r = rankOf(from);
    let toF: number, toR: number;
    if (dir === 0) {
      toF = fileFromNumber(n, side);
      toR = r;
    } else if (movesStraight(t)) {
      toF = f;
      toR = r + dir * fw * n;
    } else {
      toF = fileFromNumber(n, side);
      const df = Math.abs(toF - f);
      let dRank: number;
      if (t === "N") dRank = df === 1 ? 2 : df === 2 ? 1 : -1;
      else if (t === "B") dRank = df === 2 ? 2 : -1;
      else dRank = df === 1 ? 1 : -1; // A
      if (dRank < 0) continue;
      toR = r + dir * fw * dRank;
    }
    if (!onBoard(toF, toR)) continue;
    const to = sq(toF, toR);
    if (legalMovesFrom(pos, from).includes(to)) results.push({ from, to });
  }

  if (results.length === 0) throw new NotationError(`「${text}」在目前局面下不是合法著法`);
  if (results.length > 1) throw new NotationError(`「${text}」有歧義，請加上前／後`);
  return results[0]!;
}
