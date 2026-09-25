import { describe, expect, it } from "vitest";
import {
  allowedSections,
  describePaired,
  describeSolo,
  generateAdvice,
  parseAdvice,
  type PairedAdviceInput,
  type SoloAdviceInput,
} from "../server/lib/advice";

/** ai.run に渡されたメッセージを覚えておく偽 AI。env.AI は使わない */
function fakeAi(response: unknown) {
  const calls: { system: string; user: string }[] = [];
  const ai = {
    run: async (_model: string, options: { messages: { role: string; content: string }[] }) => {
      calls.push({
        system: options.messages.find((m) => m.role === "system")?.content ?? "",
        user: options.messages.find((m) => m.role === "user")?.content ?? "",
      });
      return { response };
    },
  } as unknown as Ai;
  return { ai, calls };
}

const soloInput: SoloAdviceInput = {
  mode: "solo",
  selfLowItems: [{ id: "R1", text: "私のパートナーは，私の話をきちんと聴いてくれた", score: 1 }],
  selfDeltas: [
    { id: "R2", text: "私のパートナーは，私の気持ちを分かろうとしてくれた", from: 4, to: 2 },
  ],
  selfComment: "最近すれちがっている気がする",
  selfTriage: null,
  trendResponsive: [60, 40],
  trendInsensitive: [20, 30],
};

const pairedInput: PairedAdviceInput = {
  mode: "paired",
  partnerValues: { R1: 2, I1: 4 },
  partnerLowItems: [{ id: "R1", text: "私のパートナーは，私の話をきちんと聴いてくれた", score: 2 }],
  partnerDeltas: [],
  gapItems: [
    {
      id: "R1",
      text: "私のパートナーは，私の話をきちんと聴いてくれた",
      mine: 5,
      theirs: 2,
      diff: 3,
    },
  ],
  partnerComment: "ちゃんと聞いてほしい",
  partnerTriage: null,
  trendResponsive: [70, 40],
  trendInsensitive: [10, 20],
};

describe("parseAdvice", () => {
  it("オブジェクトで返ってきた応答をそのまま解釈する", () => {
    // Workers AI の response は文字列のこともオブジェクトのこともある
    const parsed = parseAdvice({
      lead: "受けとめる文",
      sections: [{ key: "gap", body: "ちがいの説明" }],
      actions: ["行動ひとつ"],
    });
    expect(parsed?.lead).toBe("受けとめる文");
    expect(parsed?.sections).toEqual([{ key: "gap", body: "ちがいの説明" }]);
    expect(parsed?.lines).toEqual(["行動ひとつ"]);
  });

  it("コードブロックで囲まれた文字列を解釈する", () => {
    const raw = '```json\n{"lead":"文","sections":[],"actions":["行動"]}\n```';
    expect(parseAdvice(raw)?.lead).toBe("文");
  });

  it("未知の key を捨て、重複 key は先勝ち、actions は3件で切る", () => {
    const parsed = parseAdvice({
      lead: "文",
      sections: [
        { key: "gap", body: "1つ目" },
        { key: "unknown", body: "捨てられる" },
        { key: "gap", body: "2つ目" },
      ],
      actions: ["a", "b", "c", "d"],
    });
    expect(parsed?.sections).toEqual([{ key: "gap", body: "1つ目" }]);
    expect(parsed?.lines).toEqual(["a", "b", "c"]);
  });

  it("旧スキーマの lines キーでも受け取れる", () => {
    expect(parseAdvice({ lead: "文", lines: ["行動"] })?.lines).toEqual(["行動"]);
  });

  it("壊れた JSON は null を返す", () => {
    expect(parseAdvice("これは JSON ではありません")).toBeNull();
    expect(parseAdvice({ lead: "", actions: [] })).toBeNull();
  });
});

describe("generateAdvice", () => {
  it("AI が無いときは mode ごとの FALLBACK を返す", async () => {
    const solo = await generateAdvice(undefined, soloInput);
    const paired = await generateAdvice(undefined, pairedInput);
    expect(solo.generatedBy).toBe("fallback");
    expect(solo.mode).toBe("solo");
    expect(paired.mode).toBe("paired");
    // 文面が同じだと solo で「相手がつけた点数」と嘘をつくことになる
    expect(solo.lead).not.toBe(paired.lead);
  });

  it("解釈できない応答でも mode を保った FALLBACK になる", async () => {
    const { ai } = fakeAi("壊れた応答");
    const advice = await generateAdvice(ai, soloInput);
    expect(advice.generatedBy).toBe("fallback");
    expect(advice.mode).toBe("solo");
  });

  it("mode は AI の申告ではなく入力から付ける", async () => {
    const { ai } = fakeAi({ lead: "文", sections: [], actions: ["行動"], mode: "paired" });
    expect((await generateAdvice(ai, soloInput)).mode).toBe("solo");
  });

  it("行動が取れなくても lead と分析は活かす", async () => {
    const { ai } = fakeAi({ lead: "文", sections: [{ key: "gap", body: "説明" }], actions: [] });
    const advice = await generateAdvice(ai, soloInput);
    expect(advice.generatedBy).not.toBe("fallback");
    expect(advice.sections).toHaveLength(1);
    expect(advice.lines.length).toBeGreaterThan(0);
  });
});

describe("プロンプトに入れてよいもの", () => {
  it("solo のプロンプトには相手の情報が一切入らない", () => {
    const prompt = describeSolo(soloInput);
    expect(prompt).toContain("最近すれちがっている気がする");
    // 相手側のラベルが混ざっていないこと
    expect(prompt).not.toContain("パートナーがあなたについて");
    expect(prompt).not.toContain("パートナーのコメント");
    expect(prompt).not.toContain("相手");
  });

  it("solo の system プロンプトは相手の推測を禁じている", async () => {
    const { ai, calls } = fakeAi({ lead: "文", sections: [], actions: ["行動"] });
    await generateAdvice(ai, soloInput);
    expect(calls[0].system).toContain("相手はまだ回答していません");
  });

  it("safetyConcern はプロンプトに渡さない", () => {
    const prompt = describeSolo({
      ...soloInput,
      selfTriage: {
        topic: "conflict",
        topicLabel: "すれちがい",
        urgency: 3,
        urgencyLabel: "高い",
        tone: 2,
        toneLabel: "つらい",
        needsConversation: true,
        isAppreciation: false,
        safetyConcern: true,
        latencyMs: 12,
      },
    });
    expect(prompt).toContain("すれちがい");
    expect(prompt).not.toContain("safety");
  });

  it("共有されていないコメントは paired のプロンプトに入らない", () => {
    // 呼び出し側が partnerComment に null を入れる契約。型と文面の両方で担保する
    const prompt = describePaired({ ...pairedInput, partnerComment: null, partnerTriage: null });
    expect(prompt).not.toContain("ちゃんと聞いてほしい");
    expect(prompt).not.toContain("パートナーのコメント");
  });
});

describe("材料の無いセクションを書かせない", () => {
  it("allowedSections は材料があるものだけを返す", () => {
    expect(allowedSections(soloInput)).toEqual(["gap", "change", "comment"]);
    expect(allowedSections({ ...soloInput, selfDeltas: [], selfComment: null })).toEqual(["gap"]);
    expect(allowedSections({ ...pairedInput, partnerDeltas: [] })).toEqual(["gap", "comment"]);
  });

  it("許可していない key の section は捨てる", () => {
    const parsed = parseAdvice(
      {
        lead: "文",
        sections: [
          { key: "gap", body: "ある" },
          { key: "change", body: "前回のデータが無いのに書かれたもの" },
        ],
        actions: ["行動"],
      },
      ["gap"],
    );
    expect(parsed?.sections).toEqual([{ key: "gap", body: "ある" }]);
  });

  it("前回データが無いとき change を書かせない", async () => {
    const { ai, calls } = fakeAi({
      lead: "文",
      sections: [{ key: "change", body: "特に変化はありません" }],
      actions: ["行動"],
    });
    const advice = await generateAdvice(ai, { ...soloInput, selfDeltas: [] });
    expect(calls[0].user).toContain("書けるセクション: gap, comment");
    expect(advice.sections).toHaveLength(0);
  });
});
