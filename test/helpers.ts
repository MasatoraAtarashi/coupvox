import { exports } from "cloudflare:workers";
import { ITEM_IDS } from "../server/survey/items";

export async function api(path: string, init?: RequestInit & { token?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  return exports.default.fetch(`https://example.com/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });
}

export interface SetupResult {
  cycleId: string;
  tokens: { you: string; partner: string };
}

/** 組を 1 つ作り、両者のトークンと開いたサイクル ID を返す */
export async function setupCouple(): Promise<SetupResult> {
  const res = await api("/setup", {
    method: "POST",
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
    youMemberId: string;
  };
  const tokenOf = (memberId: string) => {
    const link = body.links.find((candidate) => candidate.memberId === memberId);
    if (!link) throw new Error("link not found");
    return link.url.split("/s/")[1];
  };
  const partnerId = body.links.find((link) => link.memberId !== body.youMemberId)?.memberId ?? "";
  return {
    cycleId: body.cycle.id,
    tokens: { you: tokenOf(body.youMemberId), partner: tokenOf(partnerId) },
  };
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
  token: string,
  cycleId: string,
  answers: Record<string, number>,
  extra: { comment?: string; shareComment?: boolean } = {},
) {
  return api("/survey", {
    method: "POST",
    token,
    body: JSON.stringify({ cycleId, answers, ...extra }),
  });
}
