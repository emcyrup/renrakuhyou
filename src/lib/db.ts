import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let instance: Database.Database | null = null;

/**
 * 既存のデータベースに後から追加した列を補う。
 * `CREATE TABLE IF NOT EXISTS` では列の追加が反映されないため、ここで差分を当てる。
 */
function migrate(conn: Database.Database): void {
  const columns = conn.prepare('PRAGMA table_info(employees)').all() as { name: string }[];

  if (!columns.some((column) => column.name === 'enroll_token')) {
    conn.exec('ALTER TABLE employees ADD COLUMN enroll_token TEXT');
  }

  // 未発行の従業員に通知設定用トークンを割り当てる。
  const pending = conn
    .prepare("SELECT id FROM employees WHERE enroll_token IS NULL OR enroll_token = ''")
    .all() as { id: number }[];
  if (pending.length > 0) {
    const update = conn.prepare('UPDATE employees SET enroll_token = ? WHERE id = ?');
    const assign = conn.transaction((rows: { id: number }[]) => {
      for (const row of rows) update.run(crypto.randomBytes(24).toString('base64url'), row.id);
    });
    assign(pending);
  }

  conn.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_enroll_token ON employees(enroll_token)');
}

/** SQLite 接続を返す（初回アクセス時にスキーマを適用する）。 */
export function db(): Database.Database {
  if (instance) return instance;

  const file = process.env.DATABASE_FILE ?? path.join(process.cwd(), 'data', 'renrakuhyou.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'schema.sql'), 'utf8'));
  migrate(conn);

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
