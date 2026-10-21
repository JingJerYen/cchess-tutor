/**
 * 應用程式主體：三種模式（學習／測驗／自由走），共用一個棋盤。
 *
 * 「如果我走這步呢？」在學習與測驗模式都可用：
 * 在棋盤上走任何一步，App 會依照規則引擎與開局樹回答。
 */
import { makeMove, startPosition } from "./engine/board";
import { explainIllegal, gameResult, inCheck, legalMovesFrom } from "./engine/moves";
import { moveToChinese, parseChinese } from "./engine/notation";
import { type Move, type Position, type Side, type Square, moveToICCS, sideOf } from "./engine/types";
import { mainLine, openings } from "./content";
import type { Opening, OpeningNode } from "./content/types";
import { createBoard, renderBoard } from "./ui/board";

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
}

interface PlaybackStep {
  label: string;
  note: string;
  move: Move;
  after: Position;
}

interface Playback {
  title: string;
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
      <p class="legend">雙圈白底＝紅方，單圈灰底＝黑方。點棋子再點目的地。</p>
      <section class="panel"></section>
      <footer>cchess-tutor · 內容標示「草稿」者尚未經過引擎與審稿驗證。</footer>
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

    if (!match) {
      if (this.mode === "quiz") this.quizTotal++;
      return {
        kind: "off",
        title: `${text}：這步不在本課的開局樹裡`,
        note:
          "目前還沒有這一步的講解。接上引擎之後（下一階段），App 會在這裡算出對方的應對並推演給你看。" +
          mainText,
        actions: mainNode ? [back, followMain] : [back],
        pos: after,
        lastMove: move,
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
      steps,
      index: 0,
      summary: node.punishSummary,
      principle: node.principle,
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

  private render(): void {
    this.actions.clear();
    const draft = this.opening.verified ? "" : `<span class="badge">草稿</span>`;
    this.header.innerHTML = `<h1>${esc(this.opening.title)} <span class="muted">${esc(this.opening.ecco)}</span></h1>${draft}`;

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
    if (this.playback) html = this.renderPlayback(this.playback);
    else if (this.feedback) html = this.renderFeedback(this.feedback);
    else if (this.mode === "learn") html = this.renderLearn();
    else if (this.mode === "quiz") html = this.renderQuiz();
    else html = this.renderFree();

    this.panel.innerHTML = html;
    this.panel.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => {
      b.onclick = () => this.actions.get(b.dataset.a!)?.();
    });
  }

  private flipButton(): string {
    return this.btn("翻轉棋盤", () => { this.flipped = !this.flipped; this.render(); });
  }

  private renderFeedback(f: Feedback): string {
    const detail = f.detail
      ? this.showDetail
        ? `<div class="detail">${esc(f.detail)}</div>`
        : this.btn("詳細說明", () => { this.showDetail = true; this.render(); })
      : "";
    return `
      <div class="verdict ${f.kind}">${esc(f.title)}</div>
      ${f.note ? `<p class="note">${esc(f.note)}</p>` : ""}
      ${detail}
      ${f.principle ? `<p class="principle">${esc(f.principle)}</p>` : ""}
      <div class="row">${f.actions.map(([label, fn], i) => this.btn(label, fn, i === 0 ? "primary" : "")).join("")}</div>
    `;
  }

  private renderPlayback(pb: Playback): string {
    const atEnd = pb.index === pb.steps.length - 1;
    const list = pb.steps
      .map((s, i) => {
        const cls = i === pb.index ? "current" : i > pb.index ? "future" : "";
        const note = i <= pb.index ? ` — ${esc(s.note)}` : "";
        return `<li class="${cls}">${i + 1}/${pb.steps.length}　${esc(s.label)}${note}</li>`;
      })
      .join("");
    const tail = atEnd
      ? `${pb.summary ? `<p class="note"><strong>結論：</strong>${esc(pb.summary)}</p>` : ""}
         ${pb.principle ? `<p class="principle">${esc(pb.principle)}</p>` : ""}`
      : "";
    return `
      <h2>${esc(pb.title)}</h2>
      <ul class="steps">${list}</ul>
      ${tail}
      <div class="row">
        ${this.btn("上一步", () => { pb.index = Math.max(0, pb.index - 1); this.render(); })}
        ${this.btn("下一步", () => { pb.index = Math.min(pb.steps.length - 1, pb.index + 1); this.render(); }, atEnd ? "" : "primary")}
        ${this.btn("離開推演", () => { this.playback = null; pb.onExit(); }, atEnd ? "primary" : "")}
      </div>
    `;
  }

  private renderLearn(): string {
    const step = this.line[this.idx - 1];
    let body: string;
    if (!step) {
      body = `<h2>${esc(this.opening.title)}</h2><p class="note">${esc(this.opening.summary)}</p>
        <p class="muted">按「下一步」開始逐步講解。你也可以隨時在棋盤上走走看，App 會告訴你那一步怎麼樣。</p>`;
    } else {
      const n = Math.ceil(this.idx / 2);
      const who = sideName(step.before.turn);
      const detail = step.node.detail
        ? this.showDetail
          ? `<div class="detail">${esc(step.node.detail)}</div>`
          : this.btn("詳細說明", () => { this.showDetail = true; this.render(); })
        : "";
      body = `
        <h2>第 ${n} 回合 · ${who}</h2>
        <div class="move">${esc(step.node.move)}</div>
        <p class="note">${esc(step.node.note)}</p>
        ${detail}
        ${step.node.principle ? `<p class="principle">${esc(step.node.principle)}</p>` : ""}
      `;
      if (this.idx === this.line.length && this.opening.conclusion) {
        body += `<p class="note"><strong>小結：</strong>${esc(this.opening.conclusion)}</p>`;
      }
    }

    // 下一步的其他選擇（變著與常見錯誤）
    const next = this.line[this.idx];
    const others = this.childrenAt(this.idx).filter((c) => (c.kind ?? "main") !== "main");
    let alts = "";
    if (next && others.length) {
      const who = sideName(next.before.turn);
      alts = `<p class="muted">接下來${who}的主線是「${esc(next.node.move)}」。其他走法：</p><ul class="alts">` +
        others.map((c) => {
          const tag = c.kind === "mistake" ? "✗ 常見錯誤" : "○ 也可以";
          const fn = c.kind === "mistake"
            ? () => this.startPlayback(c, this.pos, () => { this.syncToLine(); this.render(); })
            : () => { this.feedback = {
                kind: "so", title: `${c.move}：這步也可以`, note: c.note, detail: c.detail,
                actions: [["回到課程", () => { this.feedback = null; this.render(); }]],
                pos: makeMove(this.pos, parseChinese(this.pos, c.move)),
                lastMove: parseChinese(this.pos, c.move),
              }; this.render(); };
          return `<li>${this.btn(`${tag}　${c.move}`, fn)}</li>`;
        }).join("") + `</ul>`;
    }

    return `
      ${body}
      ${alts}
      <div class="row">
        ${this.btn("回開頭", () => { this.idx = 0; this.showDetail = false; this.syncToLine(); this.render(); })}
        ${this.btn("上一步", () => { this.idx = Math.max(0, this.idx - 1); this.showDetail = false; this.syncToLine(); this.render(); })}
        ${this.btn("下一步", () => { this.idx = Math.min(this.line.length, this.idx + 1); this.showDetail = false; this.syncToLine(); this.render(); }, "primary")}
        ${this.flipButton()}
      </div>
    `;
  }

  private renderQuiz(): string {
    const score = `<p class="muted">答對 ${this.quizCorrect} / ${this.quizTotal}</p>`;
    const sideBtn = this.btn(`我執${this.learnerSide === "r" ? "紅" : "黑"}（切換）`, () => {
      this.learnerSide = this.learnerSide === "r" ? "b" : "r";
      this.flipped = this.learnerSide === "b";
      this.quizStart();
      this.render();
    });
    const restart = this.btn("重新開始", () => { this.quizStart(); this.render(); });
    if (this.quizDone) {
      return `
        <h2>測驗結束</h2>
        ${score}
        ${this.opening.conclusion ? `<p class="note">${esc(this.opening.conclusion)}</p>` : ""}
        <div class="row">${restart}${sideBtn}${this.flipButton()}</div>
      `;
    }
    const opp = this.opponentNote
      ? `<p class="note">對方走了「${esc(this.opponentNote.node.move)}」：${esc(this.opponentNote.node.note)}</p>`
      : "";
    const n = Math.floor(this.idx / 2) + 1;
    return `
      <h2>第 ${n} 回合 · 輪到你（${sideName(this.learnerSide)}）</h2>
      ${opp}
      <div class="move">你走哪步？</div>
      <p class="muted">在棋盤上走出你認為的下一步。走錯沒關係，App 會告訴你為什麼。</p>
      ${score}
      <div class="row">${restart}${sideBtn}${this.flipButton()}</div>
    `;
  }

  private renderFree(): string {
    const result = gameResult(this.pos);
    let status: string;
    if (result === "checkmate") status = `將死！${sideName(this.pos.turn === "r" ? "b" : "r")}勝。`;
    else if (result === "stalemate") status = `困斃！${sideName(this.pos.turn)}無子可動，判負。`;
    else if (inCheck(this.pos, this.pos.turn)) status = `將軍！輪到${sideName(this.pos.turn)}應將。`;
    else status = `輪到${sideName(this.pos.turn)}。`;

    const list = this.history
      .map((h, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${h.text}` : h.text))
      .join("　");
    return `
      <h2>自由走</h2>
      <p class="note">${esc(status)}</p>
      <p class="muted">兩邊都由你來走，用來熟悉規則。走不合規則的棋，App 會說明原因。</p>
      <div class="row">
        ${this.btn("悔棋", () => {
          const h = this.history.pop();
          if (h) { this.pos = h.before; this.lastMove = this.history.at(-1)?.move ?? null; }
          this.selected = null;
          this.render();
        })}
        ${this.btn("重新開始", () => { this.history = []; this.pos = startPosition(); this.lastMove = null; this.selected = null; this.render(); })}
        ${this.flipButton()}
      </div>
      <div class="movelist">${esc(list)}</div>
    `;
  }
}
