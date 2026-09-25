import { env, exports } from "cloudflare:workers";
import { createDb } from "../db/client";
import { claimInvite } from "../server/auth/member";
import { newSessionPayload } from "../server/auth/session";
import { ITEM_IDS } from "../server/survey/items";
import { authHeaders } from "./auth-helper";

export async function api(path: string, init?: RequestInit & { sub?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.sub) Object.assign(headers, await authHeaders(init.sub));
  return exports.default.fetch(`https://example.com/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });
}

export interface SetupResult {
  cycleId: string;
  /** Google の sub。テストではこれがログインの identity になる */
  subs: { you: string; partner: string };
}

let coupleSeq = 0;

/**
 * 組を 1 つ作り、両者がログインできる状態にして返す。
 *
 * 作成者は setup の時点で紐づき、パートナーは招待リンクを踏んで claim する。
 * claim をテストの下準備に含めているので、参加の経路が全テストで常に通る。
 */
export async function setupCouple(): Promise<SetupResult> {
  coupleSeq += 1;
  const subs = { you: `sub-you-${coupleSeq}`, partner: `sub-partner-${coupleSeq}` };

  const res = await api("/setup", {
    method: "POST",
    sub: subs.you,
    body: JSON.stringify({
      coupleName: "テストふたり",
      you: { name: "たろう" },
      partner: { name: "はなこ" },
    }),
  });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
  const body = (await res.json()) as {
    cycle: { id: string };
    links: { memberId: string; url: string }[];
  };

  // 作成者は claim 済みなので、返るリンクはパートナーの 1 件だけ。
  // /s/:token は React Router のルートでテスト用エントリに載らないため、
  // ルートが呼んでいるのと同じ関数を直接叩く
  const invite = body.links[0];
  if (!invite) throw new Error("invite link not found");
  const token = invite.url.split("/s/")[1];
  const claimed = await claimInvite(
    createDb(env.DB),
    token,
    newSessionPayload(subs.partner, `${subs.partner}@example.com`),
  );
  if (!claimed.ok) throw new Error(`claim failed: ${claimed.reason}`);

  return { cycleId: body.cycle.id, subs };
}

/** 全項目に同じ値を入れた回答 */
export function uniformAnswers(value: number): Record<string, number> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, value]));
}

/** 応答性項目と非応答性項目で別の値を入れた回答 */
export function splitAnswers(responsive: number, insensitive: number): Record<string, number> {
  return Object.fromEntries(
    ITEM_IDS.map((id) => [id, id.startsWith("R") ? responsive : insensitive]),
  );
}

export function submit(
  sub: string,
  cycleId: string,
  answers: Record<string, number>,
  extra: { comment?: string; shareComment?: boolean } = {},
) {
  return api("/survey", {
    method: "POST",
    sub,
    body: JSON.stringify({ cycleId, answers, ...extra }),
  });
}
