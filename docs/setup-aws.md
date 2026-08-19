# AWS での構築手順（Lightsail）

AWS の仮想マシン上に連絡票を構築する手順です。**この 1 枚で最後まで進められます。**
所要時間は 30〜60 分、費用は月 750 円程度（Lightsail $5 プラン + ドメイン代）です。

構成は「仮想マシン 1 台に、アプリと HTTPS の受け口を同居させる」形です。
ロードバランサもデータベースサービスも使わないため、これ以上は安くなりません。

```
従業員のスマホ ──HTTPS──▶ Caddy :443 ──▶ 連絡票 :3000（127.0.0.1）
                          証明書を自動取得・更新   外部に直接公開しない
                                                      │
                                                      ▼
                                              data/renrakuhyou.sqlite
```

---

## 事前に用意するもの

- **AWS アカウント**
- **ドメイン**（例: `example.co.jp`）— サブドメインを 1 つ使います
  Web Push は HTTPS 必須で、証明書の取得にドメインが必要です。年 1,000〜2,000 円程度で取得できます

以降、`renrakuhyou.example.co.jp` は自分のドメインに読み替えてください。

### ドメインの選び方（無料ドメインについて）

**業務で使うなら独自ドメインを強く推奨します。** 理由は費用ではなく、あとから変更できないためです。

> **ドメインを変更すると、全従業員が通知設定をやり直すことになります。**
> Web Push の購読は「どのドメインで登録したか」に紐づくため、ドメインが変わると通知が届かなくなります。
> **「まず無料で始めて、あとで独自ドメインへ移す」は最も手戻りの大きい選択です。**
> 従業員に通知設定 URL を配る前に、本番で使うドメインを確定させてください。

使えるかどうかは次のとおりです。

| ドメイン | 可否 | 備考 |
| --- | --- | --- |
| **独自ドメイン**（年 1,000〜2,000 円） | **推奨** | 月あたり 100 円程度。変更の必要がなく、従業員から見ても信頼できる |
| DuckDNS（`xxx.duckdns.org`） | 技術的には可能 | 無料。Public Suffix List 登録済みで証明書も取得できるが、無保証のサービス |
| Freenom 系（`.tk` `.ml` `.ga` `.cf` `.gq`） | **不可** | 2023 年に新規登録停止、2024 年 2 月に事業撤退。既存ドメインも失効しています |
| AWS の標準ホスト名（`ec2-*.compute.amazonaws.com`） | **不可** | Let's Encrypt がポリシーで証明書の発行を拒否します。HTTPS にできません |
| `nip.io` / `sslip.io` | **非推奨** | 証明書の発行上限を全利用者で共有するため、取得に失敗しやすい |

DuckDNS で構築すること自体は問題なく動きますが、業務連絡に使う場合は次の点が残ります。

- サービス停止やアカウント失効が起きると、**アプリごと連絡が届かなくなります**（無保証・無料サービスのため）
- `xxx.duckdns.org` というリンクは、従業員から見て業務連絡として不審に映ります
- 一部のモバイル回線・社内ネットワークでは、ダイナミック DNS のドメインが遮断されることがあります

**検証や試用の期間だけ DuckDNS を使い、従業員へ展開する前に独自ドメインへ切り替える**のが現実的です。
その場合も、切り替えのタイミングは従業員に URL を配る前にしてください。

---

## 手順 1. Lightsail インスタンスを作る

[Lightsail のコンソール](https://lightsail.aws.amazon.com/)で「インスタンスの作成」を選びます。

| 項目 | 選ぶもの |
| --- | --- |
| リージョン | **東京（ap-northeast-1）** |
| プラットフォーム | Linux/Unix |
| 設計図 | **OS のみ** → **Ubuntu 24.04 LTS** |
| プラン | **$5 USD/月**（1GB メモリ / 2 vCPU / 40GB SSD / 2TB 転送） |
| インスタンス名 | `renrakuhyou` |

> **$3.50 の 512MB プランは選ばないでください。** ビルド時にメモリが足りません。

作成には 1〜2 分かかります。

## 手順 2. 静的 IP を割り当てる

「ネットワーキング」タブ →「静的 IP をアタッチする」→ 新しい静的 IP を作成し、`renrakuhyou` にアタッチします。

**インスタンスにアタッチしている限り追加料金はかかりません。**
（インスタンスから外したまま放置すると課金対象になるので、使わなくなったら削除してください）

表示された IP アドレスを控えます。以降 `<静的IP>` と書きます。

## 手順 3. ファイアウォールを開ける

インスタンスの「ネットワーキング」タブで、以下が許可されていることを確認します。
既定で SSH と HTTP は開いているので、**HTTPS を追加**してください。

| アプリケーション | プロトコル | ポート |
| --- | --- | --- |
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

> **OS 側の `ufw` は有効にしないでください。** Lightsail のファイアウォールと二重管理になり、締め出しの原因になります。

## 手順 4. DNS を設定する

ドメインの DNS に、A レコードを追加します。

```
renrakuhyou.example.co.jp.   A   <静的IP>
```

**証明書の取得に必要なので、次に進む前に反映を確認してください。**

```bash
# 手元の PC で実行。<静的IP> が返ってくれば OK
dig +short renrakuhyou.example.co.jp
```

反映には数分〜数十分かかることがあります。
Route 53 のホストゾーンは月 $0.50 かかるため、**ドメイン取得元の DNS をそのまま使えば 0 円**です。

---

## 実行するユーザーについて（重要）

`/opt/renrakuhyou` の中身は **`renrakuhyou` ユーザーの所有**です。ログイン用の `ubuntu` ユーザーのまま
`git` や `npm` を実行すると、次のようなエラーで**必ず失敗します**。

```
fatal: detected dubious ownership in repository at '/opt/renrakuhyou'
npm error EACCES: permission denied, rmdir '/opt/renrakuhyou/node_modules/.bin'
Failed to load env from .env [Error: EACCES: permission denied]
```

**アプリのファイルを扱うコマンドは、必ず次の形で実行してください。**

```bash
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && <コマンド>'
```

一方、`systemctl` や `/etc` 配下の操作は `sudo`（root）で行います。
`renrakuhyou` ユーザーは `sudo` を使えないため、**作業は `ubuntu` のシェルから行い、
アプリのファイルだけ `sudo -u renrakuhyou` を挟む**のが確実です。

迷ったら `whoami` で今のユーザーを確認してください。

---

## 手順 5. サーバーに接続して準備する

Lightsail コンソールの「SSH を使用して接続」（ブラウザから接続できます）でログインし、root になります。

```bash
sudo -i
```

### スワップを作る

1GB のプランではビルド時にメモリが不足するため、必ず作成してください。

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

free -h        # Swap が 2.0Gi と表示されれば OK
```

### Node.js とビルド用ツールを入れる

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs build-essential git

node -v        # v22.x であること
which node     # /usr/bin/node であること
```

`build-essential` は SQLite ドライバのビルドに必要です。

### アプリ用のユーザーを作る

```bash
adduser --disabled-password --gecos "" renrakuhyou
mkdir -p /opt/renrakuhyou
chown renrakuhyou:renrakuhyou /opt/renrakuhyou
```

## 手順 6. アプリを配置してビルドする

```bash
sudo -u renrakuhyou -H bash <<'SETUP'
set -euo pipefail
cd /opt/renrakuhyou
git clone https://github.com/emcyrup/renrakuhyou.git .
npm ci
npm run build
SETUP
```

ビルドに 2〜3 分かかります。`✓ Compiled successfully` と出れば成功です。

**次へ進む前に、取得できているか必ず確認してください。**

```bash
ls /opt/renrakuhyou/package.json /opt/renrakuhyou/node_modules/.bin/tsx
```

2 つとも表示されれば成功です。`No such file or directory` が出る場合は、[困ったときは](#困ったときは)の
「手順 7 の npm が失敗する」を参照してください。

> **リポジトリが非公開の場合**は `git clone` が失敗します。次のいずれかで対応してください。
> - GitHub でこのサーバー用の **デプロイキー**（読み取り専用）を登録し、SSH 形式の URL でクローンする
> - 手元の PC から `scp -r ./renrakuhyou ubuntu@<静的IP>:/tmp/` で転送し、`/opt/renrakuhyou` へ移動する

## 手順 7. 設定ファイルを作る

```bash
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && cp .env.example .env'

# 通知に使う鍵を生成する（出力の 3 行を控える）
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && npm run push:keys'

# パスワード類に使うランダム値を 2 つ作る
openssl rand -base64 32
openssl rand -base64 32
```

次のコマンドで `.env` を開き、項目を設定します。

```bash
sudo -u renrakuhyou nano /opt/renrakuhyou/.env
```

```env
# 確認者がログインに使うパスワード
ADMIN_PASSWORD=<決めたパスワード>
# 上で生成したランダム値をそれぞれ貼る
SESSION_SECRET=<openssl rand -base64 32 の出力 1 つ目>
CRON_SECRET=<openssl rand -base64 32 の出力 2 つ目>

# 公開する URL（末尾のスラッシュは付けない）
APP_BASE_URL=https://renrakuhyou.example.co.jp

DATABASE_FILE=/opt/renrakuhyou/data/renrakuhyou.sqlite
DEFAULT_PROVIDER=web_push

# npm run push:keys の出力を貼る
VAPID_PUBLIC_KEY=<公開鍵>
VAPID_PRIVATE_KEY=<秘密鍵>
VAPID_SUBJECT=mailto:admin@example.co.jp
```

保存したら権限を絞ります。

```bash
sudo chmod 600 /opt/renrakuhyou/.env
```

> **VAPID 鍵は絶対に変更しないでください。** 変更すると登録済みの端末すべてに通知が届かなくなり、
> 全従業員に設定をやり直してもらうことになります。バックアップ対象に必ず含めてください。

## 手順 8. サービスとして常駐させる

```bash
cd /opt/renrakuhyou

cp deploy/renrakuhyou.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now renrakuhyou

# 確認: active (running) と表示されること
systemctl status renrakuhyou --no-pager

# 確認: 200 が返ること
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

`200` が返らない場合は `journalctl -u renrakuhyou -n 50 --no-pager` でエラーを確認してください。

### リマインドとバックアップの定期実行

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

# 確認: 次回実行時刻が表示されること
systemctl list-timers 'renrakuhyou*' --no-pager
```

## 手順 9. HTTPS で公開する

Caddy を入れると、**証明書の取得と更新が自動**になります。更新作業は今後一切発生しません。

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

設定を配置し、**ドメイン名を自分のものに書き換えます。**

```bash
cp /opt/renrakuhyou/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile     # 1 行目の renrakuhyou.example.co.jp を書き換える

# 注意: サイト名は「完全なホスト名」で書くこと。
#   正: renrakuhyou999999.duckdns.org {
#   誤: renrakuhyou999999 {          ← ドメイン部分が抜けると到達できない
# APP_BASE_URL のホスト名と一字一句そろえてください。

caddy validate --config /etc/caddy/Caddyfile   # Valid configuration と出ること
systemctl restart caddy
systemctl status caddy --no-pager              # active (running) であること
```

> `caddy validate` は文法しか検査しません。**文法が正しくても起動に失敗することがある**ため、
> 必ず `systemctl status caddy` で `active (running)` を確認してください。

数十秒で証明書が取得されます。ブラウザで `https://renrakuhyou.example.co.jp` を開き、
鍵アイコンとログイン画面が表示されれば公開完了です。

取得に失敗する場合は、**DNS が反映されているか**と**ポート 80 が開いているか**を確認してください。

```bash
journalctl -u caddy -n 50 --no-pager
```

## 手順 10. 自己診断する

構築が正しく終わっているかを、まとめて確認できます。

```bash
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && npm run healthcheck'
```

```
[ OK ] ADMIN_PASSWORD が設定されている
[ OK ] APP_BASE_URL = https://renrakuhyou.example.co.jp
[ OK ] VAPID 公開鍵の形式が正しい
[ OK ] データベースに接続できる
[ OK ] /etc/renrakuhyou-cron.env の CRON_SECRET が一致している
[ OK ] アプリが応答している
[ OK ] リマインドの定期実行が通る
[ OK ] HTTPS で外部から到達できる

結果: 失敗 0 件 / 注意 1 件 / 正常 12 件
```

**「失敗」が 0 件になるまで進めてください。** 失敗が残っている状態では、従業員に連絡が届かない可能性があります。

> `/etc/renrakuhyou-cron.env` は root 専用のため、上のコマンドでは「注意」と表示されます。
> ここまで含めて照合したい場合は、root のまま次を実行してください。
>
> ```bash
> cd /opt/renrakuhyou && npm run healthcheck
> ```

---

## 手順 11. 使いはじめる

1. `https://renrakuhyou.example.co.jp` を開き、`ADMIN_PASSWORD` でログイン（確認者名は各自が入力します）
2. **「従業員」画面**で登録します
   - サービス: **アプリ通知（Web Push）**
   - 送信先 ID: **空欄でよい**（自動採番されます）
   - 電話番号: レベル高の連絡で使うので入れておきます
3. 各従業員の「通知設定URL」をコピーし、本人に渡します
   **QR コードにして掲示・配布するのが最も確実です**
4. 従業員に設定してもらいます → [アプリ通知の設定手順](./setup-web-push.md)
   - iPhone は **Safari で開き「ホーム画面に追加」が必須**です（画面に手順が出ます）
   - 設定後、本人に「テスト通知を送る」を押してもらい、届くことを確認します
5. ダッシュボードの「通知設定が未完了」の警告が消えたら、全員に届く状態です

---

## 手順 12. バックアップと請求アラート

### 自動スナップショット（サーバーごと戻せるように）

Lightsail の「スナップショット」タブ →「自動スナップショットを有効化」。
毎日ディスク全体が保存され、40GB で月 $2 程度です。

アプリ側の日次バックアップ（手順 8 で設定済み、`/opt/renrakuhyou/backups/` に 14 日分）と併用すると、
**「ファイル単位で戻す」「サーバーごと戻す」の両方**ができます。

### 別の場所へ退避する（推奨）

保存量がごく小さいため、S3 の費用はほぼ発生しません。

```bash
apt-get install -y awscli
# インスタンスに IAM ロールを割り当てるか、aws configure で認証情報を設定する

cat >> /etc/crontab <<'EOF'
0 4 * * * renrakuhyou aws s3 sync /opt/renrakuhyou/backups s3://<バケット名>/renrakuhyou/
EOF
```

**`.env`（特に VAPID 鍵）も一緒に保管してください。** DB だけ戻しても、鍵が違うと通知が届きません。

### 請求アラート

**構築したその日に設定してください。**
AWS コンソール → Billing →「予算」→ 予算を作成 → コスト予算で **月 $10** を設定し、80% 超過でメール通知。

---

## 運用

### 更新する

**→ 通常はこちらを使ってください: [変更を本番へ反映する手順](./release.md)**

```bash
sudo /opt/renrakuhyou/deploy/deploy.sh
```

バックアップ・ビルド・入れ替え・動作確認までを 1 コマンドで行い、失敗時は自動で切り戻します。

以下は手作業で行う場合の手順です。**`ubuntu` のシェルから**実行してください
（`renrakuhyou` のシェルに入っている場合は `exit` してから）。

```bash
sudo -u renrakuhyou -H bash <<'UPDATE'
set -euo pipefail
cd /opt/renrakuhyou
npm run backup
git pull
npm ci
npm run build
UPDATE

sudo systemctl restart renrakuhyou
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && npm run healthcheck'
```

データベースの構造が変わっていても、起動時に自動で追従します。

### 復元する

```bash
systemctl stop renrakuhyou
sudo -u renrakuhyou cp /opt/renrakuhyou/backups/renrakuhyou-20260819-0330.sqlite \
                       /opt/renrakuhyou/data/renrakuhyou.sqlite
systemctl start renrakuhyou
```

### ログを見る

```bash
journalctl -u renrakuhyou -f                 # アプリ
journalctl -u renrakuhyou-reminders -n 50    # リマインド
journalctl -u caddy -n 50                    # HTTPS
```

送信の失敗理由は、アプリの「送信ログ」画面でも確認できます。

### OS を更新する

```bash
apt-get update && apt-get upgrade -y
reboot
```

再起動後はすべて自動で復帰します。

---

## 困ったときは

| 症状 | 確認すること |
| --- | --- |
| ブラウザで開けない | まず `npm run healthcheck` を実行。`/etc/caddy/Caddyfile` の 1 行目が**完全なホスト名**か（`renrakuhyou999999` のようにドメイン部分が抜けていないか）/ `systemctl status caddy renrakuhyou` / Lightsail のファイアウォールで 443 が開いているか |
| 証明書が取得できない | `dig +short <ドメイン>` が静的 IP を返すか / ポート 80 が開いているか / `journalctl -u caddy` |
| **`Job for caddy.service failed.`** | 下の「Caddy が起動しない」を参照 |
| **`dubious ownership` / `EACCES`** | `ubuntu` のまま実行しています。上の「実行するユーザーについて」を参照し、`sudo -u renrakuhyou -H bash -c '...'` で実行してください |
| ログインできない | `.env` の `ADMIN_PASSWORD` を確認。変更したら `systemctl restart renrakuhyou` |
| 通知が届かない | 従業員側が iPhone なら「ホーム画面に追加」を済ませているか / 「送信ログ」画面のエラー |
| リマインドが動かない | `journalctl -u renrakuhyou-reminders` / `/etc/renrakuhyou-cron.env` の値が `.env` と一致しているか |
| ビルドが途中で止まる | スワップが有効か（`free -h`）。手順 5 のスワップ作成を実行したか |
| **手順 7 の npm が失敗する** | 下の「手順 7 の npm が失敗する」を参照 |

### Caddy が起動しない

`Job for caddy.service failed.` は **`caddy validate` ではなく `systemctl restart`（または `reload`）が出すメッセージ**です。
`caddy validate` は文法しか検査しないため、**文法が正しくても起動に失敗することがあります。**

まず実際のエラーを確認します。

```bash
journalctl -xeu caddy.service -n 30 --no-pager
```

| ログに出ている内容 | 原因と対処 |
| --- | --- |
| `opening log writer ... permission denied` | ログの出力先に書き込めません。`/etc/caddy/Caddyfile` に `log { ... }` ブロックがあれば削除してください（ログは journald に出るため `journalctl -u caddy` で確認できます）。ファイルに残したい場合は `mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy` |
| `address already in use` | 80 番か 443 番を別のプロセスが使っています。`ss -lntp` で確認して停止してください |
| `Unit caddy.service is not active` | まだ起動していません。`systemctl start caddy` を実行してください |
| `unrecognized directive` など | Caddyfile の記述誤りです。`caddy validate --config /etc/caddy/Caddyfile` の出力を確認してください |

対処後に再確認します。

```bash
systemctl restart caddy
systemctl status caddy --no-pager     # active (running) であること
```

> **証明書が取得できないことが原因で、このエラーになることはありません。**
> Caddy は起動したまま裏で取得を再試行し、失敗の内容は `journalctl -u caddy` に記録されます。
> DNS の未反映やポート 80 の閉塞は、このエラーの原因ではありません。

### 手順 7 の npm が失敗する

`npm error Missing script: "push:keys"` や `Could not read package.json` が出る場合、
**手順 6 でアプリのコードを取得できていません。**

まず状態を確認します。

```bash
ls /opt/renrakuhyou
```

`README.md` しか無い場合は、次のコマンドで復旧できます。**最初からやり直す必要はありません。**

**`ubuntu` のシェルから**実行してください（`renrakuhyou` のシェルに入っている場合は `exit` してから）。

```bash
sudo -u renrakuhyou -H bash <<'FIX'
set -euo pipefail
cd /opt/renrakuhyou
git pull
npm ci
npm run build
ls package.json node_modules/.bin/tsx
FIX
```

最後に `package.json` と `node_modules/.bin/tsx` の 2 つが表示されれば成功です。
そのうえで、手順 7 の `cp .env.example .env` からやり直してください。

ディレクトリが空の場合は、手順 6 の `git clone` からやり直してください。

まず `npm run healthcheck` を実行してください。多くの原因はこれで特定できます。

---

## 付録: Lightsail ではなく EC2 を使う場合

社内の VPC に入れる必要があるなど、EC2 が必要な場合の差分です。**手順 5 以降は同じ**です。

- **インスタンスタイプ**: `t4g.small`（ARM・2GB）を推奨します。`t4g.micro`（1GB）でも動きますが、スワップが必須です
  - ARM を選んだ場合も手順は変わりません（Node.js・SQLite ドライバとも ARM に対応しています）
- **AMI**: Ubuntu Server 24.04 LTS（アーキテクチャを arm64 に合わせてください）
- **Elastic IP**: 割り当てます。**EC2 では実行中のインスタンスに付けていても課金対象**で、月約 550 円かかります
- **セキュリティグループ**: インバウンドで 22 / 80 / 443 を許可します
- **ストレージ**: gp3 で 20〜30GB あれば十分です
- **バックアップ**: Data Lifecycle Manager で EBS スナップショットを日次取得するよう設定します

料金は月 1,200 円程度からで、Lightsail より高くなります。**VPC 統合の要件がなければ Lightsail を推奨します。**
