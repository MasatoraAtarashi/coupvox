import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { loadView } from "../server/lib/dashboard";
import { findMemberByToken } from "../server/lib/session";
import { generateCycleInsights, getCouple, getLatestCycle, getMembers } from "../server/lib/cycles";
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

/** ai.run が受け取った user メッセージを覚えておく偽 AI */
function recordingAi(response: unknown) {
  const prompts: string[] = [];
  const ai = {
    run: async (_model: string, options: { messages: { role: string; content: string }[] }) => {
      prompts.push(options.messages.find((m) => m.role === "user")?.content ?? "");
      return { response };
    },
  } as unknown as Ai;
  return { ai, prompts };
}

const AI_RESPONSE = {
  lead: "受けとめる文",
  sections: [{ key: "gap", body: "説明" }],
  actions: ["行動"],
};

async function generateFor(token: string, ai: Ai) {
  const db = createDb(env.DB);
  const member = await findMemberByToken(db, token);
  if (!member) throw new Error("member not found");
  const couple = await getCouple(db, member.coupleId);
  const cycle = await getLatestCycle(db, member.coupleId);
  if (!couple || !cycle) throw new Error("cycle not found");
  const roster = await getMembers(db, member.coupleId);
  return generateCycleInsights(db, ai, couple, cycle, roster);
}

describe("AI 分析の生成", () => {
  it("片方だけの回答でも、回答した人には solo の分析が出る", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1));

    const { ai } = recordingAi(AI_RESPONSE);
    expect(await generateFor(tokens.you, ai)).toBe(true);

    const mine = await viewFor(tokens.you);
    expect(mine.advice?.mode).toBe("solo");
    expect(mine.advice?.sections).toHaveLength(1);
    // 回答していない相手には出さない
    expect((await viewFor(tokens.partner)).advice).toBeNull();
  });

  it("solo のプロンプトに相手のデータが入らない", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1), {
      comment: "わたしのひとりごと",
      shareComment: false,
    });

    const { ai, prompts } = recordingAi(AI_RESPONSE);
    await generateFor(tokens.you, ai);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("わたしのひとりごと");
    expect(prompts[0]).not.toContain("はなこ");
  });

  it("ふたり揃うと paired に切り替わる", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1));
    await generateFor(tokens.you, recordingAi(AI_RESPONSE).ai);
    await submit(tokens.partner, cycleId, splitAnswers(2, 3));

    const { ai } = recordingAi(AI_RESPONSE);
    await generateFor(tokens.you, ai);
    expect((await viewFor(tokens.you)).advice?.mode).toBe("paired");
    expect((await viewFor(tokens.partner)).advice?.mode).toBe("paired");
  });

  it("共有されていないコメントは相手向けのプロンプトに入らない", async () => {
    const { cycleId, tokens } = await setupCouple();
    await submit(tokens.you, cycleId, splitAnswers(4, 1), {
      comment: "これは秘密のコメント",
      shareComment: false,
    });
    await submit(tokens.partner, cycleId, splitAnswers(2, 3), {
      comment: "これは共有するコメント",
      shareComment: true,
    });

    const { ai, prompts } = recordingAi(AI_RESPONSE);
    await generateFor(tokens.you, ai);
    // 2 人分のプロンプトのどこにも、共有されていないコメントは現れない
    expect(prompts.some((prompt) => prompt.includes("これは共有するコメント"))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes("これは秘密のコメント"))).toBe(false);
  });

  it("誰も回答していなければ生成しない", async () => {
    const { tokens } = await setupCouple();
    expect(await generateFor(tokens.you, recordingAi(AI_RESPONSE).ai)).toBe(false);
  });
});
