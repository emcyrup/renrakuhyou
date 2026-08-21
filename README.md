# 連絡票（renrakuhyou）

従業員のスマートフォンへ連絡を送り、**開封・確認・電話連絡の状況を 1 画面で管理する**ための業務アプリです。

- 確認者は、連絡の作成・送信相手の選択・確認状況の把握を 1 画面で行えます。
- 従業員は、通知やメッセージで連絡を受け取り、「確認」ボタンを押すだけで応答できます。
- 24 時間確認がない場合、確認者にはポップアップで、従業員にはリマインドで自動的に通知されます。

配信手段: **アプリ通知（Web Push / PWA）** / **Google Chat**
従業員ごとに指定でき、混在も可能です。どれを選ぶべきかは [メッセージサービスの選定](docs/messaging-service-comparison.md) を参照してください。
（LINE WORKS / LINE 公式アカウントは送信の実装だけ残してあり、確認者画面の選択肢には出ません）

**外部サービスの契約がない場合は、アプリ通知（Web Push）を推奨します。** 費用は 0 円、人数上限も通数課金もなく、
従業員はアカウント作成もアプリのインストールも行いません（→ [設定手順](docs/setup-web-push.md)）。

## 画面と機能

### 1. 確認者向け（要ログイン）

| 画面 | 内容 |
| --- | --- |
| ダッシュボード `/` | 連絡一覧と確認状況、未対応の報告、本日の点呼。**未確認アラートのポップアップ**。 |
| 新規連絡 `/messages/new` | 件名・本文・レベルの入力と、部署単位での送信相手の選択。 |
| 連絡詳細 `/messages/[id]` | 宛先ごとの送信・開封・確認の時刻、**電話連絡の実施記録**、送信失敗の再送。 |
| 配車情報 `/dispatches` | その日の車番・区間・担当の登録。従業員の画面に表示されます。 |
| 報告 `/reports` | 従業員から届いた車両・道路・荷物の報告と、対応済みの記録。 |
| 点呼 `/attendance` | その日の出勤・退勤の記録と、まだ点呼していない従業員。 |
| 従業員 `/employees` | 送信相手の登録（氏名・部署・電話番号・サービス・送信先 ID）。 |
| 送信ログ `/logs` | 初回送信とリマインドの履歴、失敗理由。 |
| 設定 `/settings` | 会社名・今日のひとこと・AI への指示・天気の地域。 |

### 2. 従業員向け（ログイン不要）

| 画面 | 内容 |
| --- | --- |
| 確認画面 `/ack/[token]` | 連絡の内容と「確認しました」ボタン。 |
| **AI 受付** `/enroll/[token]` | 出勤・退勤の点呼、連絡の確認、報告、AI への質問。ホーム画面に追加するとアプリとして使えます。 |

受付画面は、左に大きな操作ボタン（**出勤する / 退勤する / 情報を確認する / 報告する / AI に質問する / 設定**）、
中央に選んだ操作の内容、右に**本日の配車情報・重要なお知らせ・みんなの報告**が並びます。
上部には会社名・挨拶・時計・天気が出ます（→ [AI 受付の設定](docs/ai-reception.md)）。

- **点呼** — 未確認の連絡を 1 件ずつ伝え、すべて確認してから出退勤を記録します（読み上げにも対応）。**誰にいつ何件伝えたかが残ります**
- **報告** — 車両・道路・荷物のことを会社へ報告し、仲間の画面にも共有できます
- **AI に質問する** — 会社の方針（設定画面で登録）にそって応対します。`ANTHROPIC_API_KEY` の設定が必要です
- **事故などの緊急時**は、キャラクターの表情と画面全体の色が変わります
- 画面を開いたままでも、**通知の受信時・30 秒ごと・「更新」**で内容が最新になります

通知・チャットに届いたボタン、または確認画面から「確認しました」を押すだけです。
**ID もパスワードもありません。**本人の識別は URL に含まれる推測困難なトークンで行い、他人の連絡は閲覧できません。

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
2. **従業員** — 通知やメッセージでリマインドを自動送信。`REMINDER_INTERVAL_HOURS`（既定 24 時間）おきに、`MAX_REMINDERS`（既定 3 回）まで。

リマインドの実行方法は 2 通りあります。

```bash
# 1. cron / Cloud Scheduler から叩く（推奨）
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders

# 2. 常駐ワーカーを動かす
npm run worker
```

サーバーへ設置する場合は、`deploy/` の systemd タイマーがこれを担います。

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

### インターネットに公開する

**→ [AI 受付の設定](docs/ai-reception.md)**（点呼・報告・配車・AI・天気の設定と費用）
**→ [AWS での構築手順](docs/setup-aws.md)**（Lightsail 東京で月 750 円程度。この 1 枚で完結します）
**→ [変更を本番へ反映する手順](docs/release.md)**（main へマージ → `deploy.sh` を 1 回実行）
**→ [インターネット公開の手順](docs/deployment.md)**（VPS 全般。費用ゼロの構成も記載）
**→ [AWS / GCP の比較](docs/deployment-cloud.md)**（どのサービスを選ぶかの判断材料）

設定ファイル（systemd / Caddy）は [`deploy/`](deploy/) に用意しています。

### 本番向けの設定

1. 配信手段に応じて設定手順に従い、`.env` に認証情報を設定。
   - [アプリ通知（Web Push）の設定手順](docs/setup-web-push.md) ← 推奨
   - [Google Chat の設定手順](docs/setup-google-chat.md)
   - [LINE WORKS / LINE の設定手順](docs/setup-line-works.md)
2. `APP_BASE_URL` を、従業員のスマートフォンから到達できる公開 URL に設定（確認画面のリンクに使われます）。
3. チャットサービスを使う場合は、Webhook URL（`/api/webhooks/<provider>`）を各サービス側に登録。
4. `npm run build && npm start` で起動し、`/api/cron/reminders` を定期実行するよう設定。

## 技術構成

- **Next.js 15（App Router）+ React 19 + TypeScript** — 画面・サーバー処理・Webhook を 1 つのアプリで完結
- **SQLite（better-sqlite3）** — 追加のデータベースサーバーが不要。バックアップはファイルのコピーのみ
- **Tailwind CSS**
- 認証は共有パスワード + HMAC 署名付き Cookie（12 時間有効）

また `public/sw.js` が通知の受信と、通知上の「確認しました」を処理します。

```
src/
├─ app/                       画面と API ルート
│  ├─ (admin)/                確認者向け（ログイン必須）
│  ├─ ack/[token]/            従業員向けの確認画面
│  ├─ enroll/[token]/         従業員の AI 受付画面
│  └─ api/
│     ├─ push/                通知の端末登録・確認・テスト送信
│     ├─ employee/[token]/    受付画面の再読み込み・点呼・報告・AI への質問
│     ├─ manifest/[token]/    従業員ごとの Web App Manifest
│     ├─ webhooks/[provider]/ チャットのボタン押下を受け取る
│     └─ cron/reminders/      リマインドの定期実行
├─ components/
│  ├─ employee/               受付画面（点呼・報告・AI・情報欄・キャラクター）
│  └─ ...                     ポップアップ、連絡作成フォーム、設定フォームなど
└─ lib/
   ├─ messaging/              サービスごとの送信・Webhook 実装
   ├─ delivery-service.ts     送信とリマインドの業務ロジック
   ├─ ai.ts                   AI の応対（Claude API）
   ├─ weather.ts              天気の取得（気象庁）
   ├─ employee-view.ts        受付画面に渡すデータ
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
| `BACKUP_KEEP_DAYS` | `14` | バックアップの保持日数 |
| `PORT` | `3000` | セルフチェックが確認するアプリのポート |
| `DEFAULT_PROVIDER` | `mock` | 従業員登録時の既定サービス（`web_push` / `google_chat` / `mock`） |
| `ANTHROPIC_API_KEY` | — | 「AI に質問する」で使う Claude API のキー（未設定なら AI 機能のみ無効） |
| `WEATHER_AREA_CODE` | `270000` | 天気（気象庁）の地域コード。確認者画面の「設定」が優先 |
| `TZ_DISPLAY` | `Asia/Tokyo` | 画面の時刻表示に使うタイムゾーン |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | アプリ通知に使う鍵（`npm run push:keys` で生成） |
| `VAPID_SUBJECT` | — | push サービスへの連絡先（`mailto:` の URL） |

サービスごとの認証情報は [.env.example](.env.example) を参照してください。
