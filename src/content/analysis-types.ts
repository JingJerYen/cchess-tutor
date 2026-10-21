/**
 * 引擎分析結果的格式（由 pipeline/analyze.ts 產生，前端直接載入）。
 */
import type { Side } from "../engine/types";

export interface MoveEval {
  iccs: string;
  zh: string;
  /** 走子方觀點的分數（厘兵）。殺棋時為 null，看 mate */
  cp: number | null;
  mate: number | null;
  /** 與該局面最佳著法的差距（≥0）；引擎沒給分數時為 null */
  cpLoss: number | null;
  /** 主變（ICCS），第一步就是這步本身 */
  pv: string[];
  /** 主變的中文記譜（已驗證合法） */
  pvZh: string[];
}

export interface PositionAnalysis {
  turn: Side;
  depth: number;
  /** 所有合法著法，最佳在前 */
  moves: MoveEval[];
  /** 開局樹上在此局面的著法，以及它們在引擎眼中的排名 */
  book: { zh: string; rank: number | null; cpLoss: number | null }[];
}

export interface AnalysisFile {
  opening: string;
  engine: { name: string; depth: number };
  generatedAt: string;
  /** key 是 FEN */
  positions: Record<string, PositionAnalysis>;
}
