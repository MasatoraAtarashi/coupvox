import { logger } from "../logger";

/**
 * TypeSafe の Jev（System One）クライアント。
 *
 * 公式 SDK（@typesafe-ai/sdk）は process.env 前提の初期化と browser 判定を持つため、
 * Workers ではエンドポイントを直接叩く薄いクライアントを置いている。
 * ワイヤ形式は SDK と同じ POST /v1/systemone。
 */

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type Question =
  | { type: "noul"; instructions: JsonValue }
  | { type: "score"; instructions: JsonValue; criteria: (string | null)[] }
  | { type: "choice"; instructions: JsonValue; criteria: Record<string, string | null> };

export const noul = (instructions: JsonValue): Question => ({ type: "noul", instructions });
export const score = (instructions: JsonValue, criteria: (string | null)[]): Question => ({
  type: "score",
  instructions,
  criteria,
});
export const choice = (
  instructions: JsonValue,
  criteria: Record<string, string | null>,
): Question => ({ type: "choice", instructions, criteria });

interface NoulAnswer {
  type: "noul";
  noul: number;
  confidence?: number;
}
interface ScoreAnswer {
  type: "score";
  score: number;
  confidence?: number;
}
interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence?: number;
}
export type JevAnswer = NoulAnswer | ScoreAnswer | ChoiceAnswer;

export interface JevResult {
  answers: Record<string, JevAnswer>;
  latencyMs: number;
}

export interface JevConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** API キー未設定・障害時は null を返す（Jev はあくまで補助なので本体を止めない） */
export async function systemOne(
  config: JevConfig,
  state: Record<string, JsonValue>,
  questions: Record<string, Question>,
): Promise<JevResult | null> {
  if (!config.apiKey) {
    logger.info("jev skipped: TYPESAFE_API_KEY not configured");
    return null;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/v1/systemone`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ state, questions, model: config.model ?? DEFAULT_MODEL }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      logger.warn("jev request failed", { status: res.status });
      return null;
    }

    const body = (await res.json()) as { answers?: Record<string, JevAnswer> };
    if (!body.answers) {
      logger.warn("jev response missing answers");
      return null;
    }
    return { answers: body.answers, latencyMs: Date.now() - startedAt };
  } catch (error) {
    logger.warn("jev request errored", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
