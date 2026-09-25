import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../../../db/client";
import { couples, members } from "../../../db/schema";
import { createCycle, getMembers, personalLinks } from "../../lib/cycles";
import { generateToken, isSecureRequest, sessionCookie } from "../../lib/session";
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
 * 作成者はその場でログイン状態になり、パートナーには個人リンクを渡してもらう。
 */
export const setupRoute = new Hono<AppEnv>().post(
  "/",
  zValidator("json", setupSchema),
  async (c) => {
    const db = createDb(c.env.DB);
    const data = c.req.valid("json");

    const couple = {
      id: crypto.randomUUID(),
      name: data.coupleName,
      cadenceDays: data.cadenceDays,
      windowDays: data.windowDays,
    };
    await db.insert(couples).values(couple);

    const roster = [data.you, data.partner].map((person) => ({
      id: crypto.randomUUID(),
      coupleId: couple.id,
      name: person.name,
      email: person.email && person.email.length > 0 ? person.email : null,
      token: generateToken(),
    }));
    await db.insert(members).values(roster);

    const savedMembers = await getMembers(db, couple.id);
    // すぐ試せるよう、1 回目のアンケートはこの場で開く
    const cycle = await createCycle(db, { ...couple, createdAt: "" });
    const appUrl = c.env.APP_URL ?? new URL(c.req.url).origin;

    c.header("set-cookie", sessionCookie(roster[0].token, isSecureRequest(c.req.url)));
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
