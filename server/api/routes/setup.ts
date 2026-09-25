import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../../../db/client";
import { couples, members } from "../../../db/schema";
import { createCycle, getMembers, personalLinks } from "../../lib/cycles";
import { generateToken } from "../../lib/session";
import { findMemberByGoogleSub } from "../../auth/member";
import type { AppEnv } from "../../env";

const personSchema = z.object({
  name: z.string().trim().min(1).max(40),
  // 通知手段を足すとき用。いまは配信に使っていないので任意
  email: z.union([z.email(), z.literal("")]).optional(),
});

const setupSchema = z.object({
  coupleName: z.string().trim().min(1).max(60).default("わたしたち"),
  cadenceDays: z.coerce.number().int().min(1).max(90).default(14),
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  you: personSchema,
  partner: personSchema,
});

/**
 * 組を 1 つ作る。インスタンスは複数の組を持てる（組どうしのデータは coupleId で分離）。
 *
 * 作成者はログイン済みの Google アカウントにその場で紐づく（claim 済みとして作る）。
 * パートナーには招待リンクを渡してもらい、相手が Google ログインした時点で紐づく。
 */
export const setupRoute = new Hono<AppEnv>().post(
  "/",
  zValidator("json", setupSchema),
  async (c) => {
    const db = createDb(c.env.DB);
    const data = c.req.valid("json");
    const session = c.get("session");

    // 1 Google アカウント = 1 メンバー。二重に組を作らせない
    const existing = await findMemberByGoogleSub(db, session.sub);
    if (existing) return c.json({ error: "already_member" }, 409);

    const couple = {
      id: crypto.randomUUID(),
      name: data.coupleName,
      cadenceDays: data.cadenceDays,
      windowDays: data.windowDays,
    };
    await db.insert(couples).values(couple);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const roster = [data.you, data.partner].map((person, index) => ({
      id: crypto.randomUUID(),
      coupleId: couple.id,
      name: person.name,
      // 作成者のメールはフォーム入力より Google の verified email を信用する
      email:
        index === 0 ? session.email : person.email && person.email.length > 0 ? person.email : null,
      googleSub: index === 0 ? session.sub : null,
      claimedAt: index === 0 ? now : null,
      token: generateToken(),
    }));
    await db.insert(members).values(roster);

    const savedMembers = await getMembers(db, couple.id);
    // すぐ試せるよう、1 回目のアンケートはこの場で開く
    const cycle = await createCycle(db, { ...couple, createdAt: "" });
    const appUrl = c.env.APP_URL ?? new URL(c.req.url).origin;

    // cookie は OAuth のコールバックが張っている。ここで張り直す必要はない
    return c.json(
      {
        couple,
        cycle,
        links: personalLinks(savedMembers, appUrl),
        youMemberId: roster[0].id,
      },
      201,
    );
  },
);
