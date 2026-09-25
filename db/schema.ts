import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const now = sql`(datetime('now'))`;

/** カップル（このアプリは 1 インスタンス = 1 組の運用を想定） */
export const couples = sqliteTable("couples", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** アンケートを配信する間隔（日）。既定は尺度の想起期間に合わせて 14 日 */
  cadenceDays: integer("cadence_days").notNull().default(14),
  /** 回答受付を締め切るまでの日数 */
  windowDays: integer("window_days").notNull().default(7),
  createdAt: text("created_at").notNull().default(now),
});

/** 二人のメンバー。token は個人用リンク（メールから開く URL）の鍵 */
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id")
      .notNull()
      .references(() => couples.id),
    name: text("name").notNull(),
    /** 通知手段を足すとき用。いまは任意（メール配信は行っていない） */
    email: text("email"),
    token: text("token").notNull().unique(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [index("members_couple_idx").on(table.coupleId)],
);

/** アンケート 1 回分（既定では 2 週ごとに 1 サイクル） */
export const cycles = sqliteTable(
  "cycles",
  {
    id: text("id").primaryKey(),
    coupleId: text("couple_id")
      .notNull()
      .references(() => couples.id),
    openedAt: text("opened_at").notNull().default(now),
    closesAt: text("closes_at").notNull(),
    /** open: 回答受付中 / closed: 締切済み */
    status: text("status").notNull().default("open"),
  },
  (table) => [index("cycles_couple_idx").on(table.coupleId, table.openedAt)],
);

/** あるサイクルにおける 1 人分の回答。同一サイクルに 1 人 1 件 */
export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    comment: text("comment"),
    /** 自由記述をパートナーと共有するか。回答ごとに本人が選ぶ */
    shareComment: integer("share_comment", { mode: "boolean" }).notNull().default(false),
    submittedAt: text("submitted_at").notNull().default(now),
  },
  (table) => [unique("responses_cycle_member_unique").on(table.cycleId, table.memberId)],
);

/** 16 項目の素点（0〜5） */
export const answers = sqliteTable(
  "answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id),
    itemKey: text("item_key").notNull(),
    value: integer("value").notNull(),
  },
  (table) => [unique("answers_response_item_unique").on(table.responseId, table.itemKey)],
);

/**
 * サイクル単位の自動生成物。
 * kind = "ai": Workers AI による二人向けアドバイス
 * kind = "triage": Jev(System One) によるコメント即時トリアージ（問題の早期発見用）
 */
export const insights = sqliteTable(
  "insights",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id),
    kind: text("kind").notNull(),
    /** JSON 文字列。形は kind ごとに server/lib 側で定義 */
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [index("insights_cycle_idx").on(table.cycleId, table.kind)],
);

export type Couple = typeof couples.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type SurveyResponse = typeof responses.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Insight = typeof insights.$inferSelect;
