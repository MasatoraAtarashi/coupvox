import { describe, expect, it } from "vitest";
import { SURVEY_ITEMS } from "../server/survey/items";
import {
  computeScores,
  itemDeltas,
  itemGaps,
  lowestItems,
  perceptionGap,
} from "../server/survey/scoring";
import { splitAnswers, uniformAnswers } from "./helpers";

describe("尺度の定義", () => {
  it("応答性 8 項目・非応答性 8 項目の計 16 項目", () => {
    expect(SURVEY_ITEMS).toHaveLength(16);
    expect(SURVEY_ITEMS.filter((item) => item.kind === "R")).toHaveLength(8);
    expect(SURVEY_ITEMS.filter((item) => item.kind === "I")).toHaveLength(8);
    expect(new Set(SURVEY_ITEMS.map((item) => item.id)).size).toBe(16);
  });

  it("支給された正式な文言は変えない", () => {
    const fixed: Record<string, string> = {
      R1: "私のパートナーは，私の話をきちんと聴いてくれた",
      R2: "私のパートナーは，私の気持ちを分かろうとしてくれた",
      R3: "私のパートナーは，きちんと私の視点に立ってくれた",
      I1: "私のパートナーは，私が欲しているものや求めているものをきちんと理解してくれなかった",
      I2: "私のパートナーは，私が気になっていることをいとも簡単に否定した",
      I3: "私が何か心配になったりストレスを感じたりしたときに，それをパートナーに話しても悪化するだけだった",
    };
    for (const [id, text] of Object.entries(fixed)) {
      expect(SURVEY_ITEMS.find((item) => item.id === id)?.text).toBe(text);
    }
  });
});

describe("computeScores", () => {
  it("0〜5 の平均 × 20 で 0〜100 になる", () => {
    expect(computeScores(uniformAnswers(5)).responsive).toBe(100);
    expect(computeScores(uniformAnswers(0)).responsive).toBe(0);
    expect(computeScores(uniformAnswers(3)).responsive).toBe(60);
  });

  it("非応答性は反転せず、応答性と独立に出る", () => {
    const scores = computeScores(splitAnswers(5, 1));
    expect(scores.responsive).toBe(100);
    expect(scores.insensitive).toBe(20);
  });
});

describe("lowestItems", () => {
  it("応答性は低い順、非応答性は高い順に「悪い」項目を拾う", () => {
    const values = uniformAnswers(3);
    values.R4 = 0; // 応答性で最低 = 最も悪い
    values.I5 = 5; // 非応答性で最高 = 悪い
    const low = lowestItems(values, 2).map((item) => item.id);
    expect(low).toContain("R4");
    expect(low).toContain("I5");
  });

  it("未回答の項目は含めない", () => {
    expect(lowestItems({ R1: 0 })).toHaveLength(1);
  });
});

describe("perceptionGap", () => {
  it("応答性の差を絶対値で返す", () => {
    expect(perceptionGap(80, 54)).toBe(26);
    expect(perceptionGap(54, 80)).toBe(26);
  });
});

describe("itemGaps", () => {
  it("同じ項目に対する二人の評定の差を大きい順に返す", () => {
    const mine = uniformAnswers(5);
    const theirs = uniformAnswers(5);
    theirs.R1 = 1; // 差 4
    theirs.R2 = 3; // 差 2
    const gaps = itemGaps(mine, theirs);
    expect(gaps.map((gap) => gap.id)).toEqual(["R1", "R2"]);
    expect(gaps[0]).toMatchObject({ mine: 5, theirs: 1, diff: 4 });
  });

  it("差のない項目は返さない。件数上限を守る", () => {
    expect(itemGaps(uniformAnswers(3), uniformAnswers(3))).toHaveLength(0);
    expect(itemGaps(uniformAnswers(0), uniformAnswers(5), 2)).toHaveLength(2);
  });

  it("片方しか答えていない項目は比べない", () => {
    expect(itemGaps({ R1: 5 }, { R2: 0 })).toHaveLength(0);
  });
});

describe("itemDeltas", () => {
  it("前回から2以上動いた項目だけを動きの大きい順に返す", () => {
    const previous = uniformAnswers(3);
    const current = uniformAnswers(3);
    current.R1 = 0; // -3
    current.R2 = 5; // +2
    current.R3 = 4; // +1 は揺らぎとして捨てる
    const deltas = itemDeltas(previous, current);
    expect(deltas.map((delta) => delta.id)).toEqual(["R1", "R2"]);
    expect(deltas[0]).toMatchObject({ from: 3, to: 0 });
  });

  it("前回が無いときは何も返さない", () => {
    expect(itemDeltas({}, uniformAnswers(5))).toHaveLength(0);
  });
});
