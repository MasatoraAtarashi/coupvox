import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../db/client";
import { members, type Member } from "../../db/schema";

/**
 * 認証は「メンバーごとの推測不能なトークン」1 本で行う。
 * メールのリンクから開くと Cookie に載り、以降はダッシュボードも開ける。
 * 二人しか使わないアプリなので、パスワードも外部 IdP も置かない。
 */

export const SESSION_COOKIE = "cv_token";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** 32 バイトの乱数を base64url で。推測・総当たりは現実的でない長さ */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === "https:";
}

export async function findMemberByToken(db: Db, token: string): Promise<Member | undefined> {
  const [member] = await db.select().from(members).where(eq(members.token, token)).limit(1);
  return member;
}

/** React Router の loader から使う。Request だけでメンバーを解決する */
export async function memberFromRequest(
  database: D1Database,
  request: Request,
): Promise<Member | undefined> {
  const token = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return undefined;
  return findMemberByToken(createDb(database), token);
}
