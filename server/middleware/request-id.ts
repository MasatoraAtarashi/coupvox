import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.res.headers.set("x-request-id", id);
});
