/**
 * SQLite のバックアップを取得する。
 *   npm run backup
 *
 * 稼働中でも安全にコピーできる SQLite のバックアップ API を使うため、
 * サービスを止める必要はない。古い世代は BACKUP_KEEP_DAYS を過ぎたら削除する。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const source = process.env.DATABASE_FILE ?? path.join(process.cwd(), 'data', 'renrakuhyou.sqlite');
const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

async function main() {
  if (!fs.existsSync(source)) {
    console.error(`バックアップ元が見つかりません: ${source}`);
    process.exit(1);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const destination = path.join(backupDir, `renrakuhyou-${stamp(new Date())}.sqlite`);

  const db = new Database(source, { readonly: true });
  await db.backup(destination);
  db.close();

  const size = (fs.statSync(destination).size / 1024).toFixed(1);
  console.log(`バックアップを作成しました: ${destination}（${size} KB）`);

  // 保持期間を過ぎた世代を削除する。
  const threshold = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(backupDir)) {
    if (!name.startsWith('renrakuhyou-') || !name.endsWith('.sqlite')) continue;
    const file = path.join(backupDir, name);
    if (file === destination) continue;
    if (fs.statSync(file).mtimeMs < threshold) {
      fs.unlinkSync(file);
      removed += 1;
    }
  }
  if (removed > 0) console.log(`${keepDays} 日を過ぎた ${removed} 件を削除しました。`);
}

void main();
