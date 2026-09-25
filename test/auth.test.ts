import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { members } from "../db/schema";
import { eq } from "drizzle-orm";
import { claimInvite, findMemberByGoogleSub } from "../server/auth/member";
import {
  authorizationUrl,
  codeChallengeS256,
  identityFromIdToken,
  safeNextPath,
} from "../server/auth/google-oauth";
import { newSessionPayload, signSessionValue, verifySessionValue } from "../server/auth/session";
import { api, setupCouple } from "./helpers";
import { authHeaders } from "./auth-helper";

const SECRET = "test-session-secret";

/** id_token は署名検証せずペイロードだけ読む（トークン交換が TLS 上の直送のため） */
function fakeIdToken(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

const validPayload = {
  sub: "google-sub-1",
  email: "someone@example.com",
  email_verified: true,
  aud: "client-id",
  iss: "https://accounts.google.com",
};

describe("セッション cookie", () => {
  it("署名して検証すると元のペイロードが戻る", async () => {
    const payload = newSessionPayload("sub-1", "a@example.com");
    const value = await signSessionValue(payload, SECRET);
    expect(await verifySessionValue(value, SECRET)).toEqual(payload);
  });

  it("鍵が違う・改竄された値は通さない", async () => {
    const value = await signSessionValue(newSessionPayload("sub-1", "a@example.com"), SECRET);
    expect(await verifySessionValue(value, "another-secret")).toBeNull();
    expect(await verifySessionValue(`x${value}`, SECRET)).toBeNull();
    expect(await verifySessionValue("not-a-cookie", SECRET)).toBeNull();
  });

  it("期限切れは通さない", async () => {
    const past = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365;
    const value = await signSessionValue(newSessionPayload("sub-1", "a@example.com", past), SECRET);
    expect(await verifySessionValue(value, SECRET)).toBeNull();
  });
});

describe("Google の id_token", () => {
  it("sub を取り出す。これが無いとメンバーを引けない", () => {
    const identity = identityFromIdToken(fakeIdToken(validPayload), "client-id");
    expect(identity).toEqual({
      sub: "google-sub-1",
      email: "someone@example.com",
      emailVerified: true,
    });
  });

  it("aud / iss / sub が欠けている・食い違うものは弾く", () => {
    const token = (patch: Record<string, unknown>) => fakeIdToken({ ...validPayload, ...patch });
    expect(identityFromIdToken(token({ aud: "other-client" }), "client-id")).toBeNull();
    expect(identityFromIdToken(token({ iss: "https://evil.example" }), "client-id")).toBeNull();
    expect(identityFromIdToken(token({ sub: undefined }), "client-id")).toBeNull();
    expect(identityFromIdToken(token({ email: "not-an-email" }), "client-id")).toBeNull();
    expect(identityFromIdToken("壊れたトークン", "client-id")).toBeNull();
  });

  it("未確認のメールは emailVerified が false になる", () => {
    const identity = identityFromIdToken(
      fakeIdToken({ ...validPayload, email_verified: false }),
      "client-id",
    );
    expect(identity?.emailVerified).toBe(false);
  });
});

describe("認可 URL", () => {
  it("PKCE のパラメータを含む", async () => {
    const url = new URL(
      authorizationUrl({
        clientId: "client-id",
        redirectUri: "https://example.com/api/auth/google/callback",
        state: "state-value",
        codeChallenge: await codeChallengeS256("verifier"),
      }),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("scope")).toBe("openid email");
  });

  it("戻り先に外部 URL を指定できない", () => {
    expect(safeNextPath("//evil.example", "/")).toBe("/");
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
    expect(safeNextPath("/\\evil.example", "/")).toBe("/");
    expect(safeNextPath(undefined, "/")).toBe("/");
    // 自サイト内のパスは通す
    expect(safeNextPath("/s/abc", "/")).toBe("/s/abc");
  });
});

describe("API の入口", () => {
  it("cookie が無ければ 401", async () => {
    expect((await api("/me")).status).toBe(401);
  });

  it("ログイン済みでもメンバーでなければ 401", async () => {
    const res = await api("/me", { sub: "sub-nobody" });
    expect(res.status).toBe(401);
  });

  it("参加済みのアカウントは通る", async () => {
    const { subs } = await setupCouple();
    const res = await api("/me", { sub: subs.you });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { member: { name: string } }).member.name).toBe("たろう");
  });

  it("組を作るにはログインが要る", async () => {
    const res = await api("/setup", {
      method: "POST",
      body: JSON.stringify({ you: { name: "a" }, partner: { name: "b" } }),
    });
    expect(res.status).toBe(401);
  });

  it("すでにどこかの組にいる人は二重に組を作れない", async () => {
    const { subs } = await setupCouple();
    const res = await api("/setup", {
      method: "POST",
      sub: subs.you,
      body: JSON.stringify({ you: { name: "a" }, partner: { name: "b" } }),
    });
    expect(res.status).toBe(409);
  });
});

describe("招待リンクでの参加", () => {
  /** 相手がまだ参加していない状態の組を作り、その招待トークンを返す */
  async function pendingInvite() {
    const res = await api("/setup", {
      method: "POST",
      sub: `owner-${crypto.randomUUID()}`,
      body: JSON.stringify({ you: { name: "つくった人" }, partner: { name: "さそわれた人" } }),
    });
    const body = (await res.json()) as { links: { url: string }[] };
    return body.links[0].url.split("/s/")[1];
  }

  it("未参加のリンクで参加でき、同じ人が踏み直しても壊れない", async () => {
    const db = createDb(env.DB);
    const token = await pendingInvite();
    const session = newSessionPayload("sub-joining", "joining@example.com");

    const first = await claimInvite(db, token, session);
    expect(first.ok).toBe(true);
    expect(await findMemberByGoogleSub(db, "sub-joining")).toBeTruthy();

    const again = await claimInvite(db, token, session);
    expect(again).toMatchObject({ ok: true, alreadyMine: true });
  });

  it("別のアカウントが同じリンクを使うことはできない", async () => {
    const db = createDb(env.DB);
    const token = await pendingInvite();
    await claimInvite(db, token, newSessionPayload("sub-first", "first@example.com"));

    const second = await claimInvite(db, token, newSessionPayload("sub-second", "b@example.com"));
    expect(second).toEqual({ ok: false, reason: "already_claimed" });
  });

  it("すでに別の組にいるアカウントは参加できない", async () => {
    const db = createDb(env.DB);
    const { subs } = await setupCouple();
    const token = await pendingInvite();

    const result = await claimInvite(db, token, newSessionPayload(subs.you, "a@example.com"));
    expect(result).toEqual({ ok: false, reason: "account_in_use" });
  });

  it("存在しないトークンは not_found", async () => {
    const result = await claimInvite(
      createDb(env.DB),
      "no-such-token",
      newSessionPayload("sub-x", "x@example.com"),
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("参加すると Google の verified email が記録される", async () => {
    const db = createDb(env.DB);
    const token = await pendingInvite();
    await claimInvite(db, token, newSessionPayload("sub-email", "verified@example.com"));

    const [member] = await db.select().from(members).where(eq(members.googleSub, "sub-email"));
    expect(member.email).toBe("verified@example.com");
    expect(member.claimedAt).toBeTruthy();
  });
});

describe("ログアウト", () => {
  it("cookie を消す Set-Cookie を返す", async () => {
    const res = await api("/auth/logout", {
      method: "POST",
      headers: await authHeaders("sub-someone"),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("cv_session=");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
