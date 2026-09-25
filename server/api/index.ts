import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errorHandler } from "../middleware/error-handler";
import { memberAuth, requireSession } from "../middleware/member-auth";
import { requestId } from "../middleware/request-id";
import { getMembers } from "../lib/cycles";
import { createDb } from "../../db/client";
import { cyclesRoute } from "./routes/cycles";
import { setupRoute } from "./routes/setup";
import { authRoute } from "../auth/routes";
import { surveyRoute } from "./routes/survey";

export const api = new Hono<AppEnv>()
  .use("*", requestId)
  // ログイン自体は未認証で通す
  .route("/auth", authRoute)
  // 組を作るのはログイン済みなら誰でも。まだメンバーではないので memberAuth の外
  .use("/setup", requireSession)
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
