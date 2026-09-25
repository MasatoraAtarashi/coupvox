import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { loadView } from "../server/lib/dashboard";
import { findMemberByGoogleSub } from "../server/auth/member";
import { setupCouple, splitAnswers, submit, uniformAnswers } from "./helpers";

async function viewFor(sub: string) {
  const member = await findMemberByGoogleSub(createDb(env.DB), sub);
  if (!member) throw new Error("member not found");
  const view = await loadView(env.DB, member, "https://example.com");
  if (!view) throw new Error("view not found");
  return view;
}

describe("公開ルール", () => {
  it("片方だけの回答では相手のスコアも項目も開かない", async () => {
    const { cycleId, subs } = await setupCouple();
    await submit(subs.you, cycleId, splitAnswers(4, 1));

    const mine = await viewFor(subs.you);
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
    const { cycleId, subs } = await setupCouple();
    await submit(subs.you, cycleId, splitAnswers(4, 1));
    await submit(subs.partner, cycleId, splitAnswers(2, 3));

    const mine = await viewFor(subs.you);
    expect(mine.complete).toBe(true);
    expect(mine.meResponsive).toBe(80);
    expect(mine.partnerResponsive).toBe(40);
    expect(mine.gap).toBe(40);
    expect(mine.lowItems.length).toBeGreaterThan(0);
  });
});

describe("コメントの共有", () => {
  it("共有しないコメントは相手に渡らず、本人には見える", async () => {
    const { cycleId, subs } = await setupCouple();
    await submit(subs.you, cycleId, uniformAnswers(4), {
      comment: "秘密のひとこと",
      shareComment: false,
    });
    await submit(subs.partner, cycleId, uniformAnswers(3));

    expect((await viewFor(subs.you)).myComment).toBe("秘密のひとこと");

    const theirs = await viewFor(subs.partner);
    expect(theirs.partnerComment).toBeNull();
    expect(theirs.partnerCommentWithheld).toBe(true);
  });

  it("共有したコメントは相手にも開く", async () => {
    const { cycleId, subs } = await setupCouple();
    await submit(subs.you, cycleId, uniformAnswers(4), {
      comment: "話を聞いてくれてありがとう",
      shareComment: true,
    });
    await submit(subs.partner, cycleId, uniformAnswers(3));

    const theirs = await viewFor(subs.partner);
    expect(theirs.partnerComment).toBe("話を聞いてくれてありがとう");
    expect(theirs.partnerCommentWithheld).toBe(false);
  });
});

describe("組の分離", () => {
  it("別の組のデータは混ざらない", async () => {
    const first = await setupCouple();
    await submit(first.subs.you, first.cycleId, uniformAnswers(5));
    const second = await setupCouple();
    await submit(second.subs.you, second.cycleId, uniformAnswers(1));

    const mine = await viewFor(first.subs.you);
    expect(mine.meResponsive).toBe(100);
    expect(mine.trend).toHaveLength(1);
    // ふたりとも参加済みなので、配る招待リンクはもう無い
    expect(mine.partnerLink).toBeNull();
  });
});
