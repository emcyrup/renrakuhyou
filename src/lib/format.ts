import { config } from './config';

const formatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: config.timeZone,
});

/** SQLite の UTC 日時文字列を表示用のローカル時刻に整形する。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return formatter.format(new Date(`${value.replace(' ', 'T')}Z`));
}

/** 指定時刻からの経過時間を「3時間前」「2日前」の形式にする。 */
export function elapsedLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const minutes = Math.floor((Date.now() - new Date(`${value.replace(' ', 'T')}Z`).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(0, minutes)}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export function elapsedHours(value: string | null | undefined): number {
  if (!value) return 0;
  return (Date.now() - new Date(`${value.replace(' ', 'T')}Z`).getTime()) / 3_600_000;
}
