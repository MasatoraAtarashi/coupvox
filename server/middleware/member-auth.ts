import { createMiddleware } from "hono/factory";
import { createDb } from "../../db/client";
import { findMemberByToken, parseCookie, SESSION_COOKIE } from "../lib/session";
import type { AppEnv } from "../env";

/**
 * 個人リンク（= メンバートークン）による認証。
 * Cookie がある場合はそれを、無い場合は Authorization: Bearer も受ける（curl での動作確認用）。
 */
export const memberAuth = createMiddleware<AppEnv>(async (c, next) => {
  const cookieToken = parseCookie(c.req.header("cookie") ?? null, SESSION_COOKIE);
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = cookieToken ?? bearer;

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const member = await findMemberByToken(createDb(c.env.DB), token);
  if (!member) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("member", member);
  await next();
});
