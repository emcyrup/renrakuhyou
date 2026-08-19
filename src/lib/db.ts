import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let instance: Database.Database | null = null;

/** SQLite 接続を返す（初回アクセス時にスキーマを適用する）。 */
export function db(): Database.Database {
  if (instance) return instance;

  const file = process.env.DATABASE_FILE ?? path.join(process.cwd(), 'data', 'renrakuhyou.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'schema.sql'), 'utf8'));

  instance = conn;
  return conn;
}

/** SQLite に保存する UTC 時刻文字列（`datetime('now')` と同形式）。 */
export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** SQLite の日時文字列を Date に変換する（UTC として解釈）。 */
export function parseSqliteDate(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}
