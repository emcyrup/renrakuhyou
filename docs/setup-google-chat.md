# Google Chat 連携の設定手順

Google Workspace を契約している場合の推奨構成です。追加費用はかかりません。

## 1. Google Cloud プロジェクトと Chat API

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（既存でも可）。
2. 「API とサービス」→「ライブラリ」で **Google Chat API** を有効化。
3. プロジェクト番号（「プロジェクト情報」に表示される数字）を控える。Webhook の検証に使います。

## 2. サービスアカウントの作成

1. 「IAM と管理」→「サービス アカウント」→「サービス アカウントを作成」。
2. 作成後、「キー」タブから **JSON 形式の鍵** を作成してダウンロード。
3. ダウンロードした JSON を 1 行にして `.env` に設定します。

```bash
# 改行を \n にエスケープした 1 行の JSON にする
node -e "console.log(JSON.stringify(require('fs').readFileSync('./key.json','utf8')))"
```

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n..."}
GOOGLE_CHAT_AUDIENCE=123456789012   # 手順 1 のプロジェクト番号
```

## 3. Chat アプリの構成

「Google Chat API」→「構成」で以下を設定します。

| 項目 | 値 |
| --- | --- |
| アプリ名 | 連絡票（任意） |
| 説明 | 従業員向けの連絡配信 |
| 機能 | 「1:1 のメッセージを受信する」を有効化 |
| 接続設定 | **HTTP エンドポイントの URL** |
| HTTP エンドポイント URL | `https://<公開ホスト>/api/webhooks/google_chat` |
| 認証 | 「アプリの音声トークン」（Bearer トークン）を有効 |
| 公開範囲 | 自社ドメイン内の特定のユーザーまたはグループ |

「確認しました」ボタンの押下はこの HTTP エンドポイントへ届き、アプリが確認済みとして記録します。

## 4. 従業員の登録

従業員画面で、サービスに「Google Chat」を選び、**送信先 ID** に会社のメールアドレス（例: `taro@example.co.jp`）を入力します。

> **初回だけ必要な操作**
> Bot から DM を送るには、その従業員との DM スペースが存在している必要があります。
> 従業員側で Google Chat の「新しいチャット」からアプリ（連絡票）を一度検索して開いてもらってください。
> 一度開けば、以降はアプリ側から自由に送信できます（スペース ID はアプリが自動でキャッシュします）。

ドメイン全体の委任を設定している場合は `GOOGLE_IMPERSONATE_SUBJECT` に管理者のメールアドレスを設定できます。

## 5. 動作確認

1. 従業員を 1 名だけ登録する。
2. 「新規連絡」からテスト連絡を作成し、送信する。
3. Google Chat にカードが届き、「確認しました」を押すと連絡詳細画面が「確認済み」になることを確認する。

うまくいかない場合は「送信ログ」画面にエラー内容が記録されています。
