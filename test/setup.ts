import { beforeEach } from "vitest";
import { env } from "cloudflare:workers";

// migrations/*.sql を読み込み順に適用して、テスト用 D1 をマイグレーション済み状態にする
const migrations = import.meta.glob("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let applied = false;

beforeEach(async () => {
  if (!applied) {
    const files = Object.keys(migrations).sort();
    const statements = files
      .flatMap((file) => migrations[file].split("--> statement-breakpoint"))
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    if (statements.length > 0) {
      await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
    }
    applied = true;
  }

  // テスト間の干渉を防ぐため、毎回まっさらにする（依存の逆順で削除）
  await env.DB.batch(
    ["answers", "insights", "responses", "cycles", "members", "couples"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table};`),
    ),
  );
});
