import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  answers,
  couples,
  cycles,
  insights,
  members,
  responses,
  type Couple,
  type Cycle,
  type Member,
} from "../../db/schema";
import { computeScores, itemDeltas, itemGaps, lowestItems, type Scores } from "../survey/scoring";
import { logger } from "../logger";
import { generateAdvice, type Advice } from "./advice";
import type { TriageResult } from "./triage";

/** SQLite の datetime('now') と同じ書式（UTC）に揃える */
export function toSqlDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDate(sqlDatetime: string): Date {
  return new Date(`${sqlDatetime.replace(" ", "T")}Z`);
}

export function formatJstDate(sqlDatetime: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(toDate(sqlDatetime));
}

/** グラフの軸ラベル・期間表示に使う "9/21" 形式 */
export function shortDate(sqlDatetime: string): string {
  const date = toDate(sqlDatetime);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${month}/${day}`;
}

export function rangeLabel(cycle: Cycle): string {
  return `${shortDate(cycle.openedAt)} - ${shortDate(cycle.closesAt)}`;
}

export async function getCouple(db: Db, coupleId: string): Promise<Couple | undefined> {
  const [couple] = await db.select().from(couples).where(eq(couples.id, coupleId)).limit(1);
  return couple;
}

export async function listCouples(db: Db): Promise<Couple[]> {
  return db.select().from(couples);
}

export async function getMembers(db: Db, coupleId: string): Promise<Member[]> {
  return db.select().from(members).where(eq(members.coupleId, coupleId)).orderBy(members.createdAt);
}

export async function getOpenCycle(db: Db, coupleId: string): Promise<Cycle | undefined> {
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.coupleId, coupleId), eq(cycles.status, "open")))
    .orderBy(desc(cycles.openedAt))
    .limit(1);
  return cycle;
}

export async function getLatestCycle(db: Db, coupleId: string): Promise<Cycle | undefined> {
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(eq(cycles.coupleId, coupleId))
    .orderBy(desc(cycles.openedAt))
    .limit(1);
  return cycle;
}

export async function createCycle(db: Db, couple: Couple, now = new Date()): Promise<Cycle> {
  const cycle = {
    id: crypto.randomUUID(),
    coupleId: couple.id,
    openedAt: toSqlDatetime(now),
    closesAt: toSqlDatetime(addDays(now, couple.windowDays)),
    status: "open" as const,
  };
  await db.insert(cycles).values(cycle);
  logger.info("cycle opened", { cycleId: cycle.id, coupleId: couple.id });
  return cycle;
}

/** 期限切れの open サイクルを閉じる。戻り値は閉じたサイクル */
export async function closeExpiredCycles(db: Db, now = new Date()): Promise<Cycle[]> {
  const expired = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.status, "open"), lte(cycles.closesAt, toSqlDatetime(now))));
  if (expired.length === 0) return [];
  await db
    .update(cycles)
    .set({ status: "closed" })
    .where(
      inArray(
        cycles.id,
        expired.map((cycle) => cycle.id),
      ),
    );
  logger.info("cycles closed", { count: expired.length });
  return expired;
}

/** 前回サイクルから cadenceDays 以上経っていれば新しいサイクルを開く */
export async function openCycleIfDue(
  db: Db,
  couple: Couple,
  now = new Date(),
): Promise<Cycle | null> {
  const open = await getOpenCycle(db, couple.id);
  if (open) return null;

  const latest = await getLatestCycle(db, couple.id);
  if (latest && now < addDays(toDate(latest.openedAt), couple.cadenceDays)) return null;
  return createCycle(db, couple, now);
}

export interface PersonalLink {
  memberId: string;
  name: string;
  url: string;
}

/**
 * 招待リンク（= 組に参加するための一度きりの参加券）。
 * メール配信は行わないので、作った人が LINE 等で相手に渡す前提。
 *
 * 参加済み（claimedAt が埋まっている）メンバーのリンクは返さない。
 * そのリンクはもう使えないし、渡す相手もいないため。
 */
export function personalLinks(roster: Member[], appUrl: string): PersonalLink[] {
  const base = appUrl.replace(/\/+$/, "");
  return roster
    .filter((member) => !member.claimedAt)
    .map((member) => ({
      memberId: member.id,
      name: member.name,
      url: `${base}/s/${member.token}`,
    }));
}

export interface ResponseWithScores {
  memberId: string;
  memberName: string;
  comment: string | null;
  /** comment をパートナーに見せてよいか */
  shareComment: boolean;
  submittedAt: string;
  scores: Scores;
  /** 項目 ID -> 0〜5 */
  values: Record<string, number>;
}

/** あるサイクルの全回答を、スコア付きで読み出す */
export async function loadCycleResponses(
  db: Db,
  cycleId: string,
  roster: Member[],
): Promise<ResponseWithScores[]> {
  const rows = await db.select().from(responses).where(eq(responses.cycleId, cycleId));
  if (rows.length === 0) return [];

  const answerRows = await db
    .select()
    .from(answers)
    .where(
      inArray(
        answers.responseId,
        rows.map((row) => row.id),
      ),
    );

  const byResponse = new Map<string, Record<string, number>>();
  for (const row of answerRows) {
    const bucket = byResponse.get(row.responseId) ?? {};
    bucket[row.itemKey] = row.value;
    byResponse.set(row.responseId, bucket);
  }

  return rows.map((row) => {
    const values = byResponse.get(row.id) ?? {};
    return {
      memberId: row.memberId,
      memberName: roster.find((candidate) => candidate.id === row.memberId)?.name ?? "不明",
      comment: row.comment,
      shareComment: row.shareComment,
      submittedAt: row.submittedAt,
      scores: computeScores(values),
      values,
    };
  });
}

export interface LoadedCycle {
  cycle: Cycle;
  entries: ResponseWithScores[];
  /** 二人とも回答済み。相手の結果を開く条件 */
  complete: boolean;
}

/** 直近 limit 回分のサイクルを回答付きで読む（新しい順） */
export async function loadRecentCycles(
  db: Db,
  coupleId: string,
  roster: Member[],
  limit = 9,
): Promise<LoadedCycle[]> {
  const recent = await db
    .select()
    .from(cycles)
    .where(eq(cycles.coupleId, coupleId))
    .orderBy(desc(cycles.openedAt))
    .limit(limit);

  return Promise.all(
    recent.map(async (cycle) => {
      const entries = await loadCycleResponses(db, cycle.id, roster);
      return { cycle, entries, complete: entries.length === roster.length };
    }),
  );
}

export async function getInsight(db: Db, cycleId: string, kind: string): Promise<unknown> {
  const [row] = await db
    .select()
    .from(insights)
    .where(and(eq(insights.cycleId, cycleId), eq(insights.kind, kind)))
    .orderBy(desc(insights.createdAt))
    .limit(1);
  if (!row) return undefined;
  try {
    return JSON.parse(row.payload);
  } catch {
    return undefined;
  }
}

export async function putInsight(
  db: Db,
  cycleId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  // kind ごとに最新 1 件だけを保つ
  await db.delete(insights).where(and(eq(insights.cycleId, cycleId), eq(insights.kind, kind)));
  await db.insert(insights).values({
    id: crypto.randomUUID(),
    cycleId,
    kind,
    payload: JSON.stringify(payload),
  });
}

export type TriageMap = Record<string, TriageResult>;

/** AI 提案は閲覧者ごとに内容が変わるので、メンバー単位で保存する */
export const adviceKind = (memberId: string) => `ai:${memberId}`;

/** history から、あるメンバーの過去エントリだけを古い順に取り出す */
function historyOf(
  history: { entries: ResponseWithScores[] }[],
  memberId: string,
): ResponseWithScores[] {
  return history
    .map((loaded) => loaded.entries.find((entry) => entry.memberId === memberId))
    .filter((entry): entry is ResponseWithScores => entry !== undefined);
}

/**
 * 回答した人それぞれに向けた分析を生成して保存する。
 *
 * 相手も回答済みなら「パートナーが自分をどう感じているか」が入力になる（paired）。
 * 自分しか回答していないなら、自分の回答だけを材料にする（solo）。solo に相手の
 * データを混ぜないのは、「相手が未回答なら相手の結果は見せない」という公開ルールを
 * AI の文章経由で破らないため。
 *
 * 戻り値は「1 件以上生成したか」。
 */
export async function generateCycleInsights(
  db: Db,
  ai: Ai | undefined,
  couple: Couple,
  cycle: Cycle,
  roster: Member[],
): Promise<boolean> {
  const current = await loadCycleResponses(db, cycle.id, roster);
  if (current.length === 0) return false;

  const history = (await loadRecentCycles(db, couple.id, roster, 9))
    .filter((loaded) => loaded.cycle.id !== cycle.id && loaded.entries.length > 0)
    .sort((a, b) => a.cycle.openedAt.localeCompare(b.cycle.openedAt));

  const triage = ((await getInsight(db, cycle.id, "triage")) as TriageMap | undefined) ?? {};

  let generated = 0;
  for (const member of roster) {
    const myEntry = current.find((entry) => entry.memberId === member.id);
    // 自分が答えていない人に「あなたの見え方」は出しようがない
    if (!myEntry) continue;
    const partnerEntry = current.find((entry) => entry.memberId !== member.id);

    const advice = partnerEntry
      ? await generateAdvice(ai, {
          mode: "paired",
          partnerValues: partnerEntry.values,
          partnerLowItems: lowestItems(partnerEntry.values),
          partnerDeltas: itemDeltas(
            historyOf(history, partnerEntry.memberId).at(-1)?.values ?? {},
            partnerEntry.values,
          ),
          gapItems: itemGaps(myEntry.values, partnerEntry.values),
          // 非共有コメントは提案の材料にしない（本人の画面と Jev 判定にのみ使う）
          partnerComment: partnerEntry.shareComment ? partnerEntry.comment : null,
          partnerTriage: partnerEntry.shareComment ? (triage[partnerEntry.memberId] ?? null) : null,
          trendResponsive: [...historyOf(history, partnerEntry.memberId), partnerEntry].map(
            (entry) => entry.scores.responsive,
          ),
          trendInsensitive: [...historyOf(history, partnerEntry.memberId), partnerEntry].map(
            (entry) => entry.scores.insensitive,
          ),
        })
      : await generateAdvice(ai, {
          mode: "solo",
          selfLowItems: lowestItems(myEntry.values),
          selfDeltas: itemDeltas(
            historyOf(history, myEntry.memberId).at(-1)?.values ?? {},
            myEntry.values,
          ),
          // 自分のコメントは共有の可否に関係なく本人向けなので渡してよい
          selfComment: myEntry.comment,
          selfTriage: triage[myEntry.memberId] ?? null,
          trendResponsive: [...historyOf(history, myEntry.memberId), myEntry].map(
            (entry) => entry.scores.responsive,
          ),
          trendInsensitive: [...historyOf(history, myEntry.memberId), myEntry].map(
            (entry) => entry.scores.insensitive,
          ),
        });

    await putInsight(db, cycle.id, adviceKind(member.id), advice);
    generated += 1;
  }

  logger.info("cycle advice generated", { cycleId: cycle.id, generated });
  return generated > 0;
}

export type { Advice };
