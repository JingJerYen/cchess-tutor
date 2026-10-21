import { describe, expect, it } from "vitest";
import { makeMove, parseFEN, startPosition } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";
import { describeMove, moveFeatures } from "../src/engine/features";
import { moveFromICCS } from "../src/engine/types";

describe("著法特徵", () => {
  it("炮五進四打中卒：吃子、過河", () => {
    let pos = startPosition();
    pos = makeMove(pos, parseChinese(pos, "炮二平五"));
    pos = makeMove(pos, parseChinese(pos, "馬2進1"));
    const m = parseChinese(pos, "炮五進四");
    const f = moveFeatures(pos, m);
    expect(f.captured).toBe("黑卒");
    expect(f.crossesRiver).toBe(true);
    expect(describeMove(pos, m)).toContain("吃掉黑卒");
  });
  it("出動子力", () => {
    const pos = startPosition();
    const f = moveFeatures(pos, parseChinese(pos, "馬二進三"));
    expect(f.develops).toBe(true);
    expect(describeMove(pos, parseChinese(pos, "馬二進三"))).toBe("出動子力");
  });
  it("捉無根子與送子", () => {
    // 紅車 a0，黑馬 a7 無根；車進七捉馬（a0→a7? 直接吃）改成車平到同線捉
    const pos = parseFEN("3k5/9/n8/9/9/9/9/9/9/R2K5 w - - 0 1");
    // 車一進六 到 a6，攻擊 a7 的馬（無根）
    const m = moveFromICCS("a0a6");
    const f = moveFeatures(pos, m);
    expect(f.attacks.some((a) => a.name === "黑馬" && a.undefended)).toBe(true);
    expect(describeMove(pos, m)).toContain("捉黑馬（無根）");
    // 送車：車走到黑馬吃得到的地方（a7 的馬攻擊 b5、c6、c8、b9）
    const hang = moveFeatures(pos, moveFromICCS("a0b0"));
    expect(hang.hanging.length).toBe(0);
    const hang2 = moveFeatures(parseFEN("3k5/9/n8/9/9/9/9/9/9/1R1K5 w - - 0 1"), moveFromICCS("b0b5"));
    expect(hang2.hanging.some((h) => h.name === "紅車")).toBe(true);
  });
  it("將軍", () => {
    const pos = parseFEN("3k5/9/9/9/9/9/9/9/9/R3K4 w - - 0 1");
    const f = moveFeatures(pos, moveFromICCS("a0d0"));
    expect(f.givesCheck).toBe(true);
    expect(describeMove(pos, moveFromICCS("a0d0"))).toContain("將軍");
  });
});
