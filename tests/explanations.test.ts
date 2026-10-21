import { describe, expect, it } from "vitest";
import { applyExplanations, mainLine } from "../src/content";
import { opening as raw } from "../src/content/openings/c7x-zhongpao-guohe-che";
import type { ExplanationsFile } from "../src/content/explanations-types";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";

describe("合併產線講解", () => {
  it("通過審稿的節點取代手寫；沒通過的保留手寫；錯著加進樹", () => {
    let pos = startPosition();
    pos = makeMove(pos, parseChinese(pos, "炮二平五"));
    const fenAfterFirst = toFEN(pos);
    const g: ExplanationsFile = {
      opening: raw.id,
      model: "test",
      generatedAt: "",
      nodes: {
        "炮二平五": { note: "新的說明", detail: "新的詳細", principle: "新心法", reviewed: true },
        "炮二平五/馬8進7": { note: "沒通過", detail: "", reviewed: false, concerns: ["x"] },
      },
      mistakes: {
        [fenAfterFirst]: [
          {
            zh: "卒5進1", note: "送卒", punish: [{ move: "炮五進三", note: "吃掉中卒" }],
            summary: "少一個卒", reviewed: true,
          },
          { zh: "馬2進1", note: "重複的不加", punish: [], summary: "", reviewed: true },
        ],
      },
    };
    const merged = applyExplanations(raw, g);
    const line = mainLine(merged);
    expect(line[0]!.note).toBe("新的說明");
    expect(line[0]!.verified).toBe(true);
    expect(line[1]!.note).toBe(raw.root[0]!.children![0]!.note);
    expect(line[1]!.verified).toBeUndefined();
    expect(merged.verified).toBe(false);
    const kids = merged.root[0]!.children!;
    expect(kids.filter((k) => k.move === "馬2進1").length).toBe(1);
    const added = kids.find((k) => k.move === "卒5進1");
    expect(added?.kind).toBe("mistake");
    expect(added?.punish?.[0]?.move).toBe("炮五進三");
    // 原始資料不被改動
    expect(raw.root[0]!.note).not.toBe("新的說明");
  });
});
