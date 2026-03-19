# 室管理そぽ 🐤

委員会室の予約を管理するSlack Botです。Google Calendarと連携して予定の登録・削除・通知を行います。

## 機能

### 📅 予約登録
メンション付きで予定情報を送信すると、Google Calendarに登録します。
時間が重複する予定がある場合は警告を表示します。

### 🗑️ 予約削除
予約IDを指定して削除をリクエストできます。

### 📋 今日の予定確認
「今日の予定を教えて」と聞くと、今日の予定一覧を返信します。

### 🏥 ステータス確認
メンションのみ送信すると、各APIの接続状況をチェックして報告します。

### ⏰ 毎朝の定期通知
毎朝9時（JST）にその日の予定をSlackチャンネルに自動通知します。
※予定がない日は通知されません

---

## 使い方

### 予約を登録する

```
@室管理そぽ
目的: 室で予算担当引き継ぎ①
主催: 財務局
開始時刻: 2026年1月5日 16時45分
終了時刻: 2026年1月5日 18時00分
```

**応答例:**
```
@ユーザーさん、お疲れ様そぽ！
室の予約が完了したそぽ！
目的: 室で予算担当引き継ぎ①
主催: 財務局
開始時刻: 2026年01月05日 16時45分
終了時刻: 2026年01月05日 18時00分
予約ID: ofcsqis76lvukmlaam6pg84n2k
```

### 予約を削除する

```
@室管理そぽ 予約ID: ofcsqis76lvukmlaam6pg84n2k の予定を削除して
```

### 今日の予定を確認する

```
@室管理そぽ 今日の予定を教えて
```

### ステータスを確認する

```
@室管理そぽ
```
（メンションのみ送信）

---

## セットアップ

### 1. Slack Appの作成

1. [Slack API](https://api.slack.com/apps) で `Create New App` を開く
2. `From manifest` を選び、対象ワークスペースを選択する
3. 下の manifest JSON の `request_url` を自分の公開 URL に置き換えて貼り付ける
4. アプリ作成後にワークスペースへインストールし、Bot User OAuth Token を取得する
5. **Basic Information** から Signing Secret を取得する

#### Slack App Manifest JSON

```json
{
  "display_information": {
    "name": "室管理そぽ",
    "description": "委員会室の予約を管理するSlack Bot",
    "background_color": "#2eb67d"
  },
  "features": {
    "bot_user": {
      "display_name": "室管理そぽ",
      "always_online": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "chat:write"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://your-bot.example.com/slack/events",
      "bot_events": [
        "app_mention"
      ]
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

`request_url` は `https://<APP_HOST>/slack/events` に置き換えてください。後述の `compose.yaml` の `APP_HOST` と同じ値にそろえると迷いません。Slack 側で Event Subscriptions の保存時に URL 検証が走るので、この時点で公開 URL から到達できる必要があります。

### 2. Slack Event Subscriptionsの設定

manifest を使った場合、この設定は自動で入ります。必要に応じて **Event Subscriptions** で以下を確認してください。

1. **Event Subscriptions** が有効になっている
2. Request URL が `https://<APP_HOST>/slack/events` になっている
3. **Subscribe to bot events** に `app_mention` が入っている

### 3. Google Calendar APIの設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **APIとサービス** → **ライブラリ** で「Google Calendar API」を有効化
3. **IAMと管理** → **サービスアカウント** でサービスアカウントを作成
4. 作成したサービスアカウントの **鍵** タブでJSONキーを生成・ダウンロード
5. [Google Calendar](https://calendar.google.com/) で対象カレンダーの共有設定を開き、サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）に「予定の変更」権限を付与

### 4. さくらの AI Engine の設定

1. さくらの AI Engine で利用したいモデルを確認
2. アカウントトークンを発行
3. 必要に応じて接続先URLを確認（通常は既定値のままで動作）

### 5. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、値を設定します。

```
PORT=3000
ENABLE_DAILY_NOTIFICATION=true
APP_HOST=your-bot.example.com
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_SIGNING_SECRET=xxxxx
SLACK_NOTIFICATION_CHANNEL_ID=C0XXXXXXXXX
OPENAI_API_KEY=sk-sakura-xxxxx
OPENAI_MODEL=gpt-oss-120b
OPENAI_BASE_URL=https://api.ai.sakura.ad.jp/v1
GOOGLE_CALENDAR_ID=xxxxx@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> **Note:** `GOOGLE_SERVICE_ACCOUNT_JSON`はダウンロードしたJSONを1行にして設定します。
> ```bash
> cat your-service-account.json | jq -c .
> ```
> `OPENAI_BASE_URL` は省略可能で、未設定時は `https://api.ai.sakura.ad.jp/v1` を使います。
> 環境変数名は OpenAI 互換ですが、既定の接続先は さくら AI Engine です。

### 6. デプロイ

#### Portainer Stack / Docker Compose

```bash
docker compose pull
docker compose up -d
```

Portainer では `compose.yaml` を Stack として読み込み、同じ環境変数を UI から設定してください。
公開済みイメージを使う場合は `ghcr.io/sohosai/shitsu-manage-sopo:latest` を参照できます。
`APP_HOST` は Traefik の Host ルールに使われるので、Slack manifest の `request_url` と同じホスト名を入れてください。
`portainer-traefik` ネットワークは external network 前提です。Portainer 側で存在している必要があります。

> **重要:** 毎朝 9:00 JST の定期通知はアプリ内タイマーで実行します。通知の重複を避けるため、Portainer では **1コンテナ固定** で運用してください。

#### ローカル開発

```bash
bun install
bun run dev
```

---

## 開発

### ローカル開発サーバーの起動

```bash
bun run dev
```

`http://localhost:3000` でサーバーが起動します。

### 本番ビルド

```bash
bun run build
bun run start
```

### Docker Image CD

`main` への push と手動実行で GitHub Actions が GHCR に Docker image を publish します。

- `ghcr.io/sohosai/shitsu-manage-sopo:latest` - `main` の最新 image
- `ghcr.io/sohosai/shitsu-manage-sopo:sha-<commit>` - コミット単位

初回だけ GitHub の Actions 設定で `GITHUB_TOKEN` に `Read and write permissions` を許可してください。

---

## 技術スタック

- **Runtime**: Bun 1.3 / Docker / Portainer
- **Framework**: Hono
- **LLM**: さくら AI Engine (OpenAI SDK / Chat Completions)
- **Calendar**: Google Calendar API
- **Language**: TypeScript

---

## ファイル構成

```
src/
├── server.ts         # HTTPサーバー起動
├── index.ts          # Honoアプリ生成、Slack Events処理
├── env.ts            # 環境変数の読込
├── scheduler.ts      # 毎朝9:00 JSTの定期通知タイマー
├── types.ts          # 型定義
├── slack.ts          # Slack API操作（署名検証、メッセージ送信）
├── llm.ts            # OpenAI SDK経由のさくら AI Engine連携（意図解析、情報抽出）
└── googleCalendar.ts # Google Calendar API連携（イベントCRUD）
```
