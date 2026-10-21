/**
 * UCI 引擎包裝。支援兩種後端：
 *
 * - wasm：npm 的 fairy-stockfish-nnue.wasm，直接在 Node 裡跑，不需要下載執行檔。
 *   座標用 1–10 列（a1–i10），FEN 與象棋標準相同。
 * - binary：任何 UCI 象棋引擎執行檔（Pikafish、原生 Fairy-Stockfish）。
 *   Pikafish 的座標是 0–9 列（a0–i9），與本專案內部的 ICCS 一致。
 *
 * 對外一律用本專案的 ICCS（a0–i9）；座標轉換在這一層處理。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

export type RankStyle = "0-9" | "1-10";

export interface EngineConfig {
  backend: "wasm" | "binary";
  /** binary 後端的執行檔路徑 */
  path?: string;
  /** 引擎的座標列號風格；wasm 固定 1-10，Pikafish 是 0-9 */
  ranks?: RankStyle;
  threads?: number;
  hashMb?: number;
  /** NNUE 權重檔（有的話） */
  evalFile?: string;
}

export interface EngineLine {
  /** 本專案 ICCS，例如 h2e2 */
  move: string;
  /** 以走子方觀點的分數（厘兵）；有殺棋時為 null */
  cp: number | null;
  /** 幾步殺（正：走子方殺；負：被殺） */
  mate: number | null;
  depth: number;
  /** 主變，ICCS */
  pv: string[];
}

export interface AnalyzeOptions {
  depth: number;
  multipv?: number;
  /** 只搜尋這些著法（ICCS） */
  searchmoves?: string[];
}

/** 引擎座標 ⇄ ICCS（只差列號是否加一） */
export function toEngineMove(iccs: string, ranks: RankStyle): string {
  if (ranks === "0-9") return iccs;
  const conv = (s: string) => s[0]! + String(Number(s.slice(1)) + 1);
  return conv(iccs.slice(0, 2)) + conv(iccs.slice(2, 4));
}
export function fromEngineMove(m: string, ranks: RankStyle): string {
  if (ranks === "0-9") return m;
  const re = /^([a-i])(\d{1,2})([a-i])(\d{1,2})$/.exec(m);
  if (!re) throw new Error(`看不懂引擎著法：${m}`);
  return `${re[1]}${Number(re[2]) - 1}${re[3]}${Number(re[4]) - 1}`;
}

interface Transport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  close(): void;
}

async function wasmTransport(): Promise<Transport> {
  const dir = path.dirname(require.resolve("fairy-stockfish-nnue.wasm/package.json"));
  const Stockfish = require(path.join(dir, "stockfish.js")) as (opts: object) => Promise<{
    postMessage(s: string): void;
    addMessageListener(cb: (s: string) => void): void;
    terminate(): void;
  }>;
  // 新版 Node 有全域 fetch，Emscripten 會誤用它讀本機檔案；直接餵 wasmBinary 繞過。
  const sf = await Stockfish({
    wasmBinary: readFileSync(path.join(dir, "stockfish.wasm")),
    locateFile: (f: string) => path.join(dir, f),
  });
  const listeners: ((l: string) => void)[] = [];
  sf.addMessageListener((l) => listeners.forEach((cb) => cb(l)));
  return {
    send: (c) => sf.postMessage(c),
    onLine: (cb) => listeners.push(cb),
    close: () => {
      sf.postMessage("quit");
      setTimeout(() => sf.terminate(), 100);
    },
  };
}

function binaryTransport(bin: string): Transport {
  const proc: ChildProcessWithoutNullStreams = spawn(bin, [], { stdio: "pipe" });
  const listeners: ((l: string) => void)[] = [];
  let buf = "";
  proc.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) listeners.forEach((cb) => cb(l.trimEnd()));
  });
  proc.stderr.on("data", (d: Buffer) => process.stderr.write(d));
  return {
    send: (c) => proc.stdin.write(c + "\n"),
    onLine: (cb) => listeners.push(cb),
    close: () => {
      proc.stdin.write("quit\n");
      setTimeout(() => proc.kill(), 500);
    },
  };
}

export class Engine {
  private transport!: Transport;
  private readonly ranks: RankStyle;
  private waiters: { test: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private infoLines: string[] = [];
  public name = "unknown";

  constructor(private readonly cfg: EngineConfig) {
    this.ranks = cfg.ranks ?? (cfg.backend === "wasm" ? "1-10" : "0-9");
  }

  async init(): Promise<void> {
    this.transport = this.cfg.backend === "wasm" ? await wasmTransport() : binaryTransport(this.cfg.path!);
    this.transport.onLine((l) => this.handle(l));
    this.send("uci");
    await this.waitFor((l) => l === "uciok");
    if (this.cfg.backend === "wasm") this.send("setoption name UCI_Variant value xiangqi");
    this.send(`setoption name Threads value ${this.cfg.threads ?? 4}`);
    this.send(`setoption name Hash value ${this.cfg.hashMb ?? 256}`);
    if (this.cfg.evalFile) this.send(`setoption name EvalFile value ${this.cfg.evalFile}`);
    await this.isReady();
  }

  private handle(line: string): void {
    if (line.startsWith("id name ")) this.name = line.slice(8);
    if (line.startsWith("info ") && line.includes(" pv ")) this.infoLines.push(line);
    const i = this.waiters.findIndex((w) => w.test(line));
    if (i >= 0) {
      const [w] = this.waiters.splice(i, 1);
      w!.resolve(line);
    }
  }

  private send(cmd: string): void {
    this.transport.send(cmd);
  }

  private waitFor(test: (l: string) => boolean): Promise<string> {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }

  async isReady(): Promise<void> {
    this.send("isready");
    await this.waitFor((l) => l === "readyok");
  }

  /** 分析一個局面，回傳各 multipv 線（最好的在前） */
  async analyze(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]> {
    const multipv = opts.multipv ?? 1;
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send("ucinewgame");
    await this.isReady();
    this.send(`position fen ${fen}`);
    this.infoLines = [];
    const sm = opts.searchmoves?.length
      ? " searchmoves " + opts.searchmoves.map((m) => toEngineMove(m, this.ranks)).join(" ")
      : "";
    this.send(`go depth ${opts.depth}${sm}`);
    await this.waitFor((l) => l.startsWith("bestmove"));
    return this.collect(multipv);
  }

  /** 從 info 行裡取每個 multipv 最後（最深）的一筆 */
  private collect(multipv: number): EngineLine[] {
    const best = new Map<number, EngineLine>();
    for (const line of this.infoLines) {
      const parsed = parseInfo(line, this.ranks);
      if (!parsed) continue;
      const prev = best.get(parsed.index);
      if (!prev || parsed.line.depth >= prev.depth) best.set(parsed.index, parsed.line);
    }
    const out: EngineLine[] = [];
    for (let i = 1; i <= multipv; i++) {
      const l = best.get(i);
      if (l) out.push(l);
    }
    return out;
  }

  close(): void {
    this.transport.close();
  }
}

function parseInfo(line: string, ranks: RankStyle): { index: number; line: EngineLine } | null {
  const tok = line.split(/\s+/);
  let depth = 0, index = 1, cp: number | null = null, mate: number | null = null;
  let pv: string[] = [];
  for (let i = 0; i < tok.length; i++) {
    const t = tok[i];
    if (t === "depth") depth = Number(tok[++i]);
    else if (t === "multipv") index = Number(tok[++i]);
    else if (t === "score") {
      const kind = tok[++i];
      const v = Number(tok[++i]);
      if (kind === "cp") cp = v;
      else if (kind === "mate") mate = v;
      // lowerbound / upperbound 的分數不精確，略過
      if (tok[i + 1] === "lowerbound" || tok[i + 1] === "upperbound") return null;
    } else if (t === "pv") {
      pv = tok.slice(i + 1).map((m) => fromEngineMove(m, ranks));
      break;
    }
  }
  if (!pv.length) return null;
  return { index, line: { move: pv[0]!, cp, mate, depth, pv } };
}

/** 從環境變數決定用哪個引擎：CCHESS_ENGINE=/path/to/pikafish，否則用 wasm */
export function engineFromEnv(): Engine {
  const bin = process.env.CCHESS_ENGINE;
  if (bin) {
    return new Engine({
      backend: "binary",
      path: bin,
      ranks: (process.env.CCHESS_ENGINE_RANKS as RankStyle | undefined) ?? "0-9",
      threads: Number(process.env.CCHESS_THREADS ?? 4),
      evalFile: process.env.CCHESS_EVALFILE,
    });
  }
  return new Engine({ backend: "wasm", threads: Number(process.env.CCHESS_THREADS ?? 4) });
}
