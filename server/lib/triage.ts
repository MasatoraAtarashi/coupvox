import { choice, noul, score, systemOne, type JevConfig } from "./jev";
import type { Scores } from "../survey/scoring";

/**
 * 回答が届いた瞬間に Jev（System One）でコメントをトリアージする。
 * 220ms 前後で多軸判定が返るので、送信レスポンスを待たせずに「早期発見」の材料を作れる。
 */

export const TOPIC_LABELS: Record<string, string> = {
  communication: "会話・伝え方",
  chores: "家事・分担",
  time: "一緒に過ごす時間",
  money: "お金",
  parenting: "子育て・家族",
  intimacy: "スキンシップ・親密さ",
  work_stress: "仕事や外のストレス",
  appreciation: "感謝・良かったこと",
  other: "その他",
};

const URGENCY_LABELS = [
  "特に困っていない",
  "少しもやもやしている",
  "はっきり困っていて話し合いたい",
  "つらさが強く、早めの対話が必要",
] as const;

const TONE_LABELS = ["穏やか", "もやもや", "苛立ち", "強い怒り・諦め"] as const;

export interface TriageResult {
  topic: string;
  topicLabel: string;
  urgency: number;
  urgencyLabel: string;
  tone: number;
  toneLabel: string;
  needsConversation: boolean;
  isAppreciation: boolean;
  safetyConcern: boolean;
  latencyMs: number;
}

function labelFor<T extends readonly string[]>(labels: T, value: number): string {
  const index = Math.min(labels.length - 1, Math.max(0, Math.round(value)));
  return labels[index] ?? labels[0];
}

export async function triageComment(
  config: JevConfig,
  input: { comment: string; scores: Scores; authorName: string },
): Promise<TriageResult | null> {
  const comment = input.comment.trim();
  if (!comment) return null;

  const result = await systemOne(
    config,
    {
      role: "パートナーとの関係についての 2 週間ごとの振り返りアンケートの自由記述",
      author: input.authorName,
      comment,
      // 数値の文脈があると判定が安定する（0〜100）
      responsiveness_score: input.scores.responsive,
      insensitivity_score: input.scores.insensitive,
    },
    {
      topic: choice("`comment` が主に扱っている話題は？", {
        communication: "会話の仕方、伝え方、聴いてもらえなさ",
        chores: "家事や役割の分担",
        time: "一緒に過ごす時間の量や質",
        money: "お金の使い方や将来の不安",
        parenting: "子育て・親族・家族に関すること",
        intimacy: "スキンシップや性、親密さ",
        work_stress: "仕事や外部のストレスが持ち込まれていること",
        appreciation: "感謝や嬉しかったことなど肯定的な内容",
        other: "上記のいずれでもない",
      }),
      urgency: score("`comment` の書き手はどの程度困っているか？", [...URGENCY_LABELS]),
      tone: score("`comment` の感情のトーンは？", [...TONE_LABELS]),
      needs_conversation: noul("`comment` は二人で直接話し合った方がよい内容を含んでいるか？"),
      is_appreciation: noul("`comment` は感謝や肯定的な評価を含んでいるか？"),
      safety_concern: noul(
        "`comment` は暴力・脅し・恐怖・身の安全に関わる記述を含んでいるか？（単なる口論や不満は含まない）",
      ),
    },
  );

  if (!result) return null;

  const topicAnswer = result.answers.topic;
  const urgencyAnswer = result.answers.urgency;
  const toneAnswer = result.answers.tone;
  const needsAnswer = result.answers.needs_conversation;
  const appreciationAnswer = result.answers.is_appreciation;
  const safetyAnswer = result.answers.safety_concern;

  const topic = topicAnswer?.type === "choice" ? topicAnswer.choice : "other";
  const urgency = urgencyAnswer?.type === "score" ? urgencyAnswer.score : 0;
  const tone = toneAnswer?.type === "score" ? toneAnswer.score : 0;

  return {
    topic,
    topicLabel: TOPIC_LABELS[topic] ?? TOPIC_LABELS.other,
    urgency: Math.round(urgency * 100) / 100,
    urgencyLabel: labelFor(URGENCY_LABELS, urgency),
    tone: Math.round(tone * 100) / 100,
    toneLabel: labelFor(TONE_LABELS, tone),
    needsConversation: needsAnswer?.type === "noul" ? needsAnswer.noul >= 0.5 : false,
    isAppreciation: appreciationAnswer?.type === "noul" ? appreciationAnswer.noul >= 0.5 : false,
    safetyConcern: safetyAnswer?.type === "noul" ? safetyAnswer.noul >= 0.5 : false,
    latencyMs: result.latencyMs,
  };
}
