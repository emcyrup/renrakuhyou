import { config } from './config';

/**
 * 表示用タイムゾーン（TZ_DISPLAY）での日付・時刻の扱い。
 * データベースは UTC で保存しているため、「今日の分」を絞り込むときはここで範囲を作る。
 */

/** 表示用タイムゾーンでの YYYY-MM-DD。 */
export function displayDate(at: Date = new Date()): string {
  // en-CA は YYYY-MM-DD 形式で返る。
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** その時点での表示用タイムゾーンの UTC からのずれ（分）。 */
function offsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60_000;
}

function toSqlite(at: Date): string {
  return at.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 表示用タイムゾーンの 1 日を、データベース（UTC）の範囲に変換する。
 * 返り値は [その日の 00:00, 翌日の 00:00) の SQLite 日時文字列。
 */
export function dayRangeUtc(date: string = displayDate()): [string, string] {
  const [year, month, day] = date.split('-').map(Number);
  const naive = Date.UTC(year, month - 1, day);
  // 日本標準時のように年間を通じてずれが一定の地域を前提にしている。
  const offset = offsetMinutes(new Date(naive));
  const start = new Date(naive - offset * 60_000);
  return [toSqlite(start), toSqlite(new Date(start.getTime() + 24 * 60 * 60 * 1000))];
}
