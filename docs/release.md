# 変更を本番へ反映する手順

`main` を本番の正とし、**`main` へマージ → サーバーでデプロイコマンドを 1 回実行**という流れです。

```
作業ブランチ ──PR──▶ main ──デプロイ──▶ 本番サーバー
              │              │
              └ CI が自動で   └ deploy.sh が
                ビルドを検証     取得・ビルド・入れ替え・動作確認
```

## 1 回だけの準備

サーバーのチェックアウトを `main` に合わせます（すでに `main` なら不要です）。

```bash
sudo -u renrakuhyou -H bash -c 'cd /opt/renrakuhyou && git rev-parse --abbrev-ref HEAD'
```

`main` 以外が表示された場合は切り替えます。

```bash
sudo -u renrakuhyou -H bash <<'SETUP'
set -euo pipefail
cd /opt/renrakuhyou
git checkout main
git pull
SETUP
```

## ふだんの流れ

### 1. 作業ブランチで変更し、PR を作る

`main` へ直接 push せず、PR を経由します。PR を作ると **CI が自動で型検査とビルドを実行**します
（`.github/workflows/ci.yml`）。ここが緑であれば、本番でビルドに失敗することはありません。

### 2. CI が緑になったらマージ

`main` へマージします。

### 3. サーバーでデプロイ

```bash
sudo /opt/renrakuhyou/deploy/deploy.sh
```

これだけです。スクリプトが次を順に行います。

1. `main` にいること・未コミットの変更が無いことを確認
2. **データベースをバックアップ**
3. `git merge --ff-only` で最新を取得（取り込む内容を一覧表示）
4. `npm ci` と `npm run build`
5. サービスを入れ替え
6. **応答を確認**（`http://127.0.0.1:3000/login` が 200 を返すか）
7. セルフチェックの結果を表示

**ビルドに失敗した場合、または入れ替え後にアプリが応答しない場合は、直前のコミットへ自動で戻します。**
更新が無いときは何もせずに終了するため、繰り返し実行しても安全です。

## 想定される表示

```
▶ 更新を確認しています
現在: 78da918  →  最新: 52f80e5
  52f80e5 Merge pull request #2 ...
  63cdd00 セルフチェックが権限不足のファイルで異常終了する不具合を修正
▶ データベースをバックアップしています
▶ 最新のコードを取得しています
▶ 依存関係をインストールしています
▶ ビルドしています
▶ サービスを入れ替えています
▶ 応答を確認しています
応答を確認しました（1 回目）
▶ セルフチェック
...
✓ デプロイが完了しました（52f80e5）
```

## 困ったときは

| 表示 | 対処 |
| --- | --- |
| `現在のブランチは '...' です` | 上の「1 回だけの準備」で `main` に切り替えてください |
| `未コミットの変更があります` | サーバー上で直接ファイルを編集した形跡があります。`git status` で内容を確認し、不要なら `git checkout -- <ファイル>` で戻してください |
| `早送りマージができません` | サーバー側に `main` に無いコミットがあります。`git log origin/main..HEAD` で確認してください |
| `バックアップに失敗しました` | 原因を解消してから再実行してください。緊急時のみ `sudo SKIP_BACKUP=1 /opt/renrakuhyou/deploy/deploy.sh` |
| `デプロイに失敗したため、直前の状態へ戻しました` | 切り戻し済みで**サービスは動いています**。`journalctl -u renrakuhyou -n 50` で原因を確認してください |

## 設定ファイルを変えたときの注意

**`.env` と `/etc/caddy/Caddyfile` は git の管理外**です（秘密情報と環境固有の値のため）。
これらを変えた場合は、デプロイとは別に反映が必要です。

```bash
# .env を変更したとき
sudo systemctl restart renrakuhyou

# Caddyfile を変更したとき
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

`.env.example` に項目が増えた場合は、デプロイ後に `.env` へ手で追記してください。
不足があれば `npm run healthcheck` が知らせます。

## 自動デプロイにする場合（任意）

「マージしたら自動で反映」にしたい場合は、サーバー側で定期的に確認する方式が簡単です
（GitHub へ鍵を預ける必要がなく、サーバーへの受信ポートも開けずに済みます）。

```bash
sudo tee /etc/systemd/system/renrakuhyou-deploy.service >/dev/null <<'EOF'
[Unit]
Description=連絡票 自動デプロイ
After=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/renrakuhyou/deploy/deploy.sh
EOF

sudo tee /etc/systemd/system/renrakuhyou-deploy.timer >/dev/null <<'EOF'
[Unit]
Description=連絡票 自動デプロイの定期実行

[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now renrakuhyou-deploy.timer
```

**ただし、業務で使う連絡手段であることを踏まえると、手動での実行を推奨します。**
自動にすると、マージした内容がいつ本番へ入るかを把握しづらくなり、
不具合が出たときに気づくのが遅れます。デプロイは 1 コマンドで終わるため、
マージ後に自分で実行するほうが安全です。

自動にする場合も、**従業員の勤務時間外（早朝など）**に実行するようにしてください。
