import { HTTPException } from "hono/http-exception";
import type { ErrorHandler } from "hono";
import type { AppEnv } from "../env";
import { logger } from "../logger";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  logger.error("unhandled error", {
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json({ error: "Internal Server Error", requestId }, 500);
};
