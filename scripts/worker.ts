/**
 * リマインド送信の常駐ワーカー。
 *   npm run worker
 *
 * Cloud Scheduler などが使える環境では /api/cron/reminders を叩く方が簡単なので、
 * 常時起動のサーバーで運用する場合の代替手段として用意している。
 */
import { sendReminders } from '../src/lib/delivery-service';

const INTERVAL_MINUTES = Number(process.env.WORKER_INTERVAL_MINUTES ?? 15);

async function tick() {
  try {
    const summary = await sendReminders();
    if (summary.targets > 0) {
      console.log(
        `[worker] ${new Date().toISOString()} 対象 ${summary.targets} 件 / 送信 ${summary.sent} 件 / 失敗 ${summary.failed} 件`,
      );
      for (const error of summary.errors) console.error(`[worker]   ${error}`);
    }
  } catch (error) {
    console.error('[worker] リマインド処理に失敗しました', error);
  }
}

console.log(`[worker] ${INTERVAL_MINUTES} 分おきにリマインドを確認します。`);
void tick();
setInterval(() => void tick(), INTERVAL_MINUTES * 60_000);
