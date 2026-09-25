import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../../../db/client";
import { answers, responses } from "../../../db/schema";
import {
  generateCycleInsights,
  getCouple,
  getInsight,
  getMembers,
  getOpenCycle,
  putInsight,
  type TriageMap,
} from "../../lib/cycles";
import { triageComment } from "../../lib/triage";
import { computeScores } from "../../survey/scoring";
import { ITEM_IDS, MAX_VALUE, MIN_VALUE, SURVEY_ITEMS } from "../../survey/items";
import { logger } from "../../logger";
import type { AppEnv } from "../../env";

const submitSchema = z.object({
  cycleId: z.string().min(1),
  comment: z.string().trim().max(2000).optional(),
  /** 自由記述をパートナーにも見せるか。既定は見せない（安全側） */
  shareComment: z.boolean().default(false),
  answers: z
    .record(z.string(), z.coerce.number().int().min(MIN_VALUE).max(MAX_VALUE))
    // 16 項目すべてに回答がある場合だけ受け付ける（部分回答は集計が歪むため）
    .refine((values) => ITEM_IDS.every((id) => typeof values[id] === "number"), {
      message: "all_items_required",
    }),
});

export const surveyRoute = new Hono<AppEnv>()
  /** 回答受付中のアンケート（と、自分が回答済みかどうか） */
  .get("/current", async (c) => {
    const db = createDb(c.env.DB);
    const member = c.get("member");
    const cycle = await getOpenCycle(db, member.coupleId);
    if (!cycle) {
      return c.json({ cycle: null, items: SURVEY_ITEMS, submitted: false });
    }
    const [existing] = await db
      .select()
      .from(responses)
      .where(and(eq(responses.cycleId, cycle.id), eq(responses.memberId, member.id)))
      .limit(1);
    return c.json({ cycle, items: SURVEY_ITEMS, submitted: Boolean(existing) });
  })

  /** 回答の送信。Jev のトリアージまで同期で行い、AI アドバイスは waitUntil に逃がす */
  .post("/", zValidator("json", submitSchema), async (c) => {
    const db = createDb(c.env.DB);
    const member = c.get("member");
    const data = c.req.valid("json");

    const cycle = await getOpenCycle(db, member.coupleId);
    if (!cycle || cycle.id !== data.cycleId) {
      return c.json({ error: "cycle_not_open" }, 409);
    }

    const [existing] = await db
      .select()
      .from(responses)
      .where(and(eq(responses.cycleId, cycle.id), eq(responses.memberId, member.id)))
      .limit(1);
    if (existing) {
      return c.json({ error: "already_submitted" }, 409);
    }

    const comment = data.comment?.trim() ? data.comment.trim() : null;
    const responseId = crypto.randomUUID();
    await db.insert(responses).values({
      id: responseId,
      cycleId: cycle.id,
      memberId: member.id,
      comment,
      shareComment: comment ? data.shareComment : false,
    });
    await db.insert(answers).values(
      ITEM_IDS.map((id) => ({
        responseId,
        itemKey: id,
        value: data.answers[id],
      })),
    );

    const scores = computeScores(data.answers);
    const roster = await getMembers(db, member.coupleId);
    const partner = roster.find((candidate) => candidate.id !== member.id);

    // Jev: 自由記述を 1 回の呼び出しで多軸判定（話題・困り度・トーン・要対話・安全性）
    let triage = null;
    if (comment) {
      triage = await triageComment(
        { apiKey: c.env.TYPESAFE_API_KEY },
        { comment, scores, authorName: member.name },
      );
      if (triage) {
        const stored = ((await getInsight(db, cycle.id, "triage")) as TriageMap | undefined) ?? {};
        stored[member.id] = triage;
        await putInsight(db, cycle.id, "triage", stored);
        logger.info("comment triaged", {
          cycleId: cycle.id,
          topic: triage.topic,
          urgency: triage.urgency,
          latencyMs: triage.latencyMs,
        });
      }
    }

    // 二人揃ったら AI アドバイスを生成する（レスポンスは待たせない）
    const couple = await getCouple(db, member.coupleId);
    if (couple) {
      const task = generateCycleInsights(db, c.env.AI, couple, cycle, roster).catch((error) => {
        logger.error("insight generation failed", {
          cycleId: cycle.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      });
      if (c.executionCtx) {
        c.executionCtx.waitUntil(task);
      } else {
        await task;
      }
    }

    const partnerDone = partner
      ? Boolean(
          (
            await db
              .select()
              .from(responses)
              .where(and(eq(responses.cycleId, cycle.id), eq(responses.memberId, partner.id)))
              .limit(1)
          )[0],
        )
      : false;

    return c.json({ ok: true, scores, triage, partnerDone }, 201);
  });
