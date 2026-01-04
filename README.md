# 室予約管理Bot そぽ

Slack Botで委員会室の予約を管理します。Google Calendarと連携して予定の登録・削除・通知を行います。

## 機能

- **予約登録**: メンション付きで予定情報を送信すると、Google Calendarに登録
- **予約削除**: 予約IDを指定して削除をリクエスト
- **毎朝通知**: 毎朝9時（JST）にその日の予定をSlackに通知

## セットアップ

### 1. Slack Appの設定

1. [Slack API](https://api.slack.com/apps) で新しいアプリを作成
2. **OAuth & Permissions** で以下のBot Token Scopesを追加:
   - `app_mentions:read`
   - `chat:write`
3. **Event Subscriptions** を有効化:
   - Request URL: `https://your-worker.workers.dev/slack/events`
   - Subscribe to bot events: `app_mention`
4. ワークスペースにインストール

### 2. Google Calendar APIの設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Calendar APIを有効化
3. サービスアカウントを作成し、JSONキーをダウンロード
4. カレンダーの共有設定でサービスアカウントのメールに編集権限を付与

### 3. OpenRouterの設定

1. [OpenRouter](https://openrouter.ai/) でAPIキーを取得

### 4. 環境変数の設定

\`\`\`bash
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_NOTIFICATION_CHANNEL_ID
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put GOOGLE_CALENDAR_ID
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
\`\`\`

### 5. デプロイ

\`\`\`bash
npm install
npm run deploy
\`\`\`

## 使い方

### 予約登録

\`\`\`
@Bot
目的: 室で予算担当引き継ぎ①
主催: 財務局
開始時刻: 2026年1月5日 16時45分
終了時刻: 2026年1月5日 18時00分
\`\`\`

### 予約削除

\`\`\`
@Bot 予約ID: ofcsqis76lvukmlaam6pg84n2k の予定を削除して
\`\`\`

## 開発

\`\`\`bash
npm run dev
\`\`\`
