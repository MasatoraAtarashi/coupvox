/**
 * `/api/auth/*` — アプリ内 Google OAuth。
 * server/api/index.ts で memberAuth より前にマウントし、未認証で通す。
 *
 * idea-cloud と違い、ここに許可メールのリストは無い。coupvox は誰でもログイン
 * できて構わない。ログインしただけでは何のデータも見えず、招待リンクで組の
 * メンバーに結びついて初めて意味を持つ。
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { logger } from "../logger";
import type { AppEnv } from "../env";
import {
  authorizationUrl,
  codeChallengeS256,
  exchangeCodeForIdentity,
  randomCodeVerifier,
  randomState,
  redirectUri,
  safeNextPath,
} from "./google-oauth";
import { clearSessionCookie, isLocalRequest, setSessionCookie } from "./session";

const OAUTH_COOKIE = "cv_oauth";
const OAUTH_COOKIE_MAX_AGE = 600;
const DEFAULT_NEXT = "/";

interface OAuthState {
  state: string;
  verifier: string;
  next: string;
}

function readOAuthCookie(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthState>;
    if (typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      next: typeof parsed.next === "string" ? parsed.next : DEFAULT_NEXT,
    };
  } catch {
    return null;
  }
}

/** ログインの入口は `/`（ランディング）。専用の /login ページは置いていない */
function loginError(c: { redirect: (url: string, status?: 302) => Response }, reason: string) {
  return c.redirect(`/?error=${encodeURIComponent(reason)}`, 302);
}

export const authRoute = new Hono<AppEnv>()
  .get("/google", async (c) => {
    const next = safeNextPath(c.req.query("next"), DEFAULT_NEXT);
    const clientId = c.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      logger.warn("oauth start failed", { reason: "missing_client" });
      return loginError(c, "oauth_unconfigured");
    }

    const state = randomState();
    const verifier = randomCodeVerifier();
    setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), {
      path: "/api/auth",
      httpOnly: true,
      sameSite: "Lax",
      secure: !isLocalRequest(c.req.url),
      maxAge: OAUTH_COOKIE_MAX_AGE,
    });

    return c.redirect(
      authorizationUrl({
        clientId,
        redirectUri: redirectUri(c.req.url),
        state,
        codeChallenge: await codeChallengeS256(verifier),
      }),
      302,
    );
  })

  .get("/google/callback", async (c) => {
    const stored = readOAuthCookie(getCookie(c, OAUTH_COOKIE));
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });

    if (c.req.query("error")) {
      logger.warn("oauth callback failed", { reason: "provider_error" });
      return loginError(c, "google_denied");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state || !stored || state !== stored.state) {
      logger.warn("oauth callback failed", {
        reason: !code ? "missing_code" : !stored ? "missing_state_cookie" : "state_mismatch",
      });
      return loginError(c, "invalid_request");
    }

    const clientId = c.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return loginError(c, "oauth_unconfigured");

    let identity;
    try {
      identity = await exchangeCodeForIdentity({
        code,
        codeVerifier: stored.verifier,
        clientId,
        clientSecret,
        redirectUri: redirectUri(c.req.url),
      });
    } catch (error) {
      logger.warn("oauth callback failed", {
        reason: "exchange_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      return loginError(c, "exchange_failed");
    }

    if (!identity || !identity.emailVerified) {
      logger.warn("oauth callback failed", {
        reason: identity ? "email_unverified" : "no_identity",
      });
      return loginError(c, "invalid_identity");
    }

    // SESSION_SECRET が無いと署名できない。黙ってログインさせない
    if (!(await setSessionCookie(c, identity))) {
      logger.error("oauth callback failed", { reason: "missing_session_secret" });
      return loginError(c, "server_misconfigured");
    }

    return c.redirect(safeNextPath(stored.next, DEFAULT_NEXT), 302);
  })

  .get("/logout", (c) => {
    clearSessionCookie(c);
    return c.redirect("/", 302);
  })
  .post("/logout", (c) => {
    clearSessionCookie(c);
    return c.redirect("/", 302);
  });
