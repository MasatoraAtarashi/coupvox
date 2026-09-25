/**
 * パートナーからの応答性知覚（Perceived Partner Responsiveness, PPR）尺度。
 *
 * Reis & Shaver の親密さプロセスモデルに基づき、「理解されている / 認められている /
 * 大切にされている」と感じられているかを測る応答性 8 項目（R1〜R8）と、その完全な
 * 裏返しではなく独立に動く非応答性 8 項目（I1〜I8）の計 16 項目。
 * 回答者は「過去 2 週間のパートナーの態度」を 0〜5 の 6 件法で評定する。
 *
 * R1・R2・R3・I1・I2・I3 は支給された正式な文言。変更しないこと。
 * 残る 10 項目は同じ文体の暫定文言で、正式版が手に入り次第この配列だけを差し替える。
 */

export type Kind = "R" | "I";

export interface SurveyItem {
  id: string;
  kind: Kind;
  text: string;
}

export const SURVEY_ITEMS: SurveyItem[] = [
  { id: "R1", kind: "R", text: "私のパートナーは，私の話をきちんと聴いてくれた" },
  { id: "R2", kind: "R", text: "私のパートナーは，私の気持ちを分かろうとしてくれた" },
  { id: "R3", kind: "R", text: "私のパートナーは，きちんと私の視点に立ってくれた" },
  { id: "R4", kind: "R", text: "私のパートナーは，私が大切にしていることを尊重してくれた" },
  { id: "R5", kind: "R", text: "私のパートナーは，私のことを気にかけてくれていた" },
  { id: "R6", kind: "R", text: "私のパートナーは，私の良いところを認めてくれた" },
  { id: "R7", kind: "R", text: "私のパートナーは，私が困っているときに力になってくれた" },
  { id: "R8", kind: "R", text: "私のパートナーは，ありのままの私を受け入れてくれた" },
  {
    id: "I1",
    kind: "I",
    text: "私のパートナーは，私が欲しているものや求めているものをきちんと理解してくれなかった",
  },
  { id: "I2", kind: "I", text: "私のパートナーは，私が気になっていることをいとも簡単に否定した" },
  {
    id: "I3",
    kind: "I",
    text: "私が何か心配になったりストレスを感じたりしたときに，それをパートナーに話しても悪化するだけだった",
  },
  { id: "I4", kind: "I", text: "私のパートナーは，私の話を最後まで聞かなかった" },
  { id: "I5", kind: "I", text: "私のパートナーは，私の気持ちを軽く扱った" },
  { id: "I6", kind: "I", text: "私のパートナーは，私が言いたいことを誤解したままだった" },
  { id: "I7", kind: "I", text: "私のパートナーは，私が求めていたときにそばにいてくれなかった" },
  { id: "I8", kind: "I", text: "私のパートナーは，私の意見をはじめから受け入れようとしなかった" },
];

/** 短縮版（8 項目）の内訳 */
export const SHORT_FORM_IDS = ["R1", "R2", "R3", "R5", "I1", "I2", "I3", "I5"];

/** 0〜5 の 6 件法ラベル */
export const SCALE_LABELS = [
  "全くそうでない",
  "少しそうだ",
  "まあまあそうだ",
  "かなりそうだ",
  "非常にそうだ",
  "完全にそうだ",
] as const;

/** 0→5 で濃くなる回答ボタンの塗り */
export const SCALE_TINTS = [
  "#F7F0E8",
  "#FCE9DF",
  "#FBDDCC",
  "#F9CDB5",
  "#F6B296",
  "#F2846B",
] as const;

export const MIN_VALUE = 0;
export const MAX_VALUE = 5;

export const ITEM_IDS = SURVEY_ITEMS.map((item) => item.id);

const ITEM_BY_ID = new Map(SURVEY_ITEMS.map((item) => [item.id, item]));

export function getItem(id: string): SurveyItem | undefined {
  return ITEM_BY_ID.get(id);
}
