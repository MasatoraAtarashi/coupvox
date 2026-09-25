/**
 * Google のセッションから coupvox のメンバーを引く層。
 *
 * ログイン済みでもメンバーとは限らない（組を作る前・招待リンクを踏む前）。
 * その状態は 401 ではなく「まだどの組にも属していない」として扱う。
 */
import { and, eq, isNull } from "drizzle-orm";
import { createDb, type Db } from "../../db/client";
import { members, type Member } from "../../db/schema";
import { readSessionFromRequest, type SessionPayload } from "./session";

export async function findMemberByGoogleSub(db: Db, sub: string): Promise<Member | undefined> {
  const [member] = await db.select().from(members).where(eq(members.googleSub, sub)).limit(1);
  return member;
}

/**
 * リクエストからメンバーを解決する。
 * 認証の実体は cookie の署名検証で、メンバーの特定は毎回 DB を引き直す。
 */
export async function memberFromRequest(env: Env, request: Request): Promise<Member | undefined> {
  const session = await readSessionFromRequest(request, env);
  if (!session) return undefined;
  return findMemberByGoogleSub(createDb(env.DB), session.sub);
}

export type ClaimResult =
  | { ok: true; member: Member }
  /** 同じ人が同じリンクを踏み直しただけ */
  | { ok: true; member: Member; alreadyMine: true }
  | { ok: false; reason: "not_found" | "already_claimed" | "account_in_use" };

/**
 * 招待リンクを使って、いまログインしている Google アカウントをメンバーに結びつける。
 *
 * UPDATE に `google_sub IS NULL` を必ず付ける。アプリ層で読んでから書くだけだと、
 * 2 端末で同時にリンクを踏んだときに両方成功しうる。DB 側で 1 回に絞る。
 */
export async function claimInvite(
  db: Db,
  token: string,
  session: SessionPayload,
): Promise<ClaimResult> {
  const [target] = await db.select().from(members).where(eq(members.token, token)).limit(1);
  if (!target) return { ok: false, reason: "not_found" };

  if (target.googleSub === session.sub) return { ok: true, member: target, alreadyMine: true };
  if (target.googleSub) return { ok: false, reason: "already_claimed" };

  // 1 Google アカウント = 1 メンバー。別の組にいる人が乗り換えるのは許さない
  const existing = await findMemberByGoogleSub(db, session.sub);
  if (existing) return { ok: false, reason: "account_in_use" };

  const updated = await db
    .update(members)
    .set({
      googleSub: session.sub,
      email: session.email,
      claimedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    })
    .where(and(eq(members.id, target.id), isNull(members.googleSub)))
    .returning();

  // 影響行が無い = 同時に別の端末が claim した
  if (updated.length === 0) return { ok: false, reason: "already_claimed" };
  return { ok: true, member: updated[0] };
}
