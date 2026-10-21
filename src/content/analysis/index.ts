import type { AnalysisFile } from "../analysis-types";

/** 由產線產生的引擎分析，依開局 id 查 */
const files = import.meta.glob<AnalysisFile>("./*.json", { eager: true, import: "default" });

const byOpening = new Map<string, AnalysisFile>();
for (const f of Object.values(files)) byOpening.set(f.opening, f);

export function analysisFor(openingId: string): AnalysisFile | undefined {
  return byOpening.get(openingId);
}
