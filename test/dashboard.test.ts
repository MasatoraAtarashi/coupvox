import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { loadView } from "../server/lib/dashboard";
import { findMemberByToken } from "../server/lib/session";
import { setupCouple, splitAnswers, submit, uniformAnswers } from "./helpers";

async function viewFor(token: string) {
  const member = await findMemberByToken(createDb(env.DB), token);
  if (!member) throw new Error("member not found");
  const view = await loadView(env.DB, member, "https://example.com");
  if (!view) throw new Error("view not found");
  return view;
}

describe("公開ルール", () => {
  it("片方だけの回答では相手のスコアも項目も開かない", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1));

    const mine = await viewFor(tokens.you);
    expect(mine.meDone).toBe(true);
    expect(mine.partnerDone).toBe(false);
    expect(mine.complete).toBe(false);
    expect(mine.meResponsive).toBe(80);
    expect(mine.partnerResponsive).toBeNull();
    expect(mine.gap).toBeNull();
    expect(mine.lowItems).toHaveLength(0);
    // 推移にも相手の点は出さない
    expect(mine.trend.at(-1)?.partnerResponsive).toBeNull();
  });

  it("ふたりとも回答すると相手の結果が開く", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1));
    await submit(tokens.partner, cycleId, splitAnswers(2, 3));

    const mine = await viewFor(tokens.you);
    expect(mine.complete).toBe(true);
    expect(mine.meResponsive).toBe(80);
    expect(mine.partnerResponsive).toBe(40);
    expect(mine.gap).toBe(40);
    expect(mine.lowItems.length).toBeGreaterThan(0);
  });
});

describe("コメントの共有", () => {
  it("共有しないコメントは相手に渡らず、本人には見える", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, uniformAnswers(4), {
      comment: "秘密のひとこと",
      shareComment: false,
    });
    await submit(tokens.partner, cycleId, uniformAnswers(3));

    expect((await viewFor(tokens.you)).myComment).toBe("秘密のひとこと");

    const theirs = await viewFor(tokens.partner);
    expect(theirs.partnerComment).toBeNull();
    expect(theirs.partnerCommentWithheld).toBe(true);
  });

  it("共有したコメントは相手にも開く", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, uniformAnswers(4), {
      comment: "話を聞いてくれてありがとう",
      shareComment: true,
    });
    await submit(tokens.partner, cycleId, uniformAnswers(3));

    const theirs = await viewFor(tokens.partner);
    expect(theirs.partnerComment).toBe("話を聞いてくれてありがとう");
    expect(theirs.partnerCommentWithheld).toBe(false);
  });
});

describe("組の分離", () => {
  it("別の組のデータは混ざらない", async () => {
    const first = await setupCouple();
    await submit(first.tokens.you, first.cycleId, uniformAnswers(5));
    const second = await setupCouple();
    await submit(second.tokens.you, second.cycleId, uniformAnswers(1));

    const mine = await viewFor(first.tokens.you);
    expect(mine.meResponsive).toBe(100);
    expect(mine.trend).toHaveLength(1);
    expect(mine.partnerLink?.url).toContain("https://example.com/s/");
  });
});
