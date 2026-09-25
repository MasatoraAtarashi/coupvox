import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { api } from "../server/api";
import type { AppEnv } from "../server/env";
import { runScheduled } from "../server/lib/scheduler";
import { logger } from "../server/logger";

const app = new Hono<AppEnv>();

// API ルート（Hono）。ルートの追加は server/api/ 側で行う
app.route("/api", api);

// それ以外は React Router の SSR ハンドラへ
app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
  );

  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env, ctx: c.executionCtx },
  });
});

export default {
  fetch: app.fetch,
  // 定期アンケート配信（wrangler.jsonc の triggers.crons）
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduled(env).catch((error) => {
        logger.error("scheduled run failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  },
} satisfies ExportedHandler<Env>;
