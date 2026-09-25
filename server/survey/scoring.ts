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

export interface GapItem {
  id: string;
  text: string;
  /** 自分がこの項目で相手を評定した点 */
  mine: number;
  /** 相手が同じ項目で自分を評定した点 */
  theirs: number;
  diff: number;
}

/**
 * 同じ項目に対する「自分が相手に感じたこと」と「相手が自分に感じたこと」の差。
 *
 * 16 項目はどれも「私のパートナーは〜」と相手を評定する形なので、同じ項目でも
 * 二人の回答は評定の向きが逆になる。差が大きい項目は「片方は満たされていると
 * 感じ、もう片方はそう感じていない」という非対称が起きている場所で、そこが
 * 対話の糸口になる。どちらが正しいかではなく、見え方が違うことを示す指標。
 */
export function itemGaps(
  mineValues: Record<string, number>,
  theirsValues: Record<string, number>,
  limit = 3,
): GapItem[] {
  return SURVEY_ITEMS.filter(
    (item) => typeof mineValues[item.id] === "number" && typeof theirsValues[item.id] === "number",
  )
    .map((item) => {
      const mine = mineValues[item.id];
      const theirs = theirsValues[item.id];
      return { id: item.id, text: item.text, mine, theirs, diff: Math.abs(mine - theirs) };
    })
    .filter((gap) => gap.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, limit);
}

export interface ItemDelta {
  id: string;
  text: string;
  from: number;
  to: number;
}

/** 前回からの動きが大きかった項目。±1 は揺らぎとして捨て、2 以上だけを変化として扱う */
export function itemDeltas(
  previousValues: Record<string, number>,
  currentValues: Record<string, number>,
  limit = 3,
): ItemDelta[] {
  return SURVEY_ITEMS.filter(
    (item) =>
      typeof previousValues[item.id] === "number" && typeof currentValues[item.id] === "number",
  )
    .map((item) => ({
      id: item.id,
      text: item.text,
      from: previousValues[item.id],
      to: currentValues[item.id],
    }))
    .filter((delta) => Math.abs(delta.to - delta.from) >= 2)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, limit);
}
