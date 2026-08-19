# インターネット公開の手順

従業員のスマートフォンから使えるように、インターネット上へ公開する手順です。
**Web Push は HTTPS でのみ動作する**ため、独自ドメインと HTTPS 証明書が必要になります（証明書は無料・自動更新）。

## かかる費用

| 項目 | 費用 | 備考 |
| --- | --- | --- |
| VPS（1GB メモリ） | **月 540〜900 円** | シン VPS 540 円 / さくらの VPS 石狩 880 円 など |
| 独自ドメイン | **年 1,000〜2,000 円**（月 100 円程度） | `.com` など |
| HTTPS 証明書 | **0 円** | Let's Encrypt（Caddy が自動取得・自動更新） |
| Web Push | **0 円** | 通数課金なし、人数上限なし |
| **合計** | **月 700〜1,000 円程度** | 従業員が何人に増えても変わりません |

サーバー代も 0 円にしたい場合は、[費用ゼロの構成](#費用ゼロの構成)を参照してください。

> **AWS / GCP で構築する場合** → [AWS / GCP での構築手順](./deployment-cloud.md)
> マシンの作り方とファイアウォールの設定だけが異なり、それ以降はこの手順書をそのまま使います。

## 構成

```
   従業員のスマホ
        │ HTTPS
        ▼
  ┌───────────────────────────────────┐
  │ VPS（Ubuntu 24.04）               │
  │                                   │
  │  Caddy :443 ──▶ 連絡票 :3000      │  Caddy が証明書を自動取得・更新
  │   (HTTPS)        (127.0.0.1)      │  アプリは外部に直接公開しない
  │                     │             │
  │                     ▼             │
  │              data/*.sqlite        │  DB はファイル 1 つ
  │                                   │
  │  systemd timer ──▶ リマインド送信 │  15 分おき
  │  systemd timer ──▶ バックアップ   │  毎日 3:30
  └───────────────────────────────────┘
```

データベースは SQLite のファイル 1 つなので、**データベースサーバーの契約は不要**です。バックアップもファイルのコピーで完了します。

---

## 手順（VPS）

Ubuntu 24.04 LTS を前提とします。`renrakuhyou.example.co.jp` は自分のドメインに読み替えてください。

### 1. ドメインを用意する

ドメインを取得し、**A レコードを VPS の IP アドレスに向けます。**

```
renrakuhyou.example.co.jp.   A   203.0.113.10
```

反映を確認します（VPS の IP が返ってくれば OK）。

```bash
dig +short renrakuhyou.example.co.jp
```

> この DNS 設定が済んでいないと、次の手順で証明書の取得に失敗します。**先に済ませてください。**

### 2. VPS の初期設定

```bash
# 作業用ユーザーを作る（root で直接動かさない）
adduser --disabled-password --gecos "" renrakuhyou

# ファイアウォール
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

> **AWS Lightsail / GCP の場合は `ufw` を実行しないでください。**
> クラウド側のファイアウォールで制御するため、二重管理になり締め出しの原因になります。

**メモリ 1GB のプランではビルド時にメモリが不足することがあるため、スワップを作成しておきます。**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3. Node.js をインストール

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs build-essential git

node -v        # v22.x であること
which node     # /usr/bin/node であること（違う場合は手順 6 のパスを直す）
```

`build-essential` は better-sqlite3 のビルドに必要です。

### 4. アプリを配置してビルド

```bash
mkdir -p /opt/renrakuhyou
chown renrakuhyou:renrakuhyou /opt/renrakuhyou

sudo -u renrakuhyou -H bash <<'SETUP'
set -euo pipefail
cd /opt/renrakuhyou
git clone https://github.com/emcyrup/renrakuhyou.git .
npm ci
npm run build
SETUP
```

**次へ進む前に確認します。** 2 つとも表示されれば成功です。

```bash
ls /opt/renrakuhyou/package.json /opt/renrakuhyou/node_modules/.bin/tsx
```

### 5. 設定ファイルを作る

```bash
sudo -u renrakuhyou -H bash
cd /opt/renrakuhyou
cp .env.example .env

# 通知に使う鍵を生成する（出力を控えておく）
npm run push:keys
```

`.env` を編集します。

```env
# 必ず変更する（推測できない値にする）
ADMIN_PASSWORD=<確認者が使うパスワード>
SESSION_SECRET=<openssl rand -base64 32 の出力>
CRON_SECRET=<openssl rand -base64 32 の出力>

# 公開する URL（末尾のスラッシュは不要）
APP_BASE_URL=https://renrakuhyou.example.co.jp

DATABASE_FILE=/opt/renrakuhyou/data/renrakuhyou.sqlite
DEFAULT_PROVIDER=web_push

# npm run push:keys の出力を貼り付ける
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.co.jp
```

ランダムな値は次のコマンドで作れます。

```bash
openssl rand -base64 32
```

`.env` は他人に読まれないようにします。

```bash
chmod 600 /opt/renrakuhyou/.env
```

> **VAPID 鍵は変更しないでください。** 変更すると登録済みの端末すべてに通知が届かなくなり、全員に設定をやり直してもらうことになります。バックアップ対象に含めてください。

### 6. サービスとして登録する

`exit` で root に戻ってから実行します。

```bash
cd /opt/renrakuhyou

# アプリ本体
cp deploy/renrakuhyou.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now renrakuhyou

# 起動を確認（active (running) になっていること）
systemctl status renrakuhyou --no-pager
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # 200 が返れば OK
```

続いて、リマインドとバックアップの定期実行を登録します。

```bash
# リマインド用に CRON_SECRET だけを書いたファイルを作る
echo "CRON_SECRET=$(grep '^CRON_SECRET=' /opt/renrakuhyou/.env | cut -d= -f2-)" > /etc/renrakuhyou-cron.env
chmod 600 /etc/renrakuhyou-cron.env

cp deploy/renrakuhyou-reminders.service /etc/systemd/system/
cp deploy/renrakuhyou-reminders.timer   /etc/systemd/system/
cp deploy/renrakuhyou-backup.service    /etc/systemd/system/
cp deploy/renrakuhyou-backup.timer      /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now renrakuhyou-reminders.timer renrakuhyou-backup.timer

# 次回実行時刻を確認
systemctl list-timers 'renrakuhyou*' --no-pager
```

動作確認します。

```bash
systemctl start renrakuhyou-reminders.service
journalctl -u renrakuhyou-reminders.service -n 20 --no-pager   # 対象 0 件でも成功すれば OK
```

### 7. HTTPS で公開する

Caddy を入れると、**証明書の取得と更新が自動になります**（設定も更新作業も不要）。

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

設定を配置します。**ドメイン名を自分のものに書き換えてください。**

```bash
cp /opt/renrakuhyou/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile          # renrakuhyou.example.co.jp を書き換える

caddy validate --config /etc/caddy/Caddyfile   # Valid configuration と出ること
systemctl reload caddy
```

数十秒で証明書が取得されます。ブラウザで `https://renrakuhyou.example.co.jp` を開き、鍵アイコンが出れば完了です。

うまくいかない場合はログを確認します。

```bash
journalctl -u caddy -n 50 --no-pager
```

### 8. 初期設定

1. `https://renrakuhyou.example.co.jp` を開き、`ADMIN_PASSWORD` でログイン
2. 「従業員」画面で、サービスに **アプリ通知（Web Push）** を選んで従業員を登録（送信先 ID は空欄でよい）
3. 各従業員の「通知設定URL」をコピーし、本人に渡す（QR コードにして掲示するのが確実です）
4. 従業員に設定してもらう → [アプリ通知の設定手順](./setup-web-push.md)
5. ダッシュボードの「通知設定が未完了」の警告が消えたら、全員に届く状態です

---

## 費用ゼロの構成

### Oracle Cloud Always Free

無期限で無料の仮想マシンが使えます。手順は VPS とまったく同じです。

- **注意点**: 東京・大阪リージョンの ARM（Ampere A1）は在庫の取り合いで、作成に失敗することがあります。時間帯を変えて再試行するか、AMD の小さいインスタンス（1/8 OCPU・1GB）を選ぶと比較的取得しやすいです。
- 無料枠は 2026 年に縮小されており（ARM は 2 コア・12GB まで）、今後も変更される可能性があります。

### 自宅の PC / Raspberry Pi + Cloudflare Tunnel

サーバー代は電気代のみです。**固定 IP もポート開放も不要**で、Cloudflare Tunnel が HTTPS を提供します。

```bash
# Cloudflare にドメインを登録したうえで
cloudflared tunnel create renrakuhyou
cloudflared tunnel route dns renrakuhyou renrakuhyou.example.co.jp
cloudflared tunnel run --url http://127.0.0.1:3000 renrakuhyou
```

この構成では Caddy は不要です（Cloudflare 側で HTTPS が終端されます）。
アプリは systemd で常駐させ、`cloudflared` もサービスとして登録してください。

- 自宅の回線・電源が止まると連絡が送れなくなるため、**重要度の高い連絡を扱うなら VPS を推奨します。**

---

## 運用

### バックアップ

毎日 3:30 に `/opt/renrakuhyou/backups/` へ自動保存され、14 日分が保持されます（稼働中でも安全に取得できます）。

```bash
# 手動で取得
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && npm run backup'

# 保持日数を変える場合は .env に追記
# BACKUP_KEEP_DAYS=30
```

**サーバーが壊れた場合に備え、別の場所へも定期的にコピーしてください。**

```bash
# 手元の PC から取得する例
scp -r renrakuhyou@203.0.113.10:/opt/renrakuhyou/backups ./
```

`.env`（特に VAPID 鍵）も忘れずに保管してください。DB だけ戻しても、鍵が違うと通知が届きません。

### 復元

```bash
systemctl stop renrakuhyou
sudo -u renrakuhyou cp /opt/renrakuhyou/backups/renrakuhyou-20260819-0330.sqlite \
                       /opt/renrakuhyou/data/renrakuhyou.sqlite
systemctl start renrakuhyou
```

### 更新

```bash
sudo -u renrakuhyou -H bash <<'UPDATE'
cd /opt/renrakuhyou
npm run backup
git pull
npm ci
npm run build
UPDATE

systemctl restart renrakuhyou
```

データベースの構造が変わっていても、起動時に自動で追従します。

### ログの確認

```bash
journalctl -u renrakuhyou -f                    # アプリ
journalctl -u renrakuhyou-reminders -n 50       # リマインド
journalctl -u caddy -n 50                       # HTTPS
```

送信の失敗理由は、アプリの「送信ログ」画面でも確認できます。

### OS の更新

```bash
apt-get update && apt-get upgrade -y
reboot
```

再起動後はすべてのサービスが自動で復帰します（`systemctl enable` 済みのため）。

---

## セキュリティの要点

- **アプリは 127.0.0.1 にのみ待ち受け**、外部からは Caddy 経由でしか到達できません
- **HSTS を有効化**しているため、以後のアクセスは常に HTTPS になります
- **`.env` と `/etc/renrakuhyou-cron.env` は `chmod 600`** にし、リポジトリには含めないでください（`.gitignore` 済み）
- **従業員の URL は本人であることの証明そのもの**です。他人に渡ると連絡内容を読まれるため、共有しないよう周知してください
- 確認者のパスワードは全員共通です。**退職者が出た場合は `ADMIN_PASSWORD` を変更**し、`systemctl restart renrakuhyou` してください
- 従業員が退職した場合は、従業員画面で「有効」のチェックを外す（または削除する）と、以後の連絡対象から外れます
