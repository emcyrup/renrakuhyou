/**
 * 構築が正しく終わっているかを自己診断する。
 *   npm run healthcheck
 *
 * サーバー構築の直後と、設定を変えたあとに実行する。
 * FAIL が 1 つでもあれば、その状態では従業員に連絡が届かない可能性がある。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings } from '../src/lib/app-settings';
import { db } from '../src/lib/db';
import { getWeather } from '../src/lib/weather';

type Level = 'PASS' | 'WARN' | 'FAIL';

const results: { level: Level; label: string; detail?: string }[] = [];

function record(level: Level, label: string, detail?: string) {
  results.push({ level, label, detail });
}

/**
 * ファイルを読む。読めない場合は例外にせず null を返す。
 * このスクリプトはアプリ用ユーザーで実行されるため、root 専用のファイルは読めないことがある。
 */
function readFileSafe(file: string): { content: string } | { error: string } {
  try {
    return { content: fs.readFileSync(file, 'utf8') };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { error: code === 'EACCES' ? '読み取り権限がありません' : String(code ?? error) };
  }
}

function checkEnv() {
  const required = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET'];
  // .env.example の初期値。変更し忘れるとそのまま第三者に使われてしまう。
  const placeholders = new Set(['change-me', 'change-me-too', 'change-me-as-well']);

  for (const name of required) {
    const value = process.env[name];
    if (!value) {
      record('FAIL', `${name} が未設定`, '.env に設定してください');
    } else if (placeholders.has(value)) {
      record('FAIL', `${name} が .env.example の初期値のまま`, 'openssl rand -base64 32 で作り直してください');
    } else if (name !== 'ADMIN_PASSWORD' && value.length < 24) {
      record('WARN', `${name} が短い（${value.length} 文字）`, '32 文字以上を推奨します');
    } else {
      record('PASS', `${name} が設定されている`);
    }
  }
}

function checkBaseUrl() {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    record('FAIL', 'APP_BASE_URL が未設定', '従業員に案内する URL が作れません');
    return;
  }
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    record('WARN', 'APP_BASE_URL がローカルのまま', '本番では https://<ドメイン> を設定してください');
    return;
  }
  if (!url.startsWith('https://')) {
    record('FAIL', 'APP_BASE_URL が https ではない', 'Web Push は HTTPS でのみ動作します');
    return;
  }
  if (url.endsWith('/')) {
    record('WARN', 'APP_BASE_URL の末尾に / がある', 'URL が二重スラッシュになります');
    return;
  }
  record('PASS', `APP_BASE_URL = ${url}`);
}

function checkVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey) {
    record('FAIL', 'VAPID 鍵が未設定', 'npm run push:keys で生成して .env に設定してください');
    return;
  }

  // P-256 の非圧縮公開鍵は 65 バイト。base64url で 87 文字になる。
  const decoded = Buffer.from(publicKey, 'base64url');
  if (decoded.length !== 65 || decoded[0] !== 0x04) {
    record('FAIL', 'VAPID_PUBLIC_KEY の形式が不正', `${decoded.length} バイト（65 バイトである必要があります）`);
  } else {
    record('PASS', 'VAPID 公開鍵の形式が正しい');
  }

  if (Buffer.from(privateKey, 'base64url').length !== 32) {
    record('FAIL', 'VAPID_PRIVATE_KEY の形式が不正', '32 バイトである必要があります');
  } else {
    record('PASS', 'VAPID 秘密鍵の形式が正しい');
  }

  if (!subject || !/^(mailto:|https:\/\/)/.test(subject)) {
    record('FAIL', 'VAPID_SUBJECT が不正', 'mailto: または https:// で始まる必要があります');
  } else {
    record('PASS', `VAPID_SUBJECT = ${subject}`);
  }
}

/** AI（Claude API）と天気（気象庁）の設定。使わない構成でも動くため、いずれも「注意」止まり。 */
async function checkOptionalServices() {
  if (process.env.ANTHROPIC_API_KEY) {
    record('PASS', 'AI の API キーが設定されている');
  } else {
    record('WARN', 'ANTHROPIC_API_KEY が未設定', '従業員の「AI に質問する」は使えません');
  }

  const settings = loadSettings();
  const weather = await getWeather(settings.weatherAreaCode);
  if (weather) {
    record('PASS', `天気を取得できる（${weather.area || settings.weatherAreaCode}: ${weather.text}）`);
  } else {
    record(
      'WARN',
      `天気を取得できない（地域コード ${settings.weatherAreaCode}）`,
      '受付画面の天気は表示されません。地域コードと外部への通信をご確認ください',
    );
  }
}

function checkDatabase() {
  const file = process.env.DATABASE_FILE ?? path.join(process.cwd(), 'data', 'renrakuhyou.sqlite');

  try {
    const conn = db();
    const tables = (conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    for (const table of ['employees', 'messages', 'deliveries', 'push_subscriptions']) {
      if (!tables.includes(table)) {
        record('FAIL', `テーブル ${table} がない`, 'アプリを 1 度起動してください');
        return;
      }
    }
    record('PASS', `データベースに接続できる（${file}）`);

    fs.accessSync(file, fs.constants.W_OK);
    record('PASS', 'データベースに書き込み権限がある');

    const employees = conn
      .prepare("SELECT COUNT(*) AS count FROM employees WHERE active = 1 AND provider = 'web_push'")
      .get() as { count: number };
    const missing = conn
      .prepare(
        `SELECT COUNT(*) AS count FROM employees e
          WHERE e.provider = 'web_push' AND e.active = 1
            AND NOT EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.employee_id = e.id)`,
      )
      .get() as { count: number };

    if (employees.count === 0) {
      record('WARN', 'アプリ通知を使う従業員がまだ登録されていない');
    } else if (missing.count > 0) {
      record('WARN', `通知設定が未完了の従業員が ${missing.count} 名`, 'この従業員には連絡が届きません');
    } else {
      record('PASS', `アプリ通知の従業員 ${employees.count} 名すべてが設定済み`);
    }
  } catch (error) {
    record('FAIL', 'データベースを開けない', error instanceof Error ? error.message : String(error));
  }
}

async function checkHttp() {
  const local = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

  try {
    const response = await fetch(`${local}/login`, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      record('PASS', `アプリが応答している（${local}）`);
    } else {
      record('FAIL', `アプリの応答が異常（${response.status}）`);
      return;
    }
  } catch {
    record('FAIL', `アプリに接続できない（${local}）`, 'systemctl status renrakuhyou を確認してください');
    return;
  }

  // リマインドの定期実行が通るかを、実際の認証つきで確かめる
  const secret = process.env.CRON_SECRET;
  if (secret) {
    try {
      const response = await fetch(`${local}/api/cron/reminders`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const summary = (await response.json()) as { targets: number; sent: number; failed: number };
        record('PASS', `リマインドの定期実行が通る（対象 ${summary.targets} 件 / 失敗 ${summary.failed} 件）`);
      } else {
        record('FAIL', `リマインドの定期実行が失敗（${response.status}）`, 'CRON_SECRET が一致しているか確認してください');
      }
    } catch (error) {
      record('FAIL', 'リマインドの定期実行に接続できない', error instanceof Error ? error.message : String(error));
    }
  }

  // 外部からの HTTPS 到達性（従業員のスマートフォンから見える経路）
  const baseUrl = process.env.APP_BASE_URL;
  if (baseUrl?.startsWith('https://')) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        record('PASS', `HTTPS で外部から到達できる（${baseUrl}）`);
      } else {
        record('FAIL', `HTTPS の応答が異常（${response.status}）`);
      }
    } catch (error) {
      record(
        'FAIL',
        'HTTPS で到達できない',
        `${error instanceof Error ? error.message : String(error)} / DNS と Caddy の状態を確認してください`,
      );
    }
  }
}

function checkCronEnvFile() {
  const file = '/etc/renrakuhyou-cron.env';
  if (!fs.existsSync(file)) {
    record('WARN', `${file} がない`, 'リマインドのタイマーを使う場合は作成してください');
    return;
  }

  const read = readFileSafe(file);
  if ('error' in read) {
    record('WARN', `${file} を確認できない（${read.error}）`, 'root で実行すると照合できます');
    return;
  }

  const match = read.content.match(/^CRON_SECRET=(.*)$/m);
  if (!match) {
    record('FAIL', `${file} に CRON_SECRET がない`);
  } else if (match[1].trim() !== process.env.CRON_SECRET) {
    record('FAIL', `${file} の CRON_SECRET が .env と一致しない`, 'リマインドが 401 で失敗します');
  } else {
    record('PASS', `${file} の CRON_SECRET が一致している`);
  }
}

/**
 * Caddyfile のサイト名と APP_BASE_URL のホスト名が一致しているかを見る。
 * ここがずれていると、証明書は取れているのにページへ到達できない状態になる。
 */
function checkCaddySite() {
  const file = process.env.CADDYFILE_PATH ?? '/etc/caddy/Caddyfile';
  if (!fs.existsSync(file)) return; // Caddy を使わない構成では確認しない

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return; // APP_BASE_URL 側は checkBaseUrl が報告済み

  let expected: string;
  try {
    expected = new URL(baseUrl).host;
  } catch {
    return;
  }

  // サイトブロックの見出し行（`example.com {` や `example.com, www.example.com {`）を集める。
  // header などのネストしたディレクティブを拾わないよう、字下げのない行だけを見る。
  // 先頭のグローバル設定ブロック（`{` だけの行）も対象外。
  const read = readFileSafe(file);
  if ('error' in read) {
    record('WARN', `${file} を確認できない（${read.error}）`, 'root で実行すると照合できます');
    return;
  }

  const addresses = read.content
    .split('\n')
    .filter((line) => line === line.trimStart())
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.endsWith('{') && line !== '{')
    .flatMap((line) =>
      line
        .slice(0, -1)
        .split(',')
        .map((address) => address.trim().replace(/^https?:\/\//, ''))
        .filter(Boolean),
    );

  if (addresses.length === 0) {
    record('WARN', 'Caddyfile からサイト名を読み取れなかった', file);
    return;
  }

  if (addresses.includes(expected)) {
    record('PASS', `Caddyfile のサイト名が APP_BASE_URL と一致している（${expected}）`);
    return;
  }

  record(
    'FAIL',
    `Caddyfile のサイト名が APP_BASE_URL と一致しない`,
    `Caddyfile: ${addresses.join(', ')} / APP_BASE_URL: ${expected} — ` +
      `${file} の先頭を「${expected} {」に直し、systemctl restart caddy を実行してください`,
  );
}

async function main() {
  checkEnv();
  checkBaseUrl();
  checkVapid();
  checkDatabase();
  checkCronEnvFile();
  checkCaddySite();
  await checkOptionalServices();
  await checkHttp();

  const icon: Record<Level, string> = { PASS: ' OK ', WARN: '注意', FAIL: '失敗' };

  console.log('\n連絡票 セルフチェック\n');
  for (const result of results) {
    console.log(`[${icon[result.level]}] ${result.label}`);
    if (result.detail) console.log(`         ${result.detail}`);
  }

  const failed = results.filter((r) => r.level === 'FAIL').length;
  const warned = results.filter((r) => r.level === 'WARN').length;

  console.log(`\n結果: 失敗 ${failed} 件 / 注意 ${warned} 件 / 正常 ${results.length - failed - warned} 件`);
  if (failed > 0) {
    console.log('失敗が残っている状態では、従業員に連絡が届かない可能性があります。');
    process.exit(1);
  }
}

void main();
