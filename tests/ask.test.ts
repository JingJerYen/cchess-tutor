import { beforeAll, describe, expect, it } from "vitest";
import { ask, buildFacts, loadAnalyses, type LLM } from "../server/ask";
import { makeMove, startPosition, toFEN } from "../src/engine/board";
import { parseChinese } from "../src/engine/notation";

describe("問教練", () => {
  beforeAll(() => {
    loadAnalyses();
  });

  it("事實清單包含合法著法、引擎排名與這一步的特徵", () => {
    let pos = startPosition();
    pos = makeMove(pos, parseChinese(pos, "炮二平五"));
    const { facts, allowed } = buildFacts({ fen: toFEN(pos), move: "馬2進1", question: "為什麼不好？" });
    expect(facts).toContain("合法著法");
    expect(facts).toContain("引擎");
    expect(facts).toContain("馬2進1");
    expect(allowed.has("馬8進7")).toBe(true);
    expect(allowed.has("炮五進四")).toBe(true); // 來自主變
  });

  it("回答提到資料外的著法會被退回重寫，第二次通過", async () => {
    let calls = 0;
    const llm: LLM = async (_s, user) => {
      calls++;
      if (calls === 1) return { text: "你應該走車九進九。", model: "fake" }; // 不合法的著法
      expect(user).toContain("資料裡沒有的著法");
      return { text: "因為中卒沒有人保護，紅炮可以炮五進四吃掉它。", model: "fake" };
    };
    let pos = startPosition();
    pos = makeMove(pos, parseChinese(pos, "炮二平五"));
    const out = await ask({ fen: toFEN(pos), move: "馬2進1", question: "為什麼？" }, llm);
    expect(calls).toBe(2);
    expect(out.verified).toBe(true);
    expect(out.answer).toContain("炮五進四");
  });

  it("兩次都失敗則標記未驗證", async () => {
    const llm: LLM = async () => ({ text: "走車九進九就贏了。", model: "fake" });
    const out = await ask({ fen: toFEN(startPosition()), question: "怎麼贏？" }, llm);
    expect(out.verified).toBe(false);
  });

  it("沒有分析的局面也能回答", () => {
    const { facts } = buildFacts({ fen: "4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1", question: "?" });
    expect(facts).toContain("沒有引擎分析");
  });
});
