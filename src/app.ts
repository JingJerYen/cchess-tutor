/**
 * 應用程式主體：三種模式（學習／測驗／自由走），共用一個棋盤。
 *
 * 「如果我走這步呢？」在學習與測驗模式都可用：
 * 在棋盤上走任何一步，App 會依照規則引擎與開局樹回答。
 */
import { makeMove, startPosition, toFEN } from "./engine/board";
import { explainIllegal, gameResult, inCheck, legalMovesFrom } from "./engine/moves";
import { moveToChinese, parseChinese } from "./engine/notation";
import { type Move, type Position, type Side, type Square, moveToICCS, sideOf } from "./engine/types";
import { mainLine, openings } from "./content";
import type { Opening, OpeningNode } from "./content/types";
import { createBoard, renderBoard } from "./ui/board";
import { analysisFor } from "./content/analysis";
import type { MoveEval, PositionAnalysis } from "./content/analysis-types";
import { describeMove } from "./engine/features";

type Mode = "learn" | "quiz" | "free";

interface Step {
  node: OpeningNode;
  before: Position;
  move: Move;
  after: Position;
}

interface Feedback {
  kind: "ok" | "so" | "bad" | "off" | "rule";
  title: string;
  note?: string;
  detail?: string;
  principle?: string;
  /** 按鈕：文字 → 動作 */
  actions: [string, () => void][];
  /** 回饋時棋盤要顯示的局面 */
  pos: Position;
  lastMove: Move | null;
  /** 質疑用：著法之前的局面與著法文字 */
  before?: Position;
  moveText?: string;
  /** 引擎怎麼看這一步（一行小字） */
  engine?: string;
}

interface PlaybackStep {
  label: string;
  note: string;
  move: Move;
  after: Position;
}

interface Playback {
  title: string;
  before: Position;
  steps: PlaybackStep[];
  index: number;
  summary?: string;
  principle?: string;
  onExit: () => void;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function sideName(s: Side): string {
  return s === "r" ? "紅方" : "黑方";
}

/** 使用者對某段講解的質疑 */
interface Objection {
  time: string;
  opening: string;
  /** 講解對應的局面（著法之前） */
  fen: string;
  move: string;
  explanation: string;
  text: string;
}

/** 引擎對這一步的看法，一行小字；沒有資料就回傳 undefined */
function engineLine(pa: PositionAnalysis | undefined, ev: MoveEval | undefined, isBook = false): string | undefined {
  if (!pa || !ev || ev.cpLoss === null) return undefined;
  const rank = pa.moves.indexOf(ev) + 1;
  const best = pa.moves[0];
  const loss = (ev.cpLoss / 100).toFixed(1);
  if (rank === 1) return "引擎：這也是它的第一選擇。";
  if (ev.cpLoss < 10) return `引擎：排第 ${rank}／${pa.moves.length}，跟最佳走法「${best?.zh ?? ""}」一樣好。`;
  if (isBook && ev.cpLoss >= 100) {
    // 引擎（尤其沒有 NNUE、深度有限時）對開局的品味不一定符合人類理論；書上的走法以實戰為準
    return `引擎在這個深度不喜歡這步（比「${best?.zh ?? ""}」差 ${loss} 兵），但這是人類實戰常見的走法；引擎對開局的判斷不一定準。`;
  }
  return `引擎：排第 ${rank}／${pa.moves.length}，比最佳走法「${best?.zh ?? ""}」差 ${loss} 兵。`;
}

const OBJECTIONS_KEY = "cchess.objections";

function loadObjections(): Objection[] {
  try {
    const raw = localStorage.getItem(OBJECTIONS_KEY);
    return raw ? (JSON.parse(raw) as Objection[]) : [];
  } catch {
    return [];
  }
}

function saveObjections(list: Objection[]): void {
  try {
    localStorage.setItem(OBJECTIONS_KEY, JSON.stringify(list));
  } catch {
    /* 無法存取本機儲存時就只留在記憶體 */
  }
}

/** 匯出成可以直接貼到對話裡的文字 */
function formatObjections(list: Objection[]): string {
  return list
    .map(
      (o, i) =>
        `${i + 1}. [${o.time.slice(0, 16).replace("T", " ")}] ${o.opening}\n` +
        `   局面：${o.fen}\n   著法：${o.move}\n   講解：${o.explanation}\n   我的疑問：${o.text}`,
    )
    .join("\n\n");
}

export class App {
  private readonly svg: SVGSVGElement;
  private readonly header: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly actions = new Map<string, () => void>();

  private mode: Mode = "learn";
  private readonly opening: Opening;
  private readonly line: Step[];
  private flipped = false;
  private learnerSide: Side;

  /** 目前棋盤局面與互動狀態 */
  private pos: Position = startPosition();
  private selected: Square | null = null;
  private lastMove: Move | null = null;
  private showDetail = false;
  private feedback: Feedback | null = null;
  private playback: Playback | null = null;

  /** 學習／測驗：已走過的主線步數 */
  private idx = 0;
  /** 測驗統計 */
  private quizCorrect = 0;
  private quizTotal = 0;
  private quizDone = false;
  private opponentNote: Step | null = null;

  /** 自由走 */
  private history: { before: Position; move: Move; text: string }[] = [];

  /** 質疑／看不懂的紀錄（存在瀏覽器本機，可複製貼出） */
  private objections: Objection[] = loadObjections();
  private askOpen = false;
  private showObjections = false;

  constructor(root: HTMLElement) {
    const opening = openings[0];
    if (!opening) throw new Error("沒有任何開局內容");
    this.opening = opening;
    this.learnerSide = opening.learnerSide;
    this.line = App.buildLine(opening);

    root.innerHTML = `
      <header></header>
      <nav class="tabs"></nav>
      <div class="board-wrap"></div>
      <section class="panel"></section>
    `;
    this.header = root.querySelector("header")!;
    this.panel = root.querySelector(".panel")!;
    this.svg = createBoard(root.querySelector(".board-wrap")!);
    this.renderTabs(root.querySelector("nav.tabs")!);
    this.setMode("learn");
  }

  private static buildLine(opening: Opening): Step[] {
    let pos = startPosition();
    return mainLine(opening).map((node) => {
      const move = parseChinese(pos, node.move);
      const before = pos;
      pos = makeMove(pos, move);
      return { node, before, move, after: pos };
    });
  }

  // ---------- 模式切換 ----------

  private renderTabs(nav: HTMLElement): void {
    const tabs: [Mode, string][] = [["learn", "學習"], ["quiz", "測驗"], ["free", "自由走"]];
    nav.innerHTML = tabs
      .map(([m, label]) => `<button data-mode="${m}" aria-pressed="${m === this.mode}">${label}</button>`)
      .join("");
    nav.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((b) => {
      b.onclick = () => this.setMode(b.dataset.mode as Mode);
    });
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.selected = null;
    this.feedback = null;
    this.playback = null;
    this.showDetail = false;
    this.askOpen = false;
    this.showObjections = false;
    if (mode === "learn") {
      this.idx = 0;
      this.syncToLine();
    } else if (mode === "quiz") {
      this.quizStart();
    } else {
      this.history = [];
      this.pos = startPosition();
      this.lastMove = null;
    }
    this.renderTabs(document.querySelector("nav.tabs")!);
    this.render();
  }

  /** 把棋盤同步到主線第 idx 步之後 */
  private syncToLine(): void {
    const step = this.line[this.idx - 1];
    this.pos = step ? step.after : startPosition();
    this.lastMove = step ? step.move : null;
    this.selected = null;
  }

  /** 目前局面（主線第 idx 步之後）的下一步候選 */
  private childrenAt(idx: number): OpeningNode[] {
    if (idx === 0) return this.opening.root;
    return this.line[idx - 1]?.node.children ?? [];
  }

  // ---------- 棋盤互動 ----------

  private onTap(s: Square): void {
    if (this.playback) return;
    if (this.mode === "quiz" && (this.quizDone || this.feedback)) return;
    if (this.mode === "quiz" && this.pos.turn !== this.learnerSide) return;
    if (this.mode === "learn" && this.feedback) return;

    const p = this.pos.board[s];
    if (this.selected === null) {
      if (p && sideOf(p) === this.pos.turn) this.selected = s;
      else if (p) this.flash(`現在輪到${sideName(this.pos.turn)}走。`);
      this.render();
      return;
    }
    if (s === this.selected) {
      this.selected = null;
    } else if (p && sideOf(p) === this.pos.turn) {
      this.selected = s;
    } else {
      const move: Move = { from: this.selected, to: s };
      const why = explainIllegal(this.pos, move);
      if (why) {
        this.feedback = {
          kind: "rule",
          title: "這步不合規則",
          note: why,
          actions: [["知道了", () => { this.feedback = null; this.render(); }]],
          pos: this.pos,
          lastMove: this.lastMove,
          before: this.pos,
          moveText: moveToICCS(move),
        };
      } else {
        this.selected = null;
        this.onMove(move);
      }
    }
    this.render();
  }

  /** 短暫提示：用回饋面板顯示，不另做 toast（電子墨水不適合閃爍） */
  private flash(text: string): void {
    this.feedback = {
      kind: "rule",
      title: text,
      actions: [["知道了", () => { this.feedback = null; this.render(); }]],
      pos: this.pos,
      lastMove: this.lastMove,
    };
  }

  private onMove(move: Move): void {
    if (this.mode === "free") {
      const text = moveToChinese(this.pos, move);
      this.history.push({ before: this.pos, move, text });
      this.pos = makeMove(this.pos, move);
      this.lastMove = move;
      return;
    }
    this.feedback = this.evaluate(move);
  }

  /** 「如果我走這步呢？」：對照開局樹回答 */
  private evaluate(move: Move): Feedback {
    const before = this.pos;
    const after = makeMove(before, move);
    const iccs = moveToICCS(move);
    const text = moveToChinese(before, move);
    const children = this.childrenAt(this.idx);
    const match = children.find((c) => moveToICCS(parseChinese(before, c.move)) === iccs);
    const mainNode = this.line[this.idx]?.node;
    const mainText = mainNode ? `本課主線是「${mainNode.move}」。` : "本課主線到這裡結束。";
    const back: [string, () => void] = [
      this.mode === "quiz" ? "重試這一題" : "回到課程",
      () => { this.feedback = null; this.syncToLine(); this.render(); },
    ];
    const followMain: [string, () => void] = [
      "照主線繼續",
      () => { this.feedback = null; this.advanceAlongMain(); },
    ];
    const pa = analysisFor(this.opening.id)?.positions[toFEN(before)];
    const ev = pa?.moves.find((m) => m.iccs === iccs);
    const engine = engineLine(pa, ev, !!match);
    const showPv: [string, () => void] | null = ev && ev.pvZh.length > 1
      ? ["看推演", () => this.startEnginePlayback(before, text, ev, back[1])]
      : null;

    if (!match) {
      if (this.mode === "quiz") this.quizTotal++;
      const common = { pos: after, lastMove: move, before, moveText: text, engine };
      const continueActions = mainNode ? [back, followMain] : [back];
      if (!ev || ev.cpLoss === null) {
        return {
          kind: "off",
          title: `${text}：本課沒有這一步`,
          note: `還沒有這一步的分析。${mainText}`,
          actions: continueActions,
          ...common,
        };
      }
      const loss = ev.cpLoss;
      const reply = ev.pvZh[1];
      const replyPos = makeMove(before, move);
      const replyDesc = reply ? describeMove(replyPos, parseChinese(replyPos, reply)) : "";
      const replyText = reply ? `對方最好的應對是「${reply}」${replyDesc ? "，" + replyDesc : ""}。` : "";
      if (loss < 30) {
        return {
          kind: "so",
          title: `${text}：也可以`,
          note: `引擎認為這步跟最佳走法差不多。本課不走這條路，所以沒有後續講解。${mainText}`,
          actions: showPv ? [...continueActions, showPv] : continueActions,
          ...common,
        };
      }
      if (loss < 100) {
        return {
          kind: "so",
          title: `${text}：稍差一點`,
          note: `不算錯，但有更好的走法。${replyText}${mainText}`,
          actions: showPv ? [...continueActions, showPv] : continueActions,
          ...common,
        };
      }
      return {
        kind: "bad",
        title: `${text}：${loss < 250 ? "明顯吃虧" : "大錯"}`,
        note: `引擎認為這步會損失約 ${(loss / 100).toFixed(1)} 個兵的價值。${replyText}`,
        actions: showPv ? [showPv, back] : [back],
        ...common,
      };
    }
    const kind = match.kind ?? "main";
    if (kind === "main") {
      if (this.mode === "quiz") { this.quizTotal++; this.quizCorrect++; }
      return {
        kind: "ok",
        title: `${text}：正確，這就是主線`,
        note: match.note,
        detail: match.detail,
        principle: match.principle,
        actions: [["繼續", () => { this.feedback = null; this.advanceAlongMain(); }]],
        pos: after,
        lastMove: move,
        before,
        moveText: text,
        engine,
      };
    }
    if (kind === "alt") {
      if (this.mode === "quiz") this.quizTotal++;
      return {
        kind: "so",
        title: `${text}：這步也可以`,
        note: `${match.note}${mainText}`,
        detail: match.detail,
        actions: mainNode ? [back, followMain] : [back],
        pos: after,
        lastMove: move,
        before,
        moveText: text,
        engine,
      };
    }
    if (this.mode === "quiz") this.quizTotal++;
    return {
      kind: "bad",
      title: `${text}：這步有問題`,
      note: match.note,
      detail: match.detail,
      actions: [
        ["看推演", () => this.startPlayback(match, before, back[1])],
        back,
      ],
      pos: after,
      lastMove: move,
      before,
      moveText: text,
      engine,
    };
  }

  /** 主線前進一步；測驗模式會接著自動走對方的主線回應 */
  private advanceAlongMain(): void {
    this.idx = Math.min(this.idx + 1, this.line.length);
    this.syncToLine();
    if (this.mode === "quiz") {
      this.opponentNote = null;
      const next = this.line[this.idx];
      if (next && next.before.turn !== this.learnerSide) {
        this.idx++;
        this.syncToLine();
        this.opponentNote = next;
      }
      if (this.idx >= this.line.length) this.quizDone = true;
    }
    this.render();
  }

  // ---------- 推演播放 ----------

  private startPlayback(node: OpeningNode, before: Position, onExit: () => void): void {
    const steps: PlaybackStep[] = [];
    let pos = before;
    const first = parseChinese(pos, node.move);
    pos = makeMove(pos, first);
    steps.push({ label: `${sideName(before.turn)}：${node.move}（你的走法）`, note: node.note, move: first, after: pos });
    for (const p of node.punish ?? []) {
      const m = parseChinese(pos, p.move);
      const side = pos.turn;
      pos = makeMove(pos, m);
      steps.push({ label: `${sideName(side)}：${p.move}`, note: p.note, move: m, after: pos });
    }
    this.playback = {
      title: `推演：如果走 ${node.move}`,
      before,
      steps,
      index: 0,
      summary: node.punishSummary,
      principle: node.principle,
      onExit,
    };
    this.feedback = null;
    this.render();
  }

  /** 用引擎主變做推演：每一步的說明由程式描述（吃子、將軍、捉子） */
  private startEnginePlayback(before: Position, firstZh: string, ev: MoveEval, onExit: () => void): void {
    const steps: PlaybackStep[] = [];
    let pos = before;
    ev.pvZh.forEach((zh, i) => {
      const m = parseChinese(pos, zh);
      const side = pos.turn;
      const desc = describeMove(pos, m);
      const label = `${sideName(side)}：${zh}${i === 0 ? "（你的走法）" : ""}`;
      pos = makeMove(pos, m);
      steps.push({ label, note: desc || (i === 1 ? "引擎的最佳應對。" : ""), move: m, after: pos });
    });
    let summary: string;
    if (ev.mate !== null) summary = ev.mate > 0 ? `引擎看到你有 ${ev.mate} 步殺。` : `引擎看到對方有 ${-ev.mate} 步殺。`;
    else if (ev.cp !== null) {
      const v = (Math.abs(ev.cp) / 100).toFixed(1);
      summary = ev.cp === 0 ? "這條線走完，引擎認為雙方均勢。" : `這條線走完，引擎認為你${ev.cp < 0 ? "落後" : "領先"}約 ${v} 個兵的價值。`;
    } else summary = "";
    this.playback = {
      title: `推演：如果走 ${firstZh}`,
      before,
      steps,
      index: 0,
      summary,
      onExit,
    };
    this.feedback = null;
    this.render();
  }

  // ---------- 測驗 ----------

  private quizStart(): void {
    this.idx = 0;
    this.quizCorrect = 0;
    this.quizTotal = 0;
    this.quizDone = false;
    this.opponentNote = null;
    this.syncToLine();
    const first = this.line[0];
    if (first && first.before.turn !== this.learnerSide) {
      this.idx = 1;
      this.syncToLine();
      this.opponentNote = first;
    }
  }

  // ---------- 畫面 ----------

  private btn(label: string, fn: () => void, cls = ""): string {
    const id = `a${this.actions.size}`;
    this.actions.set(id, fn);
    return `<button data-a="${id}" class="${cls}">${esc(label)}</button>`;
  }

  /** 面板標題列：左邊標題，右邊小工具按鈕 */
  private head(title: string, tools: string[] = []): string {
    return `<div class="head"><h2>${title}</h2><div class="tools">${tools.join("")}</div></div>`;
  }

  private tool(label: string, fn: () => void, active = false): string {
    return this.btn(label, fn, `tool${active ? " primary" : ""}`);
  }

  private flipTool(): string {
    return this.tool("翻轉", () => { this.flipped = !this.flipped; this.render(); });
  }

  private render(): void {
    this.actions.clear();
    const n = this.objections.length;
    const draft = this.opening.verified ? "" : `<span class="badge">草稿</span>`;
    this.header.innerHTML = `<h1>${esc(this.opening.title)}</h1><div>${draft}${this.tool(
      n ? `疑問 ${n}` : "疑問",
      () => { this.showObjections = !this.showObjections; this.render(); },
      this.showObjections,
    )}</div>`;

    let boardPos = this.pos;
    let last = this.lastMove;
    let marks: Square[] = [];
    if (this.playback) {
      const step = this.playback.steps[this.playback.index]!;
      boardPos = step.after;
      last = step.move;
    } else if (this.feedback) {
      boardPos = this.feedback.pos;
      last = this.feedback.lastMove;
      if (this.feedback.kind === "rule" && this.selected !== null) marks = [this.selected];
    }
    const targets = this.selected !== null && !this.feedback && !this.playback
      ? legalMovesFrom(this.pos, this.selected)
      : [];
    renderBoard(this.svg, boardPos, {
      flipped: this.flipped,
      selected: this.feedback || this.playback ? null : this.selected,
      targets,
      lastMove: last,
      marks,
      onTap: (s) => this.onTap(s),
    });

    let html: string;
    if (this.showObjections) html = this.renderObjections();
    else if (this.playback) html = this.renderPlayback(this.playback);
    else if (this.feedback) html = this.renderFeedback(this.feedback);
    else if (this.mode === "learn") html = this.renderLearn();
    else if (this.mode === "quiz") html = this.renderQuiz();
    else html = this.renderFree();

    this.panel.innerHTML = html;
    for (const host of [this.header, this.panel]) {
      host.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => {
        b.onclick = () => this.actions.get(b.dataset.a!)?.();
      });
    }
    const ta = this.panel.querySelector<HTMLTextAreaElement>("textarea:not([readonly])");
    if (ta) ta.focus();
  }

  // ---------- 質疑 ----------

  /** 「有疑問？」小按鈕，展開後是輸入框。ctx 是這段講解對應的局面與著法。 */
  private renderAsk(ctx: { before: Position; move: string; explanation: string }): string {
    if (!this.askOpen) {
      return `<div class="askline">${this.btn("有疑問？", () => { this.askOpen = true; this.render(); }, "link")}</div>`;
    }
    const submit = () => {
      const ta = this.panel.querySelector<HTMLTextAreaElement>("textarea");
      const text = ta?.value.trim() ?? "";
      if (!text) return;
      this.objections.push({
        time: new Date().toISOString(),
        opening: this.opening.title,
        fen: toFEN(ctx.before),
        move: ctx.move,
        explanation: ctx.explanation,
        text,
      });
      saveObjections(this.objections);
      this.askOpen = false;
      this.render();
    };
    return `
      <div class="ask">
        <textarea rows="2" placeholder="哪裡不同意、哪裡看不懂？"></textarea>
        <div class="row">
          ${this.btn("記下來", submit, "primary")}
          ${this.btn("取消", () => { this.askOpen = false; this.render(); })}
        </div>
      </div>
    `;
  }

  private renderObjections(): string {
    const list = this.objections;
    const text = formatObjections(list);
    const close = this.tool("關閉", () => { this.showObjections = false; this.render(); });
    if (!list.length) {
      return `${this.head("疑問紀錄", [close])}<p class="note muted">還沒有紀錄。每段講解下方都有「有疑問？」。</p>`;
    }
    const copy = this.btn("複製全部", async () => {
      this.showObjections = false;
      try {
        await navigator.clipboard.writeText(text);
        this.flash("已複製，可以貼到對話裡。");
      } catch {
        this.flash("瀏覽器不允許自動複製，請在「疑問」頁長按文字框手動複製。");
      }
      this.render();
    }, "primary");
    const clear = this.btn("全部刪除", () => {
      if (!confirm("確定刪除所有疑問紀錄？")) return;
      this.objections = [];
      saveObjections([]);
      this.render();
    });
    return `
      ${this.head(`疑問紀錄（${list.length}）`, [close])}
      <textarea class="export" rows="8" readonly>${esc(text)}</textarea>
      <div class="row">${copy}${clear}</div>
    `;
  }

  // ---------- 各面板 ----------

  private detailBlock(detail: string | undefined): string {
    if (!detail) return "";
    return this.showDetail
      ? `<div class="detail">${esc(detail)}</div>`
      : `<div class="askline">${this.btn("詳細說明…", () => { this.showDetail = true; this.render(); }, "link")}</div>`;
  }

  private renderFeedback(f: Feedback): string {
    const ask = f.before && f.moveText
      ? this.renderAsk({ before: f.before, move: f.moveText, explanation: [f.title, f.note, f.detail].filter(Boolean).join(" ") })
      : "";
    return `
      <div class="verdict ${f.kind}">${esc(f.title)}</div>
      ${f.note ? `<p class="note">${esc(f.note)}</p>` : ""}
      ${f.engine ? `<p class="muted">${esc(f.engine)}</p>` : ""}
      ${this.detailBlock(f.detail)}
      ${f.principle ? `<p class="principle">${esc(f.principle)}</p>` : ""}
      <div class="row">${f.actions.map(([label, fn], i) => this.btn(label, fn, i === 0 ? "primary" : "")).join("")}</div>
      ${ask}
    `;
  }

  private renderPlayback(pb: Playback): string {
    const atEnd = pb.index === pb.steps.length - 1;
    const list = pb.steps
      .map((s, i) => {
        const cls = i === pb.index ? "current" : i > pb.index ? "future" : "";
        const note = i <= pb.index ? `<br><span class="muted">${esc(s.note)}</span>` : "";
        return `<li class="${cls}">${esc(s.label)}${note}</li>`;
      })
      .join("");
    const tail = atEnd
      ? `${pb.summary ? `<p class="note">${esc(pb.summary)}</p>` : ""}
         ${pb.principle ? `<p class="principle">${esc(pb.principle)}</p>` : ""}`
      : "";
    const ask = atEnd
      ? this.renderAsk({
          before: pb.before,
          move: pb.steps.map((s) => s.label).join("，"),
          explanation: [...pb.steps.map((s) => s.note), pb.summary ?? ""].join(" "),
        })
      : "";
    const exit = this.tool("離開", () => { this.playback = null; this.askOpen = false; pb.onExit(); });
    return `
      ${this.head(esc(pb.title), [exit])}
      <ol class="steps">${list}</ol>
      ${tail}
      <div class="row">
        ${this.btn("上一步", () => { pb.index = Math.max(0, pb.index - 1); this.render(); })}
        ${atEnd
          ? this.btn("回到課程", () => { this.playback = null; this.askOpen = false; pb.onExit(); }, "primary")
          : this.btn("下一步", () => { pb.index = Math.min(pb.steps.length - 1, pb.index + 1); this.render(); }, "primary")}
      </div>
      ${ask}
    `;
  }

  private gotoLearn(idx: number): void {
    this.idx = Math.max(0, Math.min(this.line.length, idx));
    this.showDetail = false;
    this.askOpen = false;
    this.syncToLine();
    this.render();
  }

  private renderLearn(): string {
    const step = this.line[this.idx - 1];
    const tools = [this.tool("開頭", () => this.gotoLearn(0)), this.flipTool()];
    let body: string;
    if (!step) {
      body = `${this.head(esc(this.opening.title), tools)}<p class="note">${esc(this.opening.summary)}</p>`;
    } else {
      const n = Math.ceil(this.idx / 2);
      const who = sideName(step.before.turn);
      body = `
        ${this.head(`第 ${n} 回合 · ${who}　<span class="move">${esc(step.node.move)}</span>`, tools)}
        <p class="note">${esc(step.node.note)}</p>
        ${this.detailBlock(step.node.detail)}
        ${step.node.principle ? `<p class="principle">${esc(step.node.principle)}</p>` : ""}
      `;
      if (this.idx === this.line.length && this.opening.conclusion) {
        body += `<p class="note">${esc(this.opening.conclusion)}</p>`;
      }
    }

    // 下一步的其他選擇（變著與常見錯誤），做成一排小標籤
    const next = this.line[this.idx];
    const others = this.childrenAt(this.idx).filter((c) => (c.kind ?? "main") !== "main");
    let alts = "";
    if (next && others.length) {
      const chips = others.map((c) => {
        const fn = c.kind === "mistake"
          ? () => this.startPlayback(c, this.pos, () => { this.syncToLine(); this.render(); })
          : () => {
              const m = parseChinese(this.pos, c.move);
              this.feedback = {
                kind: "so", title: `${c.move}：也可以`, note: c.note, detail: c.detail,
                actions: [["回到課程", () => { this.feedback = null; this.render(); }]],
                pos: makeMove(this.pos, m), lastMove: m, before: this.pos, moveText: c.move,
              };
              this.render();
            };
        return this.btn(`${c.kind === "mistake" ? "✗ " : ""}${c.move}`, fn, "chip");
      });
      alts = `<div class="chips"><span class="muted">${esc(sideName(next.before.turn))}其他走法</span>${chips.join("")}</div>`;
    }

    const ask = step
      ? this.renderAsk({
          before: step.before,
          move: step.node.move,
          explanation: [step.node.note, step.node.detail].filter(Boolean).join(" "),
        })
      : "";

    return `
      ${body}
      ${alts}
      <div class="row">
        ${this.btn("上一步", () => this.gotoLearn(this.idx - 1))}
        ${this.btn(this.idx === 0 ? "開始" : "下一步", () => this.gotoLearn(this.idx + 1), "primary")}
      </div>
      ${ask}
    `;
  }

  private renderQuiz(): string {
    const tools = [
      this.tool(this.learnerSide === "r" ? "換執黑" : "換執紅", () => {
        this.learnerSide = this.learnerSide === "r" ? "b" : "r";
        this.flipped = this.learnerSide === "b";
        this.quizStart();
        this.render();
      }),
      this.tool("重來", () => { this.quizStart(); this.render(); }),
      this.flipTool(),
    ];
    const score = `答對 ${this.quizCorrect}/${this.quizTotal}`;
    if (this.quizDone) {
      return `
        ${this.head(`測驗結束 · ${score}`, tools)}
        ${this.opening.conclusion ? `<p class="note">${esc(this.opening.conclusion)}</p>` : ""}
      `;
    }
    const opp = this.opponentNote
      ? `<p class="note">對方 <strong>${esc(this.opponentNote.node.move)}</strong>：${esc(this.opponentNote.node.note)}</p>`
      : "";
    const n = Math.floor(this.idx / 2) + 1;
    return `
      ${this.head(`第 ${n} 回合 · ${sideName(this.learnerSide)}`, tools)}
      ${opp}
      <div class="move">你走哪步？</div>
      <p class="muted">${score}</p>
    `;
  }

  private renderFree(): string {
    const result = gameResult(this.pos);
    let status: string;
    if (result === "checkmate") status = `將死，${sideName(this.pos.turn === "r" ? "b" : "r")}勝`;
    else if (result === "stalemate") status = `困斃，${sideName(this.pos.turn)}判負`;
    else if (inCheck(this.pos, this.pos.turn)) status = `將軍！${sideName(this.pos.turn)}應將`;
    else status = `輪到${sideName(this.pos.turn)}`;

    const tools = [
      this.tool("悔棋", () => {
        const h = this.history.pop();
        if (h) { this.pos = h.before; this.lastMove = this.history.at(-1)?.move ?? null; }
        this.selected = null;
        this.render();
      }),
      this.tool("重來", () => { this.history = []; this.pos = startPosition(); this.lastMove = null; this.selected = null; this.render(); }),
      this.flipTool(),
    ];
    const list = this.history
      .map((h, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${h.text}` : h.text))
      .join("　");
    return `
      ${this.head(esc(status), tools)}
      <div class="movelist">${esc(list)}</div>
    `;
  }
}
