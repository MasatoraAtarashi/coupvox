import { describe, expect, it } from "vitest";
import { api, setupCouple, submit, uniformAnswers } from "./helpers";

describe("survey API", () => {
  it("トークンが無ければ 401", async () => {
    await setupCouple();
    const res = await api("/survey/current");
    expect(res.status).toBe(401);
  });

  it("16 項目に答えると受理され、スコアが返る", async () => {
    const { cycleId, subs } = await setupCouple();
    const res = await submit(subs.you, cycleId, uniformAnswers(4));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      scores: { responsive: number; insensitive: number };
      partnerDone: boolean;
    };
    expect(body.scores.responsive).toBe(80);
    expect(body.scores.insensitive).toBe(80);
    expect(body.partnerDone).toBe(false);
  });

  it("項目が欠けていれば 400（部分回答は受け付けない）", async () => {
    const { cycleId, subs } = await setupCouple();
    const partial = uniformAnswers(3);
    delete partial.R1;
    const res = await submit(subs.you, cycleId, partial);
    expect(res.status).toBe(400);
  });

  it("範囲外の値は 400", async () => {
    const { cycleId, subs } = await setupCouple();
    const values = uniformAnswers(3);
    values.R1 = 9;
    const res = await submit(subs.you, cycleId, values);
    expect(res.status).toBe(400);
  });

  it("同じ回に 2 回送ると 409", async () => {
    const { cycleId, subs } = await setupCouple();
    expect((await submit(subs.you, cycleId, uniformAnswers(3))).status).toBe(201);
    expect((await submit(subs.you, cycleId, uniformAnswers(3))).status).toBe(409);
  });

  it("開いていないサイクル ID を指定すると 409", async () => {
    const { subs } = await setupCouple();
    const res = await submit(subs.you, "not-a-real-cycle", uniformAnswers(3));
    expect(res.status).toBe(409);
  });

  it("回答後は current が submitted: true を返す", async () => {
    const { cycleId, subs } = await setupCouple();
    await submit(subs.you, cycleId, uniformAnswers(2));
    const res = await api("/survey/current", { sub: subs.you });
    const body = (await res.json()) as { submitted: boolean; items: unknown[] };
    expect(body.submitted).toBe(true);
    expect(body.items).toHaveLength(16);
    // パートナー側はまだ未回答
    const partner = await api("/survey/current", { sub: subs.partner });
    expect(((await partner.json()) as { submitted: boolean }).submitted).toBe(false);
  });
});
