import { z } from "zod";
import { getItem } from "../survey/items";
import type { GapItem, ItemDelta, LowItem } from "../survey/scoring";
import { logger } from "../logger";
import type { TriageResult } from "./triage";

/**
 * Workers AI による分析生成。
 * Jev が速い判定（System 1）、こちらが文章生成（System 2）。
 *
 * モードが 2 つある。
 * - paired: ふたりとも回答済み。「パートナーが自分（閲覧者）をどう感じているか」を入力に、
 *   見え方のちがいと今週試せる行動を返す。
 * - solo: 閲覧者しか回答していない。**相手の情報は一切入力に入らない**。自分がつけた
 *   点数とコメントだけを材料に、自分の側の振り返りを返す。
 *
 * solo に相手由来のフィールドを持たせないのは型の都合ではなく公開ルールの都合。
 * 「相手が未回答なら相手の結果は見せない」を、レビューではなく型で落とせるようにしている。
 */

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type AdviceMode = "solo" | "paired";
export type AdviceSectionKey = "gap" | "change" | "comment";

export interface AdviceSection {
  key: AdviceSectionKey;
  body: string;
}

export interface Advice {
  /** 旧ペイロードには無い。読む側は "paired" を既定にする */
  mode?: AdviceMode;
  lead: string;
  /** 旧ペイロードには無い。材料が無いセクションは含まれない */
  sections?: AdviceSection[];
  /** 今週試せる行動 */
  lines: string[];
  generatedBy: string;
}

/** 見出しは AI に書かせない。出力トークンが減り、表記ゆれも消える */
export const SECTION_TITLES: Record<AdviceMode, Record<AdviceSectionKey, string>> = {
  solo: {
    gap: "いま気になっていること",
    change: "前回からの変化",
    comment: "書いたことから",
  },
  paired: {
    gap: "見え方のちがい",
    change: "前回からの変化",
    comment: "コメントから読みとれること",
  },
};

interface AdviceInputBase {
  /** 応答性の推移（古い順、0〜100）。solo は自分の、paired は相手が感じた推移 */
  trendResponsive: number[];
  trendInsensitive: number[];
}

export interface SoloAdviceInput extends AdviceInputBase {
  mode: "solo";
  /** 自分が相手に対して低くつけた項目 */
  selfLowItems: LowItem[];
  /** 前回の自分の回答からの変化 */
  selfDeltas: ItemDelta[];
  /** 自分のコメント。共有の可否に関係なく本人向けなので渡してよい */
  selfComment: string | null;
  selfTriage: TriageResult | null;
}

export interface PairedAdviceInput extends AdviceInputBase {
  mode: "paired";
  /** パートナーが自分について付けた点数（0〜5） */
  partnerValues: Record<string, number>;
  partnerLowItems: LowItem[];
  partnerDeltas: ItemDelta[];
  /** 同じ項目に対する自分の評定と相手の評定の差 */
  gapItems: GapItem[];
  /** 共有されている場合のみ */
  partnerComment: string | null;
  partnerTriage: TriageResult | null;
}

export type AdviceInput = SoloAdviceInput | PairedAdviceInput;

const FALLBACK_PAIRED: Advice = {
  mode: "paired",
  lead: "相手がつけた点数から、いまの手応えを見てみてください。数字そのものより、低くついた項目が何かに目を向けると話しやすくなります。",
  sections: [],
  lines: [
    "今週は1回でいい。相手が話しはじめたら、解決策を出す前に「それでどう思ったの？」と一度だけ聞き返してみてください。",
    "「あとで」と言ったときは、いつなら話せるかをその場で決める。宙に浮いたままが一番こたえます。",
  ],
  generatedBy: "fallback",
};

const FALLBACK_SOLO: Advice = {
  mode: "solo",
  lead: "まずはあなたの側から、この2週間どう感じていたかを見てみてください。低くついた項目は、いま物足りなく感じている場所のしるしです。",
  sections: [],
  lines: [
    "点数が低かった項目を1つだけ選んで、それがどんな場面だったかを思い出してみてください。",
    "相手が回答したら、同じ項目をふたりがどう見ていたかを見くらべてみてください。",
  ],
  generatedBy: "fallback",
};

function fallbackFor(mode: AdviceMode): Advice {
  return mode === "solo" ? FALLBACK_SOLO : FALLBACK_PAIRED;
}

const BASE_RULES = `あなたは夫婦・パートナー関係の対話を支援するコーチです。

守ること:
- 断定しすぎない。評価やジャッジをしない。
- どちらかを責める書き方にしない。
- 診断や専門的助言の代わりになることを言わない。
- 「です・ます」のやわらかい口調で書く。文末は「〜してみてください」「〜のようです」のようにする。
  「〜しよう」「〜すべき」などの命令形・言い切りは使わない。
- 尺度名（PPR・応答性知覚など）や点数の羅列を本文に書かない。読む人が自分ごととして読める言葉にする。
- 与えられた材料に無いことを作らない。
- **最後に「書けるセクション」を指定する。そこに挙がっていない key は絶対に出力しない。**
  材料が無いことを「変化はありません」のように書くのではなく、そのセクションごと省く。
- actions は「今週1回だけ」のレベルで実行できる粒度にする。`;

const OUTPUT_SCHEMA = `必ず次の JSON だけを出力すること（前後に説明やコードブロックを付けない）:
{"lead":"いまの状況を受けとめる1〜2文・60〜120文字","sections":[{"key":"gap","body":"80〜150文字"},{"key":"change","body":"80〜150文字"},{"key":"comment","body":"80〜150文字"}],"actions":["今週すぐ試せる具体的な行動を1文・40〜90文字","もう1つ、別の角度から1文・40〜90文字"]}

key は "gap" / "change" / "comment" のみ。見出しは書かない（body だけ書く）。`;

const SYSTEM_PROMPT_PAIRED = `${BASE_RULES}

与えられるのは「パートナーからの応答性知覚（PPR）」尺度の結果と自由記述です。
読む人は、パートナーからどう見えているかを受けとる側です。

- "gap" には、同じ項目についてふたりの評定が食い違っている点を書く。どちらが正しいかではなく、見え方が違うこととして書く。
- "change" には、前回から動いた項目について書く。
- "comment" には、共有されたコメントとその自動判定から読みとれることを書く。

${OUTPUT_SCHEMA}`;

const SYSTEM_PROMPT_SOLO = `${BASE_RULES}

与えられるのは「パートナーからの応答性知覚（PPR）」尺度に、読む人自身が答えた結果です。
**相手はまだ回答していません。相手がどう感じているかは分かりません。相手の気持ちを推測して書かないでください。**
あくまで「あなた自身の見え方」の振り返りとして書きます。

- "gap" には、自分が低くつけた項目から、いま物足りなく感じていそうなことを書く。
- "change" には、前回から動いた項目について書く。
- "comment" には、自分が書いたコメントから読みとれることを書く。

${OUTPUT_SCHEMA}`;

function formatLowItems(items: LowItem[]): string[] {
  if (items.length === 0) return [];
  return ["とくに低かった項目:", items.map((item) => `- ${item.text}：${item.score}/5`).join("\n")];
}

function formatDeltas(deltas: ItemDelta[], label: string): string[] {
  if (deltas.length === 0) return [];
  return [
    `${label}:`,
    deltas.map((delta) => `- ${delta.text}：${delta.from} → ${delta.to}`).join("\n"),
  ];
}

function formatTrend(trend: number[], label: string): string[] {
  if (trend.length < 2) return [];
  return [`${label}: ${trend[0]} → ${trend[trend.length - 1]}（0〜100、直近 ${trend.length} 回）`];
}

/**
 * コメントの自動判定。safetyConcern は本人の画面にだけ出す情報なので、
 * プロンプトには入れない（助言の文面に滲ませない）。
 */
function formatTriage(triage: TriageResult | null): string[] {
  if (!triage) return [];
  return [
    `コメントの自動判定: 話題=${triage.topicLabel} / 困り度=${triage.urgencyLabel} / トーン=${triage.toneLabel}`,
  ];
}

/**
 * 書けるセクションを毎回こちらから指定する。
 * 「材料が無ければ省く」とだけ頼むと、材料の無い回でも「変化はありません」と
 * 書いてしまうため、出力してよい key を入力側で決めてしまう。
 */
function availableSections(keys: AdviceSectionKey[]): string {
  if (keys.length === 0) return "書けるセクション: なし（sections は空配列にしてください）";
  return `書けるセクション: ${keys.join(", ")}（これ以外の key は出力しないでください）`;
}

export function describeSolo(input: SoloAdviceInput): string {
  const parts = [
    "あなた自身が、この2週間のパートナーについて付けた点数です。",
    ...formatLowItems(input.selfLowItems),
    ...formatDeltas(input.selfDeltas, "前回のあなたの回答からの変化"),
    ...formatTrend(input.trendResponsive, "あなたが感じている応答性の推移"),
    ...formatTrend(input.trendInsensitive, "非応答性の推移"),
  ];
  if (input.selfComment) parts.push(`あなたが書いたコメント:「${input.selfComment}」`);
  parts.push(...formatTriage(input.selfTriage));

  const keys: AdviceSectionKey[] = [];
  if (input.selfLowItems.length > 0) keys.push("gap");
  if (input.selfDeltas.length > 0) keys.push("change");
  if (input.selfComment) keys.push("comment");
  parts.push(availableSections(keys));
  return parts.join("\n");
}

export function describePaired(input: PairedAdviceInput): string {
  const values = Object.entries(input.partnerValues)
    .map(([id, value]) => {
      const item = getItem(id);
      return item ? `- ${item.text}：${value}/5` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const parts = ["パートナーがあなたについて付けた点数（0〜5）:", values];

  if (input.gapItems.length > 0) {
    parts.push(
      "同じ項目に対する評定のちがい（あなたが相手に感じた点 / 相手があなたに感じた点）:",
      input.gapItems
        .map((gap) => `- ${gap.text}：あなた ${gap.mine} / 相手 ${gap.theirs}`)
        .join("\n"),
    );
  }
  parts.push(...formatLowItems(input.partnerLowItems));
  parts.push(...formatDeltas(input.partnerDeltas, "前回の相手の回答からの変化"));
  parts.push(...formatTrend(input.trendResponsive, "パートナーが感じる応答性の推移"));
  parts.push(...formatTrend(input.trendInsensitive, "非応答性の推移"));

  if (input.partnerComment) parts.push(`パートナーのコメント:「${input.partnerComment}」`);
  parts.push(...formatTriage(input.partnerTriage));

  const keys: AdviceSectionKey[] = [];
  if (input.gapItems.length > 0) keys.push("gap");
  if (input.partnerDeltas.length > 0) keys.push("change");
  if (input.partnerComment) keys.push("comment");
  parts.push(availableSections(keys));
  return parts.join("\n");
}

function describe(input: AdviceInput): string {
  return input.mode === "solo" ? describeSolo(input) : describePaired(input);
}

const sectionSchema = z.object({
  key: z.enum(["gap", "change", "comment"]),
  body: z.string().trim().min(1),
});

const rawAdviceSchema = z.object({
  lead: z.string().trim().min(1),
  // 未知の key を 1 つ返されただけで分析ごと落とさないよう、要素ごとに後で検証する
  sections: z.array(z.unknown()).default([]),
  /** 新スキーマのキー。旧プロンプトの "lines" で返ってきた場合も受ける */
  actions: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
});

/**
 * Workers AI の response は文字列のことも、パース済みオブジェクトのこともある。
 * 文字列で返ったときに replace が呼べず必ず FALLBACK に落ちていた経緯があるので、
 * この前処理は zod に渡す前段として残す。
 */
/** 材料があるセクションだけを許す。入力側が持っている情報と一致させるための関数 */
export function allowedSections(input: AdviceInput): AdviceSectionKey[] {
  const keys: AdviceSectionKey[] = [];
  if (input.mode === "solo") {
    if (input.selfLowItems.length > 0) keys.push("gap");
    if (input.selfDeltas.length > 0) keys.push("change");
    if (input.selfComment) keys.push("comment");
  } else {
    if (input.gapItems.length > 0) keys.push("gap");
    if (input.partnerDeltas.length > 0) keys.push("change");
    if (input.partnerComment) keys.push("comment");
  }
  return keys;
}

/**
 * @param allowed 材料があるセクション。指定すると、それ以外の key は捨てる。
 *   材料の無い回に「変化はありません」と書かせないための、プロンプト任せにしない歯止め。
 */
export function parseAdvice(
  raw: unknown,
  allowed?: AdviceSectionKey[],
): Omit<Advice, "generatedBy" | "mode"> | null {
  let candidate: unknown = null;
  if (raw && typeof raw === "object") {
    candidate = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      candidate = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const parsed = rawAdviceSchema.safeParse(candidate);
  if (!parsed.success) return null;

  // 形の合わない要素は捨て、同じ key を複数返してきたら先勝ちで落とす
  const seen = new Set<AdviceSectionKey>();
  const sections = parsed.data.sections
    .map((section) => sectionSchema.safeParse(section))
    .flatMap((result) => (result.success ? [result.data] : []))
    .filter((section) => !allowed || allowed.includes(section.key))
    .filter((section) => {
      if (seen.has(section.key)) return false;
      seen.add(section.key);
      return true;
    })
    .slice(0, 3);

  const lines = (parsed.data.actions ?? parsed.data.lines ?? [])
    .map(String)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!lines.length && !sections.length) return null;
  return { lead: parsed.data.lead, sections, lines };
}

export async function generateAdvice(ai: Ai | undefined, input: AdviceInput): Promise<Advice> {
  if (!ai) return fallbackFor(input.mode);

  try {
    const result = (await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content: input.mode === "solo" ? SYSTEM_PROMPT_SOLO : SYSTEM_PROMPT_PAIRED,
        },
        { role: "user", content: describe(input) },
      ],
      // lead + sections 3 本 + actions で日本語 850 字前後になる。600 では切れる
      max_tokens: 1200,
      temperature: 0.4,
    })) as { response?: unknown };

    const parsed = parseAdvice(result.response, allowedSections(input));
    if (!parsed) {
      logger.warn("workers ai returned unparsable advice", { mode: input.mode });
      return fallbackFor(input.mode);
    }
    // 行動が取れなかったときも lead と分析は活かす
    const lines = parsed.lines.length > 0 ? parsed.lines : fallbackFor(input.mode).lines;
    // mode は AI の申告ではなく入力から付ける
    return { ...parsed, lines, mode: input.mode, generatedBy: MODEL };
  } catch (error) {
    logger.warn("workers ai advice failed", {
      mode: input.mode,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackFor(input.mode);
  }
}
