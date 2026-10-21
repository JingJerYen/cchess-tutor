/**
 * 前端用的開局內容：手寫開局樹 ＋ 產線講解（若有）。
 * 這裡用 Vite 的 import.meta.glob 載入 JSON；產線腳本請改從 ./openings 與 ./tree 匯入。
 */
import type { Opening } from "./types";
import type { ExplanationsFile } from "./explanations-types";
import { rawOpenings } from "./openings";
import { applyExplanations } from "./tree";

export { mainLine, walk, applyExplanations } from "./tree";

const generated = import.meta.glob<ExplanationsFile>("./explanations/*.json", { eager: true, import: "default" });
const generatedByOpening = new Map<string, ExplanationsFile>();
for (const g of Object.values(generated)) generatedByOpening.set(g.opening, g);

export const openings: Opening[] = rawOpenings.map((o) => applyExplanations(o, generatedByOpening.get(o.id)));
