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

1. [Slack API](https://api.slack.com/apps) で新しいアプリを作成
2. **OAuth & Permissions** で以下のBot Token Scopesを追加:
   - `app_mentions:read` - メンションの読み取り
   - `chat:write` - メッセージの送信
3. ワークスペースにインストールし、Bot User OAuth Tokenを取得
4. **Basic Information** からSigning Secretを取得

### 2. Slack Event Subscriptionsの設定

1. **Event Subscriptions** を有効化
2. Request URLを設定: `https://your-host.example.com/slack/events`
3. **Subscribe to bot events** で `app_mention` を追加

### 3. Google Calendar APIの設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **APIとサービス** → **ライブラリ** で「Google Calendar API」を有効化
3. **IAMと管理** → **サービスアカウント** でサービスアカウントを作成
4. 作成したサービスアカウントの **鍵** タブでJSONキーを生成・ダウンロード
5. [Google Calendar](https://calendar.google.com/) で対象カレンダーの共有設定を開き、サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）に「予定の変更」権限を付与

### 4. OpenRouterの設定

1. [OpenRouter](https://openrouter.ai/) でアカウント作成
2. APIキーを取得

### 5. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、値を設定します。

```
PORT=3000
ENABLE_DAILY_NOTIFICATION=true
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_SIGNING_SECRET=xxxxx
SLACK_NOTIFICATION_CHANNEL_ID=C0XXXXXXXXX
OPENROUTER_API_KEY=sk-or-xxxxx
GOOGLE_CALENDAR_ID=xxxxx@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> **Note:** `GOOGLE_SERVICE_ACCOUNT_JSON`はダウンロードしたJSONを1行にして設定します。
> ```bash
> cat your-service-account.json | jq -c .
> ```

### 6. デプロイ

#### Portainer Stack / Docker Compose

```bash
docker compose up -d --build
```

Portainer では `docker-compose.yml` を Stack として読み込み、同じ環境変数を UI から設定してください。

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

---

## 技術スタック

- **Runtime**: Bun 1.3 / Docker / Portainer
- **Framework**: Hono
- **LLM**: OpenRouter (DeepSeek R1T2 Chimera)
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
├── llm.ts            # OpenRouter LLM連携（意図解析、情報抽出）
└── googleCalendar.ts # Google Calendar API連携（イベントCRUD）
```
