import { Hono } from 'hono';
import type { Env, SlackEventPayload, SlackChallengePayload } from './types';
import { verifySlackRequest, sendSlackMessage, formatUserMention } from './slack';
import { analyzeIntent, extractReservationInfo } from './llm';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getTodayEvents,
} from './googleCalendar';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const app = new Hono<{ Bindings: Env }>();

const TIMEZONE = 'Asia/Tokyo';

/**
 * 日時を日本語フォーマットに変換
 */
function formatDateTime(isoString: string): string {
  const date = toZonedTime(parseISO(isoString), TIMEZONE);
  return format(date, 'yyyy年MM月dd日 HH時mm分');
}

/**
 * 時刻のみをフォーマット
 */
function formatTime(isoString: string): string {
  const date = toZonedTime(parseISO(isoString), TIMEZONE);
  return format(date, 'HH:mm');
}

/**
 * ヘルスチェック
 */
app.get('/', (c) => {
  return c.text('室予約管理Bot そぽ is running!');
});

/**
 * Slack Events APIエンドポイント
 */
app.post('/slack/events', async (c) => {
  const body = await c.req.text();

  // 署名検証
  const isValid = await verifySlackRequest(c.req.raw, body, c.env);
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(body) as SlackEventPayload | SlackChallengePayload;

  // URL検証チャレンジ
  if (payload.type === 'url_verification') {
    return c.json({ challenge: (payload as SlackChallengePayload).challenge });
  }

  // イベント処理
  if (payload.type === 'event_callback') {
    const eventPayload = payload as SlackEventPayload;
    const event = eventPayload.event;

    if (event.type === 'app_mention') {
      // 3秒ルール対策：即座に200を返す
      c.executionCtx.waitUntil(handleAppMention(event, c.env));
    }
  }

  return c.json({ ok: true });
});

/**
 * メンションイベントを処理
 */
async function handleAppMention(
  event: SlackEventPayload['event'],
  env: Env
): Promise<void> {
  const { user, text, channel, ts } = event;
  const userMention = formatUserMention(user);

  try {
    // 意図を解析
    const intent = await analyzeIntent(text, env);

    if (intent.isDeletion && intent.eventId) {
      // 削除リクエスト
      await deleteCalendarEvent(intent.eventId, env);
      await sendSlackMessage(
        channel,
        `${userMention}さん、お疲れ様そぽ！\n予約ID: ${intent.eventId} の予定を削除したそぽ！`,
        env,
        ts
      );
    } else if (intent.isReservation) {
      // 予約リクエスト
      const info = await extractReservationInfo(text, env);
      if (!info) {
        await sendSlackMessage(
          channel,
          `${userMention}さん、予約情報を読み取れなかったそぽ...\n目的、主催、開始時刻、終了時刻を含めて再度送ってほしいそぽ！`,
          env,
          ts
        );
        return;
      }

      const eventId = await createCalendarEvent(
        info.purpose,
        info.organizer,
        info.startTime,
        info.endTime,
        env
      );

      const response = `${userMention}さん、お疲れ様そぽ！
室の予約が完了したそぽ！
目的: ${info.purpose}
主催: ${info.organizer}
開始時刻: ${formatDateTime(info.startTime)}
終了時刻: ${formatDateTime(info.endTime)}
予約ID: ${eventId}`;

      await sendSlackMessage(channel, response, env, ts);
    } else {
      // 不明なリクエスト
      await sendSlackMessage(
        channel,
        `${userMention}さん、ごめんそぽ...\nリクエストの内容がわからなかったそぽ。\n\n予約する場合は以下の形式で送ってほしいそぽ：\n\`\`\`\n@室管理そぽたん\n目的: ○○会議\n主催: ○○局\n開始時刻: 2026年1月5日 16時45分\n終了時刻: 2026年1月5日 18時00分\n\`\`\`\n\n削除する場合は「予約ID: ○○ の予定を削除して」と送ってほしいそぽ！`,
        env,
        ts
      );
    }
  } catch (error) {
    console.error('Error handling app mention:', error);
    await sendSlackMessage(
      channel,
      `${userMention}さん、エラーが発生したそぽ...しばらくしてから再度お試しくださいそぽ。`,
      env,
      ts
    );
  }
}

/**
 * 毎朝の定期通知を生成
 */
async function sendDailyNotification(env: Env): Promise<void> {
  const events = await getTodayEvents(env);

  const today = new Date();
  const todayStr = format(toZonedTime(today, TIMEZONE), 'yyyy年MM月dd日');

  let message: string;

  if (events.length === 0) {
    message = `おはようそぽ！\n今日（${todayStr}）の委員会室の予定はないそぽ！\n今日も一日、頑張ろうそぽ～！`;
  } else {
    const eventsList = events
      .map((event, index) => {
        const startTime = formatTime(event.startTime);
        const endTime = formatTime(event.endTime);
        const organizer = event.organizer ? `主催: ${event.organizer}` : '(詳細なし)';
        return `${index + 1}. ${event.summary}\n　時間: ${startTime}～${endTime}\n　${organizer}`;
      })
      .join('\n');

    message = `おはようそぽ！\n今日（${todayStr}）の委員会室の予定をお知らせするそぽ！\n${eventsList}\n今日も一日、頑張ろうそぽ～！`;
  }

  await sendSlackMessage(env.SLACK_NOTIFICATION_CHANNEL_ID, message, env);
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDailyNotification(env));
  },
};
