/**
 * 問教練後端：保管 API key、限流、快取。部署在 Render（見 render.yaml）。
 *
 *   POST /api/ask   { fen, move?, explanation?, question, history? } → { answer, verified, model }
 *   GET  /healthz
 *
 * 環境變數：
 *   ANTHROPIC_API_KEY        必要（CCHESS_MOCK=1 時不需要）
 *   CCHESS_ASK_MODEL         預設 claude-sonnet-5-5
 *   CCHESS_ALLOWED_ORIGINS   逗號分隔的允許來源；未設定則全部允許（靠限流保護）
 *   CCHESS_RATE_PER_HOUR     每個 IP 每小時的問題數，預設 30
 *   CCHESS_MOCK              設為 1 時用假的回答（本機測試介面用）
 *   PORT                     Render 會給
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { ask, anthropicLLM, loadAnalyses, type AskRequest, type LLM } from "./ask";

const PORT = Number(process.env.PORT ?? 8787);
const RATE = Number(process.env.CCHESS_RATE_PER_HOUR ?? 30);
const ORIGINS = (process.env.CCHESS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const mockLLM: LLM = async (_system, user) => ({
  text: `（測試用假回答）我收到的問題是：${user.split("學生的問題：").pop()?.slice(0, 60)}`,
  model: "mock",
});

// ---------- 限流與快取 ----------

const buckets = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const list = (buckets.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= RATE) { buckets.set(ip, list); return false; }
  list.push(now);
  buckets.set(ip, list);
  return true;
}

const cache = new Map<string, unknown>();
function cacheKey(req: AskRequest): string {
  return createHash("sha1").update(JSON.stringify([req.fen, req.move, req.question, req.history ?? []])).digest("hex");
}
function remember(key: string, value: unknown): void {
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

// ---------- HTTP ----------

function cors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin ?? "";
  const ok = ORIGINS.length === 0 || ORIGINS.includes(origin);
  if (ok) {
    res.setHeader("Access-Control-Allow-Origin", ORIGINS.length ? origin : "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  return ok;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit = 32 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => {
      data += c.toString();
      if (data.length > limit) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validate(body: unknown): AskRequest | string {
  if (!body || typeof body !== "object") return "body 必須是 JSON 物件";
  const b = body as Record<string, unknown>;
  if (typeof b.fen !== "string" || b.fen.length > 120) return "缺少 fen";
  if (typeof b.question !== "string" || !b.question.trim() || b.question.length > 1000) return "缺少 question（最多 1000 字）";
  if (b.move !== undefined && (typeof b.move !== "string" || b.move.length > 10)) return "move 格式錯誤";
  if (b.explanation !== undefined && (typeof b.explanation !== "string" || b.explanation.length > 2000)) return "explanation 太長";
  let history: AskRequest["history"];
  if (b.history !== undefined) {
    if (!Array.isArray(b.history) || b.history.length > 5) return "history 最多 5 輪";
    history = b.history.map((h) => ({ q: String((h as { q?: unknown }).q ?? "").slice(0, 1000), a: String((h as { a?: unknown }).a ?? "").slice(0, 2000) }));
  }
  return { fen: b.fen, question: b.question.trim(), move: b.move as string | undefined, explanation: b.explanation as string | undefined, history };
}

async function main(): Promise<void> {
  const n = loadAnalyses();
  const llm = process.env.CCHESS_MOCK === "1" ? mockLLM : await anthropicLLM();
  console.log(`載入 ${n} 個局面的引擎分析；模式：${process.env.CCHESS_MOCK === "1" ? "mock" : process.env.CCHESS_ASK_MODEL ?? "claude-sonnet-5-5"}`);

  const server = createServer(async (req, res) => {
    const ok = cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(ok ? 204 : 403); res.end(); return; }
    if (req.url === "/healthz") { json(res, 200, { ok: true, positions: n }); return; }
    if (req.method !== "POST" || req.url !== "/api/ask") { json(res, 404, { error: "not found" }); return; }
    if (!ok) { json(res, 403, { error: "origin not allowed" }); return; }
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "?";
    try {
      const parsed = validate(JSON.parse(await readBody(req)));
      if (typeof parsed === "string") { json(res, 400, { error: parsed }); return; }
      const key = cacheKey(parsed);
      const hit = cache.get(key);
      if (hit) { json(res, 200, { ...(hit as object), cached: true }); return; }
      if (!allow(ip)) { json(res, 429, { error: `每小時最多問 ${RATE} 題，請稍後再試。` }); return; }
      const out = await ask(parsed, llm);
      remember(key, out);
      json(res, 200, out);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("ask 失敗：", msg);
      json(res, msg.includes("FEN") || msg.includes("JSON") ? 400 : 500, { error: msg.includes("FEN") ? "局面格式錯誤" : "教練暫時無法回答，請稍後再試。" });
    }
  });
  server.listen(PORT, () => console.log(`問教練後端在 http://localhost:${PORT}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
