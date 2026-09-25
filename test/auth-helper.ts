import { env } from "cloudflare:workers";
import {
  newSessionPayload,
  SESSION_COOKIE,
  signSessionValue,
  sessionSecret,
} from "../server/auth/session";

/**
 * テスト用のログイン。
 *
 * 本番と同じ署名 cookie を作る。Bearer トークンのような「テスト専用の抜け道」を
 * 本番コードに残すと、プライバシーのテストが実際とは違う認証経路を検証して
 * しまうため、抜け道は作らない。
 */
export function sessionCookieFor(sub: string, email = `${sub}@example.com`): Promise<string> {
  const secret = sessionSecret(env as unknown as Env, "https://example.com/");
  if (!secret) throw new Error("SESSION_SECRET not configured for tests");
  return signSessionValue(newSessionPayload(sub, email), secret);
}

export async function authHeaders(sub: string): Promise<Record<string, string>> {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(await sessionCookieFor(sub))}` };
}
