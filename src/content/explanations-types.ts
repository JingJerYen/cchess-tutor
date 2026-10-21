/**
 * LLM 產生、經過驗證與審稿的講解（由 pipeline/explain.ts 產生）。
 */
export interface GeneratedNode {
  note: string;
  detail: string;
  principle?: string;
  /** 審稿員是否通過 */
  reviewed: boolean;
  /** 審稿員留下的疑慮（沒通過時） */
  concerns?: string[];
}

export interface GeneratedMistake {
  zh: string;
  note: string;
  detail?: string;
  punish: { move: string; note: string }[];
  summary: string;
  principle?: string;
  reviewed: boolean;
  concerns?: string[];
}

export interface ExplanationsFile {
  opening: string;
  model: string;
  generatedAt: string;
  /** key 是從開局起的著法路徑，用「/」連接，例如「炮二平五/馬8進7」 */
  nodes: Record<string, GeneratedNode>;
  /** key 是 FEN；該局面下由產線挑出的常見錯誤 */
  mistakes: Record<string, GeneratedMistake[]>;
}
