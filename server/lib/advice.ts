import { getItem } from "../survey/items";
import { logger } from "../logger";
import type { TriageResult } from "./triage";

/**
 * Workers AI による提案生成。
 * 「パートナーが自分（閲覧者）をどう感じているか」を入力に、閲覧者が今週試せる行動を返す。
 * Jev が速い判定（System 1）、こちらが文章生成（System 2）。
 */

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface AdviceInput {
  /** パートナーが付けた項目ごとの得点（0〜5） */
  partnerValues: Record<string, number>;
  /** パートナーのコメント（共有されている場合のみ） */
  partnerComment: string | null;
  /** パートナーのコメントの Jev 判定（共有されている場合のみ） */
  partnerTriage: TriageResult | null;
  /** パートナーが感じた応答性・非応答性の推移（古い順、0〜100） */
  trendResponsive: number[];
  trendInsensitive: number[];
}

export interface Advice {
  lead: string;
  lines: string[];
  generatedBy: string;
}

const FALLBACK: Advice = {
  lead: "相手がつけた点数から、いまの手応えを見てみてください。数字そのものより、低くついた項目が何かに目を向けると話しやすくなります。",
  lines: [
    "今週は1回でいい。相手が話しはじめたら、解決策を出す前に「それでどう思ったの？」と一度だけ聞き返してみてください。",
    "「あとで」と言ったときは、いつなら話せるかをその場で決める。宙に浮いたままが一番こたえます。",
  ],
  generatedBy: "fallback",
};

const SYSTEM_PROMPT = `あなたは夫婦・パートナー関係の対話を支援するコーチです。
与えられるのは「パートナーからの応答性知覚（PPR）」尺度の結果と自由記述です。

守ること:
- 断定しすぎない。評価やジャッジをしない。
- どちらかを責める書き方にしない。
- 「今週1回だけ」のレベルで実行できる粒度にする。
- 診断や専門的助言の代わりになることを言わない。
- 「です・ます」のやわらかい口調で書く。言い切りや命令形にしない。
- 尺度名（PPR・応答性知覚など）や点数の羅列を本文に書かない。読む人が自分ごととして読める言葉にする。
- 指定の文字数を必ず守る。長い説明を足さない。

必ず次の JSON だけを出力すること（前後に説明やコードブロックを付けない）:
{"lead":"いまのふたりの状況を受けとめる1〜2文・40〜80文字","lines":["今週すぐ試せる具体的な行動を1文・40〜80文字","もう1つ、別の角度から1文・40〜80文字"]}`;

function describe(input: AdviceInput): string {
  const lines = Object.entries(input.partnerValues)
    .map(([id, value]) => {
      const item = getItem(id);
      return item ? `${item.text}：${value}/5` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const parts = ["パートナーがあなたについて付けた点数（0〜5）:", lines];

  if (input.trendResponsive.length >= 2) {
    const first = input.trendResponsive[0];
    const last = input.trendResponsive[input.trendResponsive.length - 1];
    parts.push(
      `パートナーが感じる応答性の推移: ${first} → ${last}（0〜100、直近 ${input.trendResponsive.length} 回）`,
    );
  }
  if (input.trendInsensitive.length >= 2) {
    const first = input.trendInsensitive[0];
    const last = input.trendInsensitive[input.trendInsensitive.length - 1];
    parts.push(`非応答性の推移: ${first} → ${last}`);
  }
  if (input.partnerComment) {
    parts.push(`パートナーのコメント:「${input.partnerComment}」`);
  }
  if (input.partnerTriage) {
    parts.push(
      `コメントの自動判定: 話題=${input.partnerTriage.topicLabel} / 困り度=${input.partnerTriage.urgencyLabel} / トーン=${input.partnerTriage.toneLabel}`,
    );
  }
  return parts.join("\n");
}

/** Workers AI の response は文字列のことも、パース済みオブジェクトのこともある */
function parseAdvice(raw: unknown): Omit<Advice, "generatedBy"> | null {
  let parsed: Partial<Advice> | null = null;
  if (raw && typeof raw === "object") {
    parsed = raw as Partial<Advice>;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Advice>;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed.lead !== "string" || !Array.isArray(parsed.lines)) return null;
  const lines = parsed.lines.slice(0, 2).map(String).filter(Boolean);
  return lines.length > 0 ? { lead: parsed.lead, lines } : null;
}

export async function generateAdvice(ai: Ai | undefined, input: AdviceInput): Promise<Advice> {
  if (!ai) return FALLBACK;

  try {
    const result = (await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: describe(input) },
      ],
      max_tokens: 600,
      temperature: 0.4,
    })) as { response?: unknown };

    const parsed = parseAdvice(result.response);
    if (!parsed) {
      logger.warn("workers ai returned unparsable advice");
      return FALLBACK;
    }
    return { ...parsed, generatedBy: MODEL };
  } catch (error) {
    logger.warn("workers ai advice failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return FALLBACK;
  }
}
