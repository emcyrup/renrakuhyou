# LINE WORKS 連携の設定手順

Google Workspace を使っていない場合の推奨構成です。フリープラン（30 ユーザーまで）なら費用はかかりません。

## 1. Developer Console でアプリを登録

[LINE WORKS Developer Console](https://developers.worksmobile.com/) にログインし、「アプリ」を新規作成します。

1. **Client ID** と **Client Secret** を控える。
2. 「Service Account」を発行し、**Service Account ID** と **秘密鍵（Private Key）** を取得する。
3. OAuth Scope に `bot` を追加する。

## 2. Bot の作成

「Bot」→「登録」で Bot を作成します。

| 項目 | 値 |
| --- | --- |
| Bot 名 | 連絡票（任意） |
| API Interface | **Callback を使用する** |
| Callback URL | `https://<公開ホスト>/api/webhooks/line_works` |
| Callback イベント | **postback** にチェック |
| 複数人のトークルームに招待可能 | オフでよい（1:1 で使うため） |

作成後、**Bot ID** と **Bot Secret** を控えます。
最後に管理者画面で Bot を「公開」し、対象の従業員が利用できる状態にしてください。

## 3. .env の設定

```env
DEFAULT_PROVIDER=line_works
LINEWORKS_CLIENT_ID=xxxxxxxx
LINEWORKS_CLIENT_SECRET=xxxxxxxx
LINEWORKS_SERVICE_ACCOUNT=xxxxx.serviceaccount@example
LINEWORKS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
LINEWORKS_BOT_ID=1234567
LINEWORKS_BOT_SECRET=xxxxxxxx
```

秘密鍵は改行を `\n` にエスケープした 1 行で設定します。

## 4. 従業員の登録

従業員画面で、サービスに「LINE WORKS」を選び、**送信先 ID** に LINE WORKS のユーザー ID（または会社メールアドレス）を入力します。
ユーザー ID は管理者画面のメンバー一覧、または Developer Console の User API で確認できます。

## 5. 動作確認

1. 従業員を 1 名だけ登録する。
2. 「新規連絡」からテスト連絡を作成し、送信する。
3. LINE WORKS のトークにボタン付きメッセージが届き、「確認しました」を押すと連絡詳細画面が「確認済み」になることを確認する。

うまくいかない場合は「送信ログ」画面にエラー内容が記録されています。

## LINE 公式アカウントを使う場合

個人の LINE に送る構成にも対応しています（`DEFAULT_PROVIDER=line`）。

1. [LINE Developers](https://developers.line.biz/) で Messaging API チャネルを作成。
2. **チャネルアクセストークン（長期）** と **チャネルシークレット** を `.env` に設定。
3. Webhook URL に `https://<公開ホスト>/api/webhooks/line` を設定し、Webhook の利用をオンにする。
4. 従業員の送信先 ID には、公式アカウントを友だち追加したユーザーの **userId**（`U` で始まる 33 文字）を入力する。

プッシュメッセージは通数課金の対象です。コストの詳細は [メッセージサービスの選定](./messaging-service-comparison.md) を参照してください。
