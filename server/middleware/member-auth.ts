import { createMiddleware } from "hono/factory";
import { createDb } from "../../db/client";
import { findMemberByGoogleSub } from "../auth/member";
import { readSession } from "../auth/session";
import type { AppEnv } from "../env";

/**
 * Google のセッション cookie を検証し、その sub からメンバーを引く。
 *
 * ログイン済みでもメンバーでなければ 401 にする。組に属していない人に
 * API を触らせる意味が無いため。画面側は `/` でその状態を案内する。
 */
export const memberAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const member = await findMemberByGoogleSub(createDb(c.env.DB), session.sub);
  if (!member) return c.json({ error: "Unauthorized" }, 401);

  c.set("member", member);
  await next();
});

/**
 * ログインだけを要求する。メンバーであることは求めない。
 * 組を作る前の `/setup` 用。
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("session", session);
  await next();
});
