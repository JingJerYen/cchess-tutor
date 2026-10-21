/**
 * 講解文字的著法驗證：講解裡出現的每個中文記譜記號，都必須在「允許清單」裡
 * （走到這裡的著法、引擎列出的著法與主變）。這是防止 LLM（或人）編造著法的那道閘。
 */

/** 文字裡出現的所有中文記譜記號 */
// 路數可以省略的只有「前／中／後」開頭的寫法，否則「炮退一步」這種散文會被誤判成著法
export const MOVE_RE = /(?:[前中後][車馬炮砲相象仕士兵卒帥將]|[車馬炮砲相象仕士兵卒帥將][一二三四五六七八九1-9])[進退平][一二三四五六七八九1-9]/g;

export function movesMentioned(text: string): string[] {
  return [...new Set(text.match(MOVE_RE) ?? [])];
}

/** 回傳不在允許清單裡的著法 */
export function validateMoves(texts: string[], allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const t of texts) for (const m of movesMentioned(t)) if (!allowed.has(m)) bad.push(m);
  return [...new Set(bad)];
}
