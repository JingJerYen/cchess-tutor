/**
 * 開局樹內容格式。
 *
 * 著法一律用中文記譜撰寫（可讀、可人工檢查），載入時解析成座標，
 * 並以測試確保每一步都合法。
 */
import type { Side } from "../engine/types";

export type NodeKind =
  /** 主線：本課教的走法 */
  | "main"
  /** 其他可行走法：不差，只是本課不展開 */
  | "alt"
  /** 常見錯誤：附懲罰線 */
  | "mistake";

export interface PunishStep {
  move: string;
  note: string;
}

export interface OpeningNode {
  move: string;
  kind?: NodeKind;
  /** 一句話重點（永遠顯示） */
  note: string;
  /** 詳細說明（點開才看） */
  detail?: string;
  /** 可以帶走的心法 */
  principle?: string;
  /** 後續著法；第一個 main 節點是主線 */
  children?: OpeningNode[];
  /** 錯著的懲罰推演：從這步之後開始，逐步播放 */
  punish?: PunishStep[];
  /** 推演結束後的結論 */
  punishSummary?: string;
  /** 這個節點的講解是否來自產線並通過審稿 */
  verified?: boolean;
}

export interface Opening {
  id: string;
  ecco: string;
  title: string;
  /** 一段話介紹這個開局 */
  summary: string;
  /** 學習者預設執哪一方 */
  learnerSide: Side;
  /** 內容是否經過離線產線（引擎＋審稿）驗證。false 時介面標示「草稿」 */
  verified: boolean;
  /** 內容來源說明 */
  source: string;
  root: OpeningNode[];
  /** 走完主線後的總結 */
  conclusion?: string;
}
