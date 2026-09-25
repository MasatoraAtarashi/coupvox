// テスト用 Worker エントリ: 本番（workers/app.ts）と同じ /api マウント構成にする。
// React Router の virtual モジュールを import しないため、vitest でそのまま動く。
import { Hono } from "hono";
import { api } from "../server/api";
import type { AppEnv } from "../server/env";

const app = new Hono<AppEnv>();
app.route("/api", api);

export default app;
