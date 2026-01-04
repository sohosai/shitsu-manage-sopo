/**
 * 環境変数の型定義
 */
export interface Env {
    // Slack
    SLACK_BOT_TOKEN: string;
    SLACK_SIGNING_SECRET: string;
    SLACK_NOTIFICATION_CHANNEL_ID: string;

    // OpenRouter
    OPENROUTER_API_KEY: string;

    // Google Calendar
    GOOGLE_CALENDAR_ID: string;
    GOOGLE_SERVICE_ACCOUNT_JSON: string;
}

/**
 * 予約リクエストの型
 */
export interface ReservationRequest {
    purpose: string;       // 目的
    organizer: string;     // 主催
    startTime: Date;       // 開始時刻
    endTime: Date;         // 終了時刻
}

/**
 * 削除リクエストの型
 */
export interface DeleteRequest {
    eventId: string;       // 予約ID
}

/**
 * LLMによる意図解析結果
 */
export type IntentResult =
    | { type: 'reservation'; data: ReservationRequest }
    | { type: 'deletion'; data: DeleteRequest }
    | { type: 'unknown'; message: string };

/**
 * Slackイベントペイロード（app_mention）
 */
export interface SlackAppMentionEvent {
    type: 'app_mention';
    user: string;
    text: string;
    ts: string;
    channel: string;
    event_ts: string;
}

/**
 * Slackイベントペイロードのラッパー
 */
export interface SlackEventPayload {
    token: string;
    team_id: string;
    api_app_id: string;
    event: SlackAppMentionEvent;
    type: 'event_callback';
    event_id: string;
    event_time: number;
    authorizations: Array<{
        user_id: string;
    }>;
}

/**
 * Slack URL検証チャレンジ
 */
export interface SlackChallengePayload {
    type: 'url_verification';
    token: string;
    challenge: string;
}

/**
 * Google Calendarイベント
 */
export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
}

/**
 * 当日の予定一覧用
 */
export interface DailyEvent {
    summary: string;
    startTime: string;
    endTime: string;
    organizer?: string;
}
