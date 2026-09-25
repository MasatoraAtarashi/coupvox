import { createDb } from "../../db/client";
import { logger } from "../logger";
import {
  closeExpiredCycles,
  generateCycleInsights,
  getMembers,
  listCouples,
  openCycleIfDue,
} from "./cycles";

/**
 * cron から呼ばれる定期処理。
 * 1. 期限切れのサイクルを閉じ、揃っていればアドバイスを生成
 * 2. 次のサイクルが来ていれば開く（通知は行わない。各自が個人リンクから開く運用）
 */
export async function runScheduled(env: Env, now = new Date()): Promise<void> {
  const db = createDb(env.DB);
  const couples = await listCouples(db);
  if (couples.length === 0) {
    logger.info("scheduled run skipped: no couples");
    return;
  }

  // 締切処理は全組まとめて 1 クエリで
  const closed = await closeExpiredCycles(db, now);

  for (const couple of couples) {
    const roster = await getMembers(db, couple.id);

    for (const cycle of closed.filter((candidate) => candidate.coupleId === couple.id)) {
      await generateCycleInsights(db, env.AI, couple, cycle, roster).catch((error) => {
        logger.warn("advice generation on close failed", {
          cycleId: cycle.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      });
    }

    const opened = await openCycleIfDue(db, couple, now);
    if (opened) {
      // メール配信は行わないので、開いたことだけ記録する。
      // 二人は個人リンク（ブクマ済み）を開けば回答画面に入れる。
      logger.info("scheduled run: cycle opened", {
        coupleId: couple.id,
        cycleId: opened.id,
      });
    }
  }
}
