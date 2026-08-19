#!/usr/bin/env bash
#
# 本番環境へのデプロイ。main の最新を取得してビルドし、サービスを入れ替える。
#
#   sudo /opt/renrakuhyou/deploy/deploy.sh
#
# ビルドに失敗した場合、または入れ替え後にアプリが応答しない場合は、
# 直前のコミットへ自動で戻す。データベースはデプロイ前に必ずバックアップする。
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/renrakuhyou}"
APP_USER="${APP_USER:-renrakuhyou}"
SERVICE_NAME="${SERVICE_NAME:-renrakuhyou}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"

log() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# アプリのファイルは必ずアプリ用ユーザーで操作する（所有権エラーを避けるため）
run_as_app() {
  if [ "$(id -un)" = "$APP_USER" ]; then
    bash -c "cd '$APP_DIR' && $1"
  else
    sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $1"
  fi
}

# サービスの入れ替えには root が必要
[ "$(id -u)" -eq 0 ] || [ "$(id -un)" = "$APP_USER" ] || fail "sudo を付けて実行してください: sudo $0"
[ -d "$APP_DIR/.git" ] || fail "$APP_DIR が git リポジトリではありません"

# ---------------------------------------------------------------- 事前確認

current_branch=$(run_as_app 'git rev-parse --abbrev-ref HEAD')
if [ "$current_branch" != "$BRANCH" ]; then
  fail "現在のブランチは '$current_branch' です。'$BRANCH' に切り替えてから実行してください:
  sudo -u $APP_USER -H bash -c 'cd $APP_DIR && git checkout $BRANCH'"
fi

if ! run_as_app 'git diff --quiet && git diff --cached --quiet'; then
  fail "$APP_DIR に未コミットの変更があります。内容を確認してから実行してください（git status）"
fi

# バックアップやビルドに必要なツールが無い場合は先に用意する
if ! run_as_app 'test -x node_modules/.bin/tsx'; then
  log "依存関係が見つからないため先にインストールします"
  run_as_app 'npm ci' || fail "npm ci に失敗しました"
fi

log "更新を確認しています"
run_as_app "git fetch origin $BRANCH"

previous=$(run_as_app 'git rev-parse HEAD')
latest=$(run_as_app "git rev-parse origin/$BRANCH")

if [ "$previous" = "$latest" ]; then
  echo "すでに最新です（$(echo "$previous" | cut -c1-7)）。デプロイは不要です。"
  exit 0
fi

echo "現在: $(echo "$previous" | cut -c1-7)  →  最新: $(echo "$latest" | cut -c1-7)"
run_as_app "git log --oneline $previous..$latest" | sed 's/^/  /'

# ---------------------------------------------------------------- バックアップ

# .env の DATABASE_FILE を見て、まだ作られていない場合はバックアップを飛ばす
db_file=$(run_as_app 'grep -E "^DATABASE_FILE=" .env 2>/dev/null | cut -d= -f2-' || true)
db_file=${db_file:-data/renrakuhyou.sqlite}

if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  log "バックアップを省略します（SKIP_BACKUP=1）"
elif ! run_as_app "test -f '$db_file'"; then
  log "データベースがまだ無いため、バックアップを省略します"
else
  log "データベースをバックアップしています"
  run_as_app 'npm run backup --silent' \
    || fail "バックアップに失敗しました。原因を解消してから再実行してください（緊急時は SKIP_BACKUP=1 で省略できます）"
fi

# ---------------------------------------------------------------- 切り戻し

rollback() {
  printf '\n\033[33m切り戻しています（%s へ）\033[0m\n' "$(echo "$previous" | cut -c1-7)"
  run_as_app "git reset --hard $previous" >/dev/null
  run_as_app 'npm ci --silent && npm run build' >/dev/null 2>&1 || true
  restart_service || true
  fail "デプロイに失敗したため、直前の状態へ戻しました。ログを確認してください: journalctl -u $SERVICE_NAME -n 50"
}

restart_service() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart "$SERVICE_NAME"
  else
    sudo systemctl restart "$SERVICE_NAME"
  fi
}

# ---------------------------------------------------------------- 反映

log "最新のコードを取得しています"
run_as_app "git merge --ff-only origin/$BRANCH" || fail "早送りマージができません。手動で解決してください"

log "依存関係をインストールしています"
run_as_app 'npm ci' || rollback

log "ビルドしています"
run_as_app 'npm run build' || rollback

log "サービスを入れ替えています"
restart_service || rollback

# ---------------------------------------------------------------- 動作確認

log "応答を確認しています"
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL"; then
    echo "応答を確認しました（${attempt} 回目）"
    break
  fi
  if [ "$attempt" -eq "$HEALTH_RETRIES" ]; then
    rollback
  fi
  sleep 2
done

# セルフチェックは参考情報として表示する（結果に関わらず切り戻しはしない）
log "セルフチェック"
run_as_app 'npm run healthcheck --silent' || true

printf '\n\033[32m✓ デプロイが完了しました（%s）\033[0m\n' "$(echo "$latest" | cut -c1-7)"
