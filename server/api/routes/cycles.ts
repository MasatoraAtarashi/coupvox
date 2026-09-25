import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../../../db/client";
import { cycles } from "../../../db/schema";
import {
  closeExpiredCycles,
  createCycle,
  generateCycleInsights,
  getCouple,
  getLatestCycle,
  getMembers,
  getOpenCycle,
  personalLinks,
} from "../../lib/cycles";
import type { AppEnv } from "../../env";

/** サイクルの手動操作。cron を待たずに試せるようにしておく（自分の組にしか効かない） */
export const cyclesRoute = new Hono<AppEnv>()
  /** いま開いているサイクルを閉じて、新しいサイクルを開く */
  .post("/open", async (c) => {
    const db = createDb(c.env.DB);
    const member = c.get("member");
    const couple = await getCouple(db, member.coupleId);
    if (!couple) return c.json({ error: "not_found" }, 404);

    const open = await getOpenCycle(db, couple.id);
    if (open) {
      await db.update(cycles).set({ status: "closed" }).where(eq(cycles.id, open.id));
    }

    const cycle = await createCycle(db, couple);
    const roster = await getMembers(db, couple.id);
    return c.json(
      {
        cycle,
        links: personalLinks(roster, c.env.APP_URL ?? new URL(c.req.url).origin),
      },
      201,
    );
  })

  /** 期限切れを閉じる（cron と同じ処理の手動実行） */
  .post("/close-expired", async (c) => {
    const closed = await closeExpiredCycles(createDb(c.env.DB));
    return c.json({ closed: closed.length });
  })

  /** 最新サイクルの AI アドバイスを再生成する */
  .post("/advice", async (c) => {
    const db = createDb(c.env.DB);
    const member = c.get("member");
    const couple = await getCouple(db, member.coupleId);
    if (!couple) return c.json({ error: "not_found" }, 404);

    const cycle = await getLatestCycle(db, couple.id);
    if (!cycle) return c.json({ error: "no_cycle" }, 404);

    const roster = await getMembers(db, couple.id);
    const generated = await generateCycleInsights(db, c.env.AI, couple, cycle, roster);
    if (!generated) return c.json({ error: "no_responses" }, 409);
    return c.json({ ok: true, cycleId: cycle.id });
  });
