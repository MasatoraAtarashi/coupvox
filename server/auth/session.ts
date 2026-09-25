/**
 * Google ログイン用の署名付きセッション cookie。
 * HMAC-SHA256 をコンパクトな JSON ペイロードにかけるだけで、サーバ側のセッション
 * ストアは持たない。
 *
 * cookie が持つのはメンバー ID ではなく Google の `sub`。毎リクエスト sub で
 * members を引き直すので、DB が唯一の真実になる。あるメンバーの google_sub を
 * NULL に戻せば、発行済みの cookie を待たずにその場でログアウトさせられる。
 */
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "../env";

/** 旧トークン cookie（cv_token）とは別名にする。古い cookie が残った端末で検証が暴れない */
export const SESSION_COOKIE = "cv_session";

/** 30 日。Google の再ログインは 1 タップなので、旧 400 日ほどの長期保持は要らない */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** localhost 専用の開発鍵。本番では絶対に使わない（sessionSecret を参照） */
const LOCAL_DEV_SESSION_SECRET = "coupvox-local-dev-session-secret";

export interface SessionPayload {
  /** Google アカウントの不変 ID */
  sub: string;
  /** 表示・デバッグ用。認可の判断には使わない */
  email: string;
  iat: number;
  exp: number;
}

export function isLocalRequest(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * 署名鍵。本番は SESSION_SECRET 必須で、未設定なら null を返してログインさせない。
 * localhost だけ固定の開発鍵に落とし、`pnpm dev` を secret 無しで動かせるようにする。
 * 本番でフォールバックしないのは、鍵が無いことを署名の弱体化で埋めないため。
 */
export function sessionSecret(env: Env, requestUrl: string): string | null {
  const configured = env.SESSION_SECRET?.trim();
  if (configured) return configured;
  return isLocalRequest(requestUrl) ? LOCAL_DEV_SESSION_SECRET : null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `<base64url payload>.<base64url hmac>` */
export async function signSessionValue(payload: SessionPayload, secret: string): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** 署名不正・壊れた値・期限切れはすべて null */
export async function verifySessionValue(
  value: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const signature = base64UrlDecode(value.slice(dot + 1));
  if (!signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature as unknown as ArrayBuffer,
    new TextEncoder().encode(body),
  );
  if (!valid) return null;
  const decoded = base64UrlDecode(body);
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { sub, email, iat, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || !sub) return null;
  if (typeof email !== "string" || !email) return null;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (exp <= nowSeconds) return null;
  return { sub, email, iat, exp };
}

export function newSessionPayload(
  sub: string,
  email: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload {
  return { sub, email, iat: nowSeconds, exp: nowSeconds + SESSION_MAX_AGE_SECONDS };
}

/**
 * httpOnly / SameSite=Lax / localhost 以外は Secure。
 * SameSite は Lax でなければならない。Strict にすると Google からの
 * トップレベルリダイレクトで cookie が戻らず、ログインが延々ループする。
 */
export async function setSessionCookie(
  c: Context<AppEnv>,
  identity: { sub: string; email: string },
): Promise<boolean> {
  const secret = sessionSecret(c.env, c.req.url);
  if (!secret) return false;
  const value = await signSessionValue(newSessionPayload(identity.sub, identity.email), secret);
  setCookie(c, SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: !isLocalRequest(c.req.url),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return true;
}

export function clearSessionCookie(c: Context<AppEnv>) {
  setCookie(c, SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: !isLocalRequest(c.req.url),
    maxAge: 0,
  });
}

/** Set-Cookie ヘッダの文字列。Hono の Context を持たない loader 用 */
export function clearSessionCookieHeader(secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ];
  return attrs.join("; ");
}

export async function readSession(c: Context<AppEnv>): Promise<SessionPayload | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const secret = sessionSecret(c.env, c.req.url);
  if (!secret) return null;
  return verifySessionValue(raw, secret);
}

/** 生の Request から読む版。React Router の loader は Hono の Context を持たない */
export async function readSessionFromRequest(
  request: Request,
  env: Env,
): Promise<SessionPayload | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  const raw = match?.[1];
  if (!raw) return null;
  const secret = sessionSecret(env, request.url);
  if (!secret) return null;
  return verifySessionValue(decodeURIComponent(raw), secret);
}
