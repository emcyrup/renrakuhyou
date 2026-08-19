# AWS / GCP での構築手順

GCP・AWS で構築する場合の推奨構成と手順です。
基本の作りは [インターネット公開の手順](./deployment.md) と同じ（仮想マシン 1 台 + Caddy で HTTPS）で、
違うのは**マシンの作り方・ファイアウォール・バックアップの置き場所**だけです。

## 結論：AWS Lightsail（東京）を推奨します

| 構成 | 月額 | 評価 |
| --- | --- | --- |
| **AWS Lightsail（東京）$5 プラン** | **約 750 円** | **推奨。**固定料金・東京・静的 IP 無料・転送 2TB 込み |
| GCP Compute Engine e2-micro（東京） | 約 1,300〜1,500 円 | GCP に統一したい場合はこれ |
| GCP e2-micro（米国・Always Free） | **約 440 円** | 最安。ただし米国リージョンで通信が遅い |
| AWS EC2 t4g.micro（東京） | 約 1,200 円〜 | Lightsail より高く、構成も複雑 |

**Lightsail を推奨する理由**は、この用途で効いてくる点が揃っているためです。

- **料金が固定** — 従量課金の読みにくさがありません。社内システムでは請求が跳ねないことが重要です
- **静的 IP が無料** — インスタンスに割り当てている限り追加料金なし（GCP は外部 IP だけで月 440 円かかります）
- **東京リージョンがある** — 従業員のスマートフォンからの応答が速くなります
- **転送量 2TB 込み** — このアプリの通信量では超えません
- **手順が VPS とほぼ同じ** — 既存の手順書がそのまま使えます

## サーバーレス（Cloud Run / App Runner）を使わない理由

**このアプリはデータベースに SQLite のファイルを使うため、サーバーレスとは相性が悪いです。**

- Cloud Run / App Runner には**永続ディスクがありません。**コンテナが再起動するとデータが消えます
- 複数インスタンスに分散すると、**同じ SQLite ファイルを複数から書き込んで壊れます**
- 代わりに Cloud SQL / RDS を使うと、**最小構成でも月 1,500〜4,000 円**かかり、VM より高くつきます

将来アクセスが増えてサーバーレス化したくなった場合は、PostgreSQL への移行が前提になります。
**従業員数百名規模までは VM 1 台で十分**なので、現時点では VM を推奨します。

---

## AWS Lightsail の手順

> **AWS で構築すると決めている場合は、[AWS での構築手順](./setup-aws.md) を参照してください。**
> 手順書 1 枚で最後まで進められる形にまとめてあります。以下は概要です。

### 1. インスタンスを作る

Lightsail のコンソールで「インスタンスの作成」を選びます。

| 項目 | 選ぶもの |
| --- | --- |
| リージョン | **東京（ap-northeast-1）** |
| プラットフォーム | Linux/Unix |
| 設計図 | **OS のみ → Ubuntu 24.04 LTS** |
| プラン | **$5/月**（1GB メモリ / 40GB SSD / 2TB 転送） |

> **$3.5 の 512MB プランは選ばないでください。** `npm run build` でメモリが不足します。

### 2. 静的 IP を割り当てる

「ネットワーキング」→「静的 IP の作成」でインスタンスに割り当てます。
**割り当て済みの静的 IP は無料**です（インスタンスから外すと課金対象になるので注意してください）。

### 3. ファイアウォールを開ける

インスタンスの「ネットワーキング」タブで、以下が許可されていることを確認します。

| アプリケーション | プロトコル | ポート |
| --- | --- | --- |
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

**Lightsail 側のファイアウォールで制御するため、OS 側の `ufw` は有効にしないでください**（二重管理になり、締め出しの原因になります）。

### 4. DNS を設定する

ドメインの A レコードを、手順 2 の静的 IP に向けます。

```
renrakuhyou.example.co.jp.   A   <静的IP>
```

Route 53 のホストゾーンは月 $0.50 かかります。**ドメイン取得元の DNS をそのまま使えば 0 円**なので、こだわりがなければそちらで構いません。

### 5. アプリを構築する

コンソールの「SSH を使用して接続」から入り、以降は
**[インターネット公開の手順](./deployment.md) の手順 2 以降をそのまま実行します。**
ただし、Lightsail では次の 2 点だけ読み替えてください。

- **手順 2 の `ufw` は実行しない**（手順 3 で設定済みのため）
- **スワップの作成は実行する**（1GB プランではビルド時に必要です）

```bash
sudo -i    # 以降 root で作業

# スワップ（deployment.md 手順 2 と同じ）
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

あとは `deployment.md` の手順 3（Node.js）→ 8（初期設定）まで順に進めれば完了です。

### 6. バックアップ

**自動スナップショット**を有効にすると、ディスク全体が毎日バックアップされます（「スナップショット」タブ → 自動スナップショットを有効化）。
料金は 40GB で月 $2 程度です。アプリ側の日次バックアップ（`deploy/renrakuhyou-backup.timer`）と併用すると、
**「ファイル単位で戻す」「サーバーごと戻す」の両方**ができます。

さらに堅くするなら、S3 へ退避します（保存量がごく小さいため費用はほぼ発生しません）。

```bash
# 1. インスタンスに IAM ロールを割り当てるか、aws configure で認証情報を設定
apt-get install -y awscli

# 2. 毎日 4:00 に S3 へ同期する
cat >> /etc/crontab <<'EOF'
0 4 * * * renrakuhyou aws s3 sync /opt/renrakuhyou/backups s3://<バケット名>/renrakuhyou/
EOF
```

`.env`（特に VAPID 鍵）も一緒に保管してください。DB だけ戻しても、鍵が違うと通知が届きません。

---

## GCP Compute Engine の手順

GCP に統一したい場合はこちらです。

### 1. インスタンスを作る

```bash
gcloud compute instances create renrakuhyou \
  --zone=asia-northeast1-b \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server
```

### 2. 静的 IP を割り当てる

```bash
gcloud compute addresses create renrakuhyou-ip --region=asia-northeast1

# インスタンスに付け替える
gcloud compute instances delete-access-config renrakuhyou \
  --zone=asia-northeast1-b --access-config-name="external-nat"
gcloud compute instances add-access-config renrakuhyou \
  --zone=asia-northeast1-b --access-config-name="external-nat" \
  --address=$(gcloud compute addresses describe renrakuhyou-ip \
              --region=asia-northeast1 --format='value(address)')
```

> **GCP は外部 IPv4 アドレスに月約 440 円（$0.004/時）かかります。** 無料枠の対象外です。

### 3. ファイアウォールを開ける

```bash
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 --target-tags=https-server
```

OS 側の `ufw` は有効にしないでください（GCP のファイアウォールで制御するため）。

### 4. 以降の手順

```bash
gcloud compute ssh renrakuhyou --zone=asia-northeast1-b
sudo -i
```

**[インターネット公開の手順](./deployment.md) の手順 2 以降**を、`ufw` の行だけ飛ばして実行します。
DNS の A レコードは、手順 2 で確保した静的 IP に向けてください。

> e2-micro は CPU が 0.25 vCPU 相当の共有のため、`npm run build` に 10〜15 分ほどかかります。
> 失敗するわけではないので、そのまま待ってください（スワップの作成は忘れずに実行してください）。

### 5. バックアップ

ディスクのスナップショットをスケジュール実行します。

```bash
gcloud compute resource-policies create snapshot-schedule renrakuhyou-daily \
  --region=asia-northeast1 --max-retention-days=14 \
  --daily-schedule --start-time=19:00        # UTC 19:00 = JST 翌 4:00

gcloud compute disks add-resource-policies renrakuhyou \
  --zone=asia-northeast1-b --resource-policies=renrakuhyou-daily
```

Cloud Storage へ退避する場合は次のとおりです。

```bash
gcloud storage buckets create gs://<バケット名> --location=asia-northeast1

cat >> /etc/crontab <<'EOF'
0 4 * * * renrakuhyou gcloud storage rsync /opt/renrakuhyou/backups gs://<バケット名>/renrakuhyou/ --recursive
EOF
```

---

## さらに費用を抑える：GCP の Always Free

GCP には**無期限で無料の e2-micro**（1 台のみ）があり、これを使うと **月約 440 円**（外部 IP 代のみ）まで下がります。

**条件**

- リージョンが **`us-west1` / `us-central1` / `us-east1` に限られます**（東京・大阪は対象外）
- 標準永続ディスク 30GB まで
- 外部 IPv4 は無料枠の対象外（月約 440 円）

**トレードオフ**

米国リージョンになるため、日本からの通信に **往復 120〜150ms 程度**が上乗せされます。
このアプリは画面を頻繁に操作するものではないので実用上は問題ありませんが、
**Lightsail 東京との差はわずか月 300 円程度**です。応答速度を考えると、Lightsail の方が費用対効果は高いと考えます。

作成する場合は、リージョンを `us-central1` に変えて GCP の手順を実行してください。

```bash
gcloud compute instances create renrakuhyou \
  --zone=us-central1-a --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --tags=http-server,https-server
```

> AWS の新規アカウント向け無料プランは、**2025 年 7 月以降は「最大 6 か月・$200 クレジット」方式**に変わりました。
> 以前のような「12 か月間 t2.micro 無料」ではないため、**無料期間が終わったあとの料金**で判断してください。

---

## 請求アラートを必ず設定してください

クラウドは設定を誤ると請求が想定外に伸びます。**構築したその日に**上限アラートを設定してください。

**AWS**

Billing → 「予算」→ 予算を作成 → コスト予算で月 $10 程度を設定し、80% 超過でメール通知。

**GCP**

お支払い → 「予算とアラート」→ 予算を作成し、月 2,000 円程度で 50% / 90% / 100% に通知を設定。

---

## どちらを選んでも共通すること

- **HTTPS は Caddy が自動で取得・更新します。** ロードバランサ（AWS ALB 月約 2,500 円 / GCP LB 月約 2,700 円）は不要です
- **アプリは 127.0.0.1 でのみ待ち受け**、外部からは Caddy 経由でしか到達できません
- **VAPID 鍵を失うと、全従業員に通知が届かなくなります。** `.env` を必ずバックアップしてください
- 監視が必要になったら、CloudWatch / Cloud Monitoring でインスタンスの死活監視を追加してください（無料枠内で収まります）

## 参考

- [Google Cloud VPC 料金：外部 IP アドレスの課金について](https://cloud.google.com/vpc/pricing-announce-external-ips)
- [AWS Lightsail の利用価格について](https://www.acrovision.jp/service/aws/aws-lightsail/)
- [Amazon Lightsail ネットワークに関する FAQ（静的 IP の課金）](https://docs.aws.amazon.com/ja_jp/lightsail/latest/userguide/amazon-lightsail-faq-networking.html)
- [AWS 無料利用枠の 2025 年 7 月からの変更点](https://managed.gmocloud.com/library/aws/basics/aws-free-tier-2025-change.html)
