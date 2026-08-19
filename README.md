# 連絡票（renrakuhyou）

従業員へメッセージアプリ経由で連絡を送り、**開封・確認・電話連絡の状況を 1 画面で管理する**ための業務アプリです。

- 確認者は、連絡の作成・送信相手の選択・確認状況の把握を 1 画面で行えます。
- 従業員は、使い慣れたメッセージアプリで連絡を受け取り、「確認」ボタンを押すだけで応答できます。
- 24 時間確認がない場合、確認者にはポップアップで、従業員にはリマインドで自動的に通知されます。

対応サービス: **Google Chat** / **LINE WORKS** / **LINE 公式アカウント**（`.env` で切り替え）
どれを選ぶべきかは [メッセージサービスの選定](docs/messaging-service-comparison.md) を参照してください。

## 画面と機能

### 1. 確認者向け（要ログイン）

| 画面 | 内容 |
| --- | --- |
| ダッシュボード `/` | 連絡一覧と確認状況。**未確認アラートのポップアップ**。 |
| 新規連絡 `/messages/new` | 件名・本文・レベルの入力と、部署単位での送信相手の選択。 |
| 連絡詳細 `/messages/[id]` | 宛先ごとの送信・開封・確認の時刻、**電話連絡の実施記録**、送信失敗の再送。 |
| 従業員 `/employees` | 送信相手の登録（氏名・部署・電話番号・サービス・送信先 ID）。 |
| 送信ログ `/logs` | 初回送信とリマインドの履歴、失敗理由。 |

### 2. 従業員向け（ログイン不要）

メッセージアプリに届いたボタン、または確認画面 `/ack/[token]` から「確認しました」を押すだけです。
トークンは配信ごとに発行される推測困難な値で、他人の連絡は閲覧できません。

## 連絡のレベル

| レベル | 完了条件 |
| --- | --- |
| 通常 | 従業員が「確認」を押す |
| **高** | 従業員が「確認」を押す **かつ** 確認者が電話連絡を記録する |

レベル高の連絡では、従業員側のメッセージにも「担当者から電話でも連絡します」という案内が入ります。
電話連絡の記録には、実施者（ログイン中の確認者名）・日時・メモが残ります。

## 未確認の検知

送信から `OVERDUE_HOURS`（既定 24 時間）を過ぎても確認がない配信は、次の 2 つの経路で扱われます。

1. **確認者** — ダッシュボードを開いた時点でポップアップ表示（対象の連絡と従業員の一覧、電話連絡が未実施の宛先も併記）。
2. **従業員** — メッセージアプリへリマインドを自動送信。`REMINDER_INTERVAL_HOURS`（既定 24 時間）おきに、`MAX_REMINDERS`（既定 3 回）まで。

リマインドの実行方法は 2 通りあります。

```bash
# 1. cron / Cloud Scheduler から叩く（推奨）
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders

# 2. 常駐ワーカーを動かす
npm run worker
```

## セットアップ

```bash
npm install
cp .env.example .env     # ADMIN_PASSWORD / SESSION_SECRET / CRON_SECRET を必ず変更する
npm run db:seed          # 動作確認用のサンプルデータ（任意）
npm run dev
```

`http://localhost:3000` を開き、`.env` に設定した `ADMIN_PASSWORD` でログインします。
確認者名は各自が入力し、電話連絡の実施記録に残ります。

### 外部サービスなしで試す

`DEFAULT_PROVIDER=mock` のままなら外部送信は行われず、送信内容は「送信ログ」に記録されます。
連絡詳細画面の「確認画面を開く（モック用）」から、従業員側の動作をそのまま再現できます。

### 本番向けの設定

1. [Google Chat の設定手順](docs/setup-google-chat.md) または [LINE WORKS / LINE の設定手順](docs/setup-line-works.md) に従って認証情報を `.env` に設定。
2. `APP_BASE_URL` を、従業員のスマートフォンから到達できる公開 URL に設定（確認画面のリンクに使われます）。
3. Webhook URL（`/api/webhooks/<provider>`）を各サービス側に登録。
4. `npm run build && npm start` で起動し、`/api/cron/reminders` を定期実行するよう設定。

## 技術構成

- **Next.js 15（App Router）+ React 19 + TypeScript** — 画面・サーバー処理・Webhook を 1 つのアプリで完結
- **SQLite（better-sqlite3）** — 追加のデータベースサーバーが不要。バックアップはファイルのコピーのみ
- **Tailwind CSS**
- 認証は共有パスワード + HMAC 署名付き Cookie（12 時間有効）

```
src/
├─ app/                       画面と API ルート
│  ├─ (admin)/                確認者向け（ログイン必須）
│  ├─ ack/[token]/            従業員向けの確認画面
│  └─ api/
│     ├─ webhooks/[provider]/ チャットのボタン押下を受け取る
│     └─ cron/reminders/      リマインドの定期実行
├─ components/                ポップアップ、連絡作成フォームなど
└─ lib/
   ├─ messaging/              サービスごとの送信・Webhook 実装
   ├─ delivery-service.ts     送信とリマインドの業務ロジック
   ├─ repo.ts                 データアクセス
   └─ schema.sql              テーブル定義
```

### メッセージサービスの追加

`src/lib/messaging/types.ts` の `MessagingProvider` を実装し、`src/lib/messaging/index.ts` に登録するだけで新しいサービスに対応できます。
確認手段は Web の確認画面が共通で用意されるため、対話ボタンに対応していないサービスでも動作します。

## 設定項目

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | — | 確認者ログインのパスワード（必須） |
| `SESSION_SECRET` | — | セッション Cookie の署名鍵（必須） |
| `APP_BASE_URL` | `http://localhost:3000` | 確認画面の URL の起点 |
| `DATABASE_FILE` | `./data/renrakuhyou.sqlite` | SQLite の保存先 |
| `OVERDUE_HOURS` | `24` | 未確認とみなすまでの時間 |
| `REMINDER_INTERVAL_HOURS` | `24` | リマインドの再送間隔 |
| `MAX_REMINDERS` | `3` | リマインドの上限回数 |
| `CRON_SECRET` | — | `/api/cron/reminders` の認証トークン |
| `DEFAULT_PROVIDER` | `mock` | 従業員登録時の既定サービス |

サービスごとの認証情報は [.env.example](.env.example) を参照してください。
