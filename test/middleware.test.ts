import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("request-id ミドルウェア", () => {
  it("レスポンスに x-request-id ヘッダが付与される", async () => {
    const res = await exports.default.fetch("https://example.com/api/me");
    expect(res.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("送信した x-request-id がそのまま使われる", async () => {
    const res = await exports.default.fetch("https://example.com/api/me", {
      headers: { "x-request-id": "req-test-123" },
    });
    expect(res.headers.get("x-request-id")).toBe("req-test-123");
  });
});
