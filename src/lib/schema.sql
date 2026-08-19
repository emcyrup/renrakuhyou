-- 連絡票（renrakuhyou）スキーマ
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 従業員
CREATE TABLE IF NOT EXISTS employees (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  department       TEXT    NOT NULL DEFAULT '',
  phone            TEXT    NOT NULL DEFAULT '',        -- レベル高の電話連絡先
  provider         TEXT    NOT NULL,                   -- google_chat | line_works | line | mock
  provider_user_id TEXT    NOT NULL,                   -- 例: Google Chat の users/xxx またはメール
  provider_space_id TEXT   NOT NULL DEFAULT '',        -- Google Chat の DM スペース（解決後にキャッシュ）
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_user_id)
);

-- 連絡（1 件の連絡内容）
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  level       TEXT    NOT NULL DEFAULT 'normal',       -- normal | high（高＝開封＋電話連絡が必要）
  status      TEXT    NOT NULL DEFAULT 'draft',        -- draft | sent
  created_by  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  sent_at     TEXT,
  CHECK (level IN ('normal', 'high')),
  CHECK (status IN ('draft', 'sent'))
);

-- 配信（連絡 × 送信相手）
CREATE TABLE IF NOT EXISTS deliveries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id          INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ack_token           TEXT    NOT NULL UNIQUE,         -- 従業員向け確認 URL のトークン
  provider            TEXT    NOT NULL,
  provider_message_id TEXT,
  send_error          TEXT,
  sent_at             TEXT,                            -- メッセージ送信完了
  opened_at           TEXT,                            -- 開封（確認画面を開いた / チャットで操作した）
  acknowledged_at     TEXT,                            -- 従業員の「確認」アクション
  phone_called_at     TEXT,                            -- レベル高: 電話連絡を実施した日時
  phone_called_by     TEXT,                            -- 電話連絡を実施した確認者
  phone_call_note     TEXT,
  reminder_count      INTEGER NOT NULL DEFAULT 0,
  last_reminder_at    TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (message_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_pending ON deliveries(acknowledged_at, sent_at);

-- 送信ログ（監査・モックプロバイダの出力先）
CREATE TABLE IF NOT EXISTS outbound_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER REFERENCES deliveries(id) ON DELETE CASCADE,
  provider    TEXT    NOT NULL,
  kind        TEXT    NOT NULL,                        -- initial | reminder
  payload     TEXT    NOT NULL,
  ok          INTEGER NOT NULL DEFAULT 1,
  detail      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_logs_delivery ON outbound_logs(delivery_id);
