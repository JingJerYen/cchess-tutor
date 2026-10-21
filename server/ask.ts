/**
 * 「問教練」：把使用者的疑問變成一個有事實依據的回答。
 *
 * 流程和離線產線一樣：程式先算事實（合法著法、引擎資料、吃子／捉子／無根），
 * LLM 只負責用人話回答；回答裡提到的著法必須在事實清單裡，否則退回重寫。
 * LLM 呼叫透過注入的函式，方便測試時用假的。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { makeMove, parseFEN, toFEN } from "../src/engine/board";
import { legalMoves } from "../src/engine/moves";
import { moveToChinese, parseChinese, NotationError } from "../src/engine/notation";
import { featuresToText, moveFeatures } from "../src/engine/features";
import type { Position } from "../src/engine/types";
import type { AnalysisFile, PositionAnalysis } from "../src/content/analysis-types";
import { validateMoves } from "../pipeline/validate";

export interface AskRequest {
  /** 講解對應的局面（著法之前） */
  fen: string;
  /** 使用者走的或講解的那一步（中文記譜），可省略 */
  move?: string;
  /** App 顯示給使用者的講解原文 */
  explanation?: string;
  question: string;
  /** 同一個局面的前幾輪問答 */
  history?: { q: string; a: string }[];
}

export interface AskResponse {
  answer: string;
  /** 回答裡的著法是否全部通過驗證 */
  verified: boolean;
  model: string;
}

export type LLM = (system: string, user: string) => Promise<{ text: string; model: string }>;

// ---------- 引擎分析（從 repo 裡的 JSON 讀，啟動時載入一次） ----------

const analysisByFen = new Map<string, PositionAnalysis>();
export function loadAnalyses(dir = path.resolve(process.cwd(), "src/content/analysis")): number {
  if (!existsSync(dir)) return 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const a = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as AnalysisFile;
    for (const [fen, pa] of Object.entries(a.positions)) analysisByFen.set(fen, pa);
  }
  return analysisByFen.size;
}

// ---------- 事實 ----------

export const SYSTEM = `你是象棋教練，學生是只懂規則的成年初學者。用繁體中文、口語、短句回答，直接回答問題，不要客套。
鐵律：
1. 你不自己算棋。關於「接下來會怎樣」的判斷，只能來自提供的引擎資料與事實清單；資料裡沒有的變化就說「資料裡沒有這條變化」。
2. 只能提到資料裡出現過的著法，不要自己發明著法。
3. 不確定就不要說。寧可少講，不要講錯。
4. 如果學生的質疑有道理（例如講解說法不精確），就承認，並根據事實說明正確的理解。
5. 引擎分數 100 ≈ 一個兵；30 以內算差不多；100 以上算明顯吃虧。
6. 回答控制在 150 字以內；需要列變化時用「著法：說明」一行一條。`;

function sideName(p: Position): string {
  return p.turn === "r" ? "紅方" : "黑方";
}

function engineText(pa: PositionAnalysis, highlight: string | undefined): string {
  const top = pa.moves.slice(0, 4).map((m, i) =>
    `  第 ${i + 1} 名 ${m.zh}（分數 ${m.cp ?? (m.mate !== null ? `殺 ${m.mate}` : "?")}，主變：${m.pvZh.slice(0, 6).join(" ")}）`);
  if (highlight) {
    const i = pa.moves.findIndex((m) => m.zh === highlight);
    if (i >= 4) {
      const m = pa.moves[i]!;
      top.push(`  第 ${i + 1} 名 ${m.zh}（損失 ${m.cpLoss}，主變：${m.pvZh.slice(0, 6).join(" ")}）`);
    }
  }
  return `引擎（深度 ${pa.depth}）對此局面 ${pa.moves.length} 個合法著法的排名：\n${top.join("\n")}`;
}

/** 組出事實清單與允許提到的著法 */
export function buildFacts(req: AskRequest): { facts: string; allowed: Set<string>; pos: Position } {
  const pos = parseFEN(req.fen);
  const legal = legalMoves(pos).map((m) => moveToChinese(pos, m));
  const allowed = new Set<string>(legal);
  const lines: string[] = [];
  lines.push(`局面 FEN：${req.fen}`);
  lines.push(`現在輪到${sideName(pos)}。${sideName(pos)}的合法著法：${legal.join(" ")}`);

  const pa = analysisByFen.get(toFEN(pos));
  if (pa) {
    lines.push(engineText(pa, req.move));
    for (const m of pa.moves) m.pvZh.forEach((z) => allowed.add(z));
  } else {
    lines.push("（這個局面沒有引擎分析）");
  }

  if (req.move) {
    try {
      const mv = parseChinese(pos, req.move);
      allowed.add(req.move);
      lines.push(`學生問的這一步：${req.move}。事實：${featuresToText(moveFeatures(pos, mv))}`);
      const after = makeMove(pos, mv);
      const paAfter = analysisByFen.get(toFEN(after));
      if (paAfter) {
        lines.push(`走完 ${req.move} 之後，對方（${sideName(after)}）的引擎排名：`);
        for (const m of paAfter.moves.slice(0, 3)) {
          lines.push(`  ${m.zh}（分數 ${m.cp ?? "?"}，主變：${m.pvZh.slice(0, 5).join(" ")}）`);
          allowed.add(m.zh);
          m.pvZh.forEach((z) => allowed.add(z));
        }
        legalMoves(after).forEach((m) => allowed.add(moveToChinese(after, m)));
      }
    } catch (e) {
      if (e instanceof NotationError) lines.push(`學生問的這一步「${req.move}」在這個局面不是合法著法。`);
      else throw e;
    }
  }
  if (req.explanation) lines.push(`App 顯示給學生的講解：「${req.explanation}」`);
  return { facts: lines.join("\n"), allowed, pos };
}

export function buildUserPrompt(req: AskRequest, facts: string): string {
  const hist = (req.history ?? []).slice(-3)
    .map((h) => `學生：${h.q}\n教練：${h.a}`).join("\n");
  return `${facts}\n\n${hist ? `之前的問答：\n${hist}\n\n` : ""}學生的問題：${req.question}`;
}

// ---------- 主流程 ----------

export async function ask(req: AskRequest, llm: LLM): Promise<AskResponse> {
  const { facts, allowed } = buildFacts(req);
  const user = buildUserPrompt(req, facts);
  let prompt = user;
  let last: { text: string; model: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await llm(SYSTEM, prompt);
    last = out;
    const bad = validateMoves([out.text], allowed);
    if (!bad.length) return { answer: out.text.trim(), verified: true, model: out.model };
    prompt = `${user}\n\n你上一版回答提到了資料裡沒有的著法：${bad.join("、")}。請只用資料裡的著法重寫。`;
  }
  return { answer: last!.text.trim(), verified: false, model: last!.model };
}

// ---------- 真的 LLM ----------

export async function anthropicLLM(): Promise<LLM> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const model = process.env.CCHESS_ASK_MODEL ?? "claude-sonnet-5-5";
  return async (system, user) => {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return { text: "這個問題我無法回答。", model: res.model };
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, model: res.model };
  };
}
