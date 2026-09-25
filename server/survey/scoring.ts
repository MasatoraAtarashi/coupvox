import { SURVEY_ITEMS, type Kind } from "./items";

/**
 * スコアは 0〜100（= 0〜5 の平均 × 20）。
 * 応答性(R)と非応答性(I)は独立に動く前提の尺度なので、I を反転して R に合算しない。
 */
export interface Scores {
  responsive: number;
  insensitive: number;
}

export function scoreOf(values: Record<string, number>, kind: Kind): number | null {
  const items = SURVEY_ITEMS.filter(
    (item) => item.kind === kind && typeof values[item.id] === "number",
  );
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + values[item.id], 0);
  return Math.round((total / items.length) * 20);
}

export function computeScores(values: Record<string, number>): Scores {
  return {
    responsive: scoreOf(values, "R") ?? 0,
    insensitive: scoreOf(values, "I") ?? 0,
  };
}

/** 二人の応答性の差。大きいほど「関係の見え方」がずれている */
export function perceptionGap(a: number, b: number): number {
  return Math.abs(a - b);
}

export interface LowItem {
  id: string;
  text: string;
  score: number;
}

/**
 * 「相手が低くつけた項目」上位 n 件。
 * 悪さ = 応答性項目なら 5 - 得点、非応答性項目なら得点そのもの。
 */
export function lowestItems(values: Record<string, number>, limit = 3): LowItem[] {
  return SURVEY_ITEMS.filter((item) => typeof values[item.id] === "number")
    .map((item) => {
      const score = values[item.id];
      return { id: item.id, text: item.text, score, bad: item.kind === "R" ? 5 - score : score };
    })
    .sort((a, b) => b.bad - a.bad)
    .slice(0, limit)
    .map(({ id, text, score }) => ({ id, text, score }));
}
