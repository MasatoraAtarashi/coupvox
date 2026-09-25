import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errorHandler } from "../middleware/error-handler";
import { memberAuth } from "../middleware/member-auth";
import { requestId } from "../middleware/request-id";
import { getMembers } from "../lib/cycles";
import { createDb } from "../../db/client";
import { cyclesRoute } from "./routes/cycles";
import { setupRoute } from "./routes/setup";
import { surveyRoute } from "./routes/survey";

export const api = new Hono<AppEnv>()
  .use("*", requestId)
  // 初回セットアップだけは未認証で通す（二重初期化は setup 側で 409）
  .route("/setup", setupRoute)
  .use("*", memberAuth)
  .get("/me", async (c) => {
    const member = c.get("member");
    const roster = await getMembers(createDb(c.env.DB), member.coupleId);
    const partner = roster.find((candidate) => candidate.id !== member.id);
    return c.json({
      member: { id: member.id, name: member.name, email: member.email },
      partner: partner ? { id: partner.id, name: partner.name, email: partner.email } : null,
    });
  })
  .route("/survey", surveyRoute)
  .route("/cycles", cyclesRoute)
  .onError(errorHandler);
