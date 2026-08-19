function num(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  /** この時間を過ぎても未確認なら「未確認アラート」の対象にする。 */
  get overdueHours() {
    return num('OVERDUE_HOURS', 24);
  },
  /** リマインドを再送する最短間隔。 */
  get reminderIntervalHours() {
    return num('REMINDER_INTERVAL_HOURS', 24);
  },
  /** 1 配信あたりのリマインド上限回数。 */
  get maxReminders() {
    return num('MAX_REMINDERS', 3);
  },
  /** 従業員に案内する確認画面の起点 URL。 */
  get appBaseUrl() {
    return (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get timeZone() {
    return process.env.TZ_DISPLAY ?? 'Asia/Tokyo';
  },
};

export function ackUrlFor(token: string): string {
  return `${config.appBaseUrl}/ack/${token}`;
}
