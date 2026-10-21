import { describe, expect, it } from "vitest";
import { parseFEN, startPosition, toFEN, makeMove, START_FEN } from "../src/engine/board";
import {
  legalMoves,
  legalMovesFrom,
  explainIllegal,
  inCheck,
  kingsFacing,
  gameResult,
} from "../src/engine/moves";
import { moveToChinese, parseChinese } from "../src/engine/notation";
import { moveFromICCS, moveToICCS, fromICCS, type Position } from "../src/engine/types";

function play(pos: Position, ...moves: string[]): Position {
  for (const m of moves) pos = makeMove(pos, parseChinese(pos, m));
  return pos;
}

describe("FEN", () => {
  it("來回轉換不變", () => {
    expect(toFEN(startPosition())).toBe(START_FEN);
  });
  it("輪走方", () => {
    expect(parseFEN("4k4/9/9/9/9/9/9/9/9/4K4 b - - 0 1").turn).toBe("b");
  });
});

describe("初始局面走法", () => {
  it("紅方開局有 44 步合法著法", () => {
    // 車 2×2、馬 2×2、炮 2×12、兵 5×1、相 2×2、仕 2×1、帥 1 → 4+4+24+5+4+2+1 = 44
    expect(legalMoves(startPosition()).length).toBe(44);
  });
  it("炮二平五是 h2e2", () => {
    const pos = startPosition();
    const m = parseChinese(pos, "炮二平五");
    expect(moveToICCS(m)).toBe("h2e2");
    expect(moveToChinese(pos, m)).toBe("炮二平五");
  });
  it("黑方馬8進7是 h9g7", () => {
    const pos = play(startPosition(), "炮二平五");
    const m = parseChinese(pos, "馬8進7");
    expect(moveToICCS(m)).toBe("h9g7");
    expect(moveToChinese(pos, m)).toBe("馬8進7");
  });
});

describe("各棋子規則", () => {
  it("絆馬腳", () => {
    // 紅馬 b0，馬腳 b1 放一個紅兵，就不能跳到 a2/c2
    const pos = parseFEN("3k5/9/9/9/9/9/9/9/1P7/1N2K4 w - - 0 1");
    const from = fromICCS("b0");
    const targets = legalMovesFrom(pos, from).map((s) => moveToICCS({ from, to: s }).slice(2));
    expect(targets).not.toContain("a2");
    expect(targets).not.toContain("c2");
    expect(targets).toContain("d1");
    expect(explainIllegal(pos, moveFromICCS("b0a2"))).toMatch(/絆馬腳/);
  });
  it("塞象眼與相不過河", () => {
    const pos = parseFEN("4k4/9/9/9/9/2B6/9/9/9/4K4 w - - 0 1");
    // 相在 c4，往 e6 會過河
    expect(explainIllegal(pos, moveFromICCS("c4e6"))).toMatch(/過河/);
    const blocked = parseFEN("4k4/9/9/9/9/9/9/9/3p5/2B1K4 w - - 0 1");
    // 相 c0 → e2，象眼 d1 有黑卒
    expect(explainIllegal(blocked, moveFromICCS("c0e2"))).toMatch(/塞象眼/);
  });
  it("炮吃子要隔一個、移動不能隔", () => {
    const pos = parseFEN("3k5/9/9/9/9/9/9/9/4K4/C1P1p2p1 w - - 0 1");
    // 紅炮 a0，紅兵 c0 當炮架，可以吃 e0 的黑卒；不能吃 h0（隔了兩個）
    expect(explainIllegal(pos, moveFromICCS("a0e0"))).toBeNull();
    expect(explainIllegal(pos, moveFromICCS("a0h0"))).toMatch(/隔了 2 個/);
    expect(explainIllegal(pos, moveFromICCS("a0d0"))).toMatch(/不能有棋子擋住/);
    const noScreen = parseFEN("3k5/9/9/9/9/9/9/9/4K4/C3p4 w - - 0 1");
    expect(explainIllegal(noScreen, moveFromICCS("a0e0"))).toMatch(/炮架/);
  });
  it("兵過河前不能橫走，永遠不能後退", () => {
    const pos = parseFEN("4k4/9/9/9/9/9/4P4/9/9/4K4 w - - 0 1");
    // 兵 e3 未過河
    expect(explainIllegal(pos, moveFromICCS("e3d3"))).toMatch(/過河以前/);
    expect(explainIllegal(pos, moveFromICCS("e3e2"))).toMatch(/後退/);
    expect(explainIllegal(pos, moveFromICCS("e3e4"))).toBeNull();
    const crossed = parseFEN("3k5/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1");
    expect(explainIllegal(crossed, moveFromICCS("e5d5"))).toBeNull();
    expect(explainIllegal(crossed, moveFromICCS("e5e4"))).toMatch(/後退/);
  });
  it("仕、帥不出九宮", () => {
    const pos = parseFEN("3k5/9/9/9/9/9/9/9/3A5/4K4 w - - 0 1");
    expect(explainIllegal(pos, moveFromICCS("d1c2"))).toMatch(/九宮/);
    expect(explainIllegal(pos, moveFromICCS("d1e2"))).toBeNull();
    expect(explainIllegal(pos, moveFromICCS("e0e1"))).toBeNull();
    const king = parseFEN("4k4/9/9/9/9/9/9/9/9/3K5 w - - 0 1");
    expect(explainIllegal(king, moveFromICCS("d0c0"))).toMatch(/九宮/);
  });
  it("將帥照面", () => {
    const pos = parseFEN("4k4/9/9/9/9/9/9/9/9/3K5 w - - 0 1");
    expect(explainIllegal(pos, moveFromICCS("d0e0"))).toMatch(/將帥照面/);
    const facing = parseFEN("4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1");
    expect(kingsFacing(facing)).toBe(true);
  });
  it("送將與應將", () => {
    // 黑車 e9 直線對紅帥 e0，中間紅仕 e1 擋著；仕走開就是送將
    const pos = parseFEN("3kr4/9/9/9/9/9/9/9/4A4/4K4 w - - 0 1");
    expect(explainIllegal(pos, moveFromICCS("e1d2"))).toMatch(/送將/);
    // 被將軍時必須應將
    const checked = parseFEN("3kr4/9/9/9/9/9/9/9/9/N3K4 w - - 0 1");
    expect(inCheck(checked, "r")).toBe(true);
    expect(explainIllegal(checked, moveFromICCS("a0b2"))).toMatch(/沒有解除將軍/);
    expect(explainIllegal(checked, moveFromICCS("e0e1"))).toMatch(/沒有解除將軍/);
    expect(explainIllegal(checked, moveFromICCS("e0d0"))).toMatch(/將帥照面/);
    expect(explainIllegal(checked, moveFromICCS("e0f0"))).toBeNull();
  });
  it("將死", () => {
    // 紅帥 e0，黑車 e9 將軍，黑車 d9... 用雙車：e 線被將，d/f 線也被封
    const mate = parseFEN("3k5/9/9/9/9/9/9/9/9/r3K3r w - - 0 1");
    // 黑車 a0 與 i0 沿底線將軍，帥上 e1 又被... 這裡沒有，所以不是將死
    expect(gameResult(mate)).toBeNull();
    const realMate = parseFEN("3k5/9/9/9/9/9/9/9/r8/4K3r w - - 0 1");
    // 底線 i0 車將軍，e1 被 a1 車控制，d0/f0 仍在 i0 車線上
    expect(gameResult(realMate)).toBe("checkmate");
  });
});

describe("中文記譜", () => {
  it("中炮對屏風馬主線前幾步來回轉換", () => {
    const line = [
      "炮二平五", "馬8進7", "馬二進三", "車9平8", "車一平二", "馬2進3",
      "兵七進一", "卒7進1", "車二進六", "炮8平9", "車二平三", "炮9退1",
      "馬八進七", "士4進5",
    ];
    let pos = startPosition();
    for (const text of line) {
      const m = parseChinese(pos, text);
      expect(moveToChinese(pos, m)).toBe(text);
      pos = makeMove(pos, m);
    }
  });
  it("馬相仕用目的地路數", () => {
    const pos = startPosition();
    expect(moveToICCS(parseChinese(pos, "馬八進七"))).toBe("b0c2");
    expect(moveToICCS(parseChinese(pos, "相三進五"))).toBe("g0e2");
    expect(moveToICCS(parseChinese(pos, "仕四進五"))).toBe("f0e1");
  });
  it("前車／後車", () => {
    // 兩個紅車都在 e 線（五路）：e3 與 e1
    const pos = parseFEN("4k4/9/9/9/9/9/4R4/9/4R4/3K5 w - - 0 1");
    expect(moveToChinese(pos, moveFromICCS("e3e4"))).toBe("前車進一");
    expect(moveToChinese(pos, moveFromICCS("e1e2"))).toBe("後車進一");
    expect(moveToICCS(parseChinese(pos, "前車進一"))).toBe("e3e4");
    expect(moveToICCS(parseChinese(pos, "後車平四"))).toBe("e1f1");
  });
  it("前中後兵", () => {
    const pos = parseFEN("4k4/9/9/4P4/4P4/4P4/9/9/9/4K4 w - - 0 1");
    expect(moveToChinese(pos, moveFromICCS("e6e7"))).toBe("前兵進一");
    expect(moveToChinese(pos, moveFromICCS("e5d5"))).toBe("中兵平六");
    expect(moveToChinese(pos, moveFromICCS("e4f4"))).toBe("後兵平四");
    expect(moveToICCS(parseChinese(pos, "中兵平六"))).toBe("e5d5");
  });
  it("黑方前後與數字", () => {
    // 黑方兩個車都在 5 路：e8 與 e6（黑方「前」是離紅方較近 = rank 較小）
    const pos = parseFEN("4k4/4r4/9/4r4/9/9/9/9/9/4K4 b - - 0 1");
    expect(moveToChinese(pos, moveFromICCS("e6e5"))).toBe("前車進1");
    expect(moveToChinese(pos, moveFromICCS("e8e9"))).toBe("後車退1");
  });
  it("不合法的記譜會報錯", () => {
    const pos = startPosition();
    expect(() => parseChinese(pos, "車一進九")).toThrow();
    expect(() => parseChinese(pos, "炮二平二")).toThrow();
    expect(() => parseChinese(pos, "馬二進四")).toThrow(); // 被相絆馬腳
  });
});
