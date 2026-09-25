import type { AppLoadContext } from "react-router";

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      // Hono の ExecutionContext（最小構造）を受け取る
      ctx: {
        waitUntil: (promise: Promise<unknown>) => void;
        passThroughOnException?: () => void;
      };
    };
  }
}

export {};
