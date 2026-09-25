import { createDb } from "../../db/client";
import type { Member } from "../../db/schema";
import { lowestItems, perceptionGap, type LowItem } from "../survey/scoring";
import type { Advice } from "./advice";
import {
  adviceKind,
  getCouple,
  getInsight,
  getMembers,
  loadRecentCycles,
  personalLinks,
  rangeLabel,
  shortDate,
  type PersonalLink,
  type TriageMap,
} from "./cycles";

export interface TrendPoint {
  label: string;
  /** 0〜100。相手の値は「そのサイクルで二人とも回答済み」のときだけ入る */
  meResponsive: number | null;
  meInsensitive: number | null;
  partnerResponsive: number | null;
  partnerInsensitive: number | null;
}

export interface ViewData {
  coupleName: string;
  meName: string;
  partnerName: string;
  weekRange: string;
  cadenceDays: number;

  /** 回答受付中のサイクル。無ければ null */
  openCycleId: string | null;
  meDone: boolean;
  partnerDone: boolean;
  /** 相手の結果を開いてよいか（= 二人とも回答済み） */
  complete: boolean;

  /** 今回のスコア（0〜100）。相手側は complete のときだけ入る */
  meResponsive: number | null;
  meInsensitive: number | null;
  partnerResponsive: number | null;
  partnerInsensitive: number | null;
  gap: number | null;

  /** ホームの「先週のふたり」。前回サイクルで二人とも回答していれば入る */
  lastMeResponsive: number | null;
  lastPartnerResponsive: number | null;

  trend: TrendPoint[];
  /** 相手が低くつけた項目（complete のときだけ） */
  lowItems: LowItem[];

  myComment: string | null;
  partnerComment: string | null;
  /** 相手はコメントを書いたが、共有しない設定だった */
  partnerCommentWithheld: boolean;

  advice: Advice | null;
  /** 自分のコメントから安全に関わる記述が検出された（本人にだけ出す） */
  safetyConcern: boolean;

  partnerLink: PersonalLink | null;
}

export async function loadView(
  database: D1Database,
  me: Member,
  appUrl: string,
): Promise<ViewData | null> {
  const db = createDb(database);
  const couple = await getCouple(db, me.coupleId);
  if (!couple) return null;

  const roster = await getMembers(db, couple.id);
  const partner = roster.find((candidate) => candidate.id !== me.id) ?? null;

  // 新しい順。[0] が「今回」
  const recent = await loadRecentCycles(db, couple.id, roster, 9);
  const current = recent[0];
  const previous = recent.find((loaded, index) => index > 0 && loaded.complete);

  const myEntry = current?.entries.find((entry) => entry.memberId === me.id) ?? null;
  const partnerEntry = current?.entries.find((entry) => entry.memberId !== me.id) ?? null;
  const complete = current?.complete ?? false;

  // 推移は古い順。相手の点は「そのサイクルが complete」のときだけ出す（公開ルール）
  const trend: TrendPoint[] = [...recent]
    .reverse()
    .filter((loaded) => loaded.entries.length > 0)
    .map((loaded) => {
      const mine = loaded.entries.find((entry) => entry.memberId === me.id);
      const theirs = loaded.complete
        ? loaded.entries.find((entry) => entry.memberId !== me.id)
        : undefined;
      return {
        label: shortDate(loaded.cycle.openedAt),
        meResponsive: mine?.scores.responsive ?? null,
        meInsensitive: mine?.scores.insensitive ?? null,
        partnerResponsive: theirs?.scores.responsive ?? null,
        partnerInsensitive: theirs?.scores.insensitive ?? null,
      };
    });

  const triage = current
    ? (((await getInsight(db, current.cycle.id, "triage")) as TriageMap | undefined) ?? {})
    : {};

  const advice = current
    ? (((await getInsight(db, current.cycle.id, adviceKind(me.id))) as Advice | undefined) ?? null)
    : null;

  const previousMine = previous?.entries.find((entry) => entry.memberId === me.id);
  const previousTheirs = previous?.entries.find((entry) => entry.memberId !== me.id);

  return {
    coupleName: couple.name,
    meName: me.name,
    partnerName: partner?.name ?? "パートナー",
    weekRange: current ? rangeLabel(current.cycle) : "—",
    cadenceDays: couple.cadenceDays,

    openCycleId: current?.cycle.status === "open" ? current.cycle.id : null,
    meDone: Boolean(myEntry),
    partnerDone: Boolean(partnerEntry),
    complete,

    meResponsive: myEntry?.scores.responsive ?? null,
    meInsensitive: myEntry?.scores.insensitive ?? null,
    partnerResponsive: complete ? (partnerEntry?.scores.responsive ?? null) : null,
    partnerInsensitive: complete ? (partnerEntry?.scores.insensitive ?? null) : null,
    gap:
      complete && myEntry && partnerEntry
        ? perceptionGap(myEntry.scores.responsive, partnerEntry.scores.responsive)
        : null,

    lastMeResponsive: previousMine?.scores.responsive ?? null,
    lastPartnerResponsive: previousTheirs?.scores.responsive ?? null,

    trend,
    lowItems: complete && partnerEntry ? lowestItems(partnerEntry.values) : [],

    myComment: myEntry?.comment ?? null,
    partnerComment: complete && partnerEntry?.shareComment ? (partnerEntry.comment ?? null) : null,
    partnerCommentWithheld: Boolean(
      complete && partnerEntry?.comment && !partnerEntry.shareComment,
    ),

    advice,
    safetyConcern: triage[me.id]?.safetyConcern === true,

    partnerLink: partner ? (personalLinks([partner], appUrl)[0] ?? null) : null,
  };
}
