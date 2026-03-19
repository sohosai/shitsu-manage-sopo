import { Hono } from 'hono';
import type { Env, SlackEventPayload, SlackChallengePayload } from './types.js';
import { verifySlackRequest, sendSlackMessage, formatUserMention } from './slack.js';
import { analyzeIntent, extractReservationInfo } from './llm.js';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getTodayEvents,
  getEventsInRange,
  checkCalendarConnection,
} from './googleCalendar.js';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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
 * 今日の予定をフォーマット
 */
function formatTodayEvents(events: Awaited<ReturnType<typeof getTodayEvents>>): string {
  const today = new Date();
  const todayStr = format(toZonedTime(today, TIMEZONE), 'yyyy年MM月dd日');

  if (events.length === 0) {
    return `今日（${todayStr}）の委員会室の予定はないそぽ！`;
  }

  const eventsList = events
    .map((event, index) => {
      const startTime = formatTime(event.startTime);
      const endTime = formatTime(event.endTime);
      const organizer = event.organizer ? `主催: ${event.organizer}` : '(詳細なし)';
      return `${index + 1}. ${event.summary}\n　時間: ${startTime}～${endTime}\n　${organizer}`;
    })
    .join('\n');

  return `今日（${todayStr}）の委員会室の予定は以下の通りそぽ！\n${eventsList}`;
}

/**
 * HTTPアプリケーションを生成
 */
export function createApp(env: Env): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    return c.text('室予約管理Bot そぽ is running!');
  });

  app.post('/slack/events', async (c) => {
    const body = await c.req.text();

    const isValid = await verifySlackRequest(c.req.raw, body, env);
    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const payload = JSON.parse(body) as SlackEventPayload | SlackChallengePayload;

    if (payload.type === 'url_verification') {
      return c.json({ challenge: payload.challenge });
    }

    if (payload.type === 'event_callback' && payload.event.type === 'app_mention') {
      void handleAppMention(payload.event, env).catch((error) => {
        console.error('Background mention handling failed:', error);
      });
    }

    return c.json({ ok: true });
  });

  return app;
}

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
    const intent = await analyzeIntent(text, env);

    switch (intent.type) {
      case 'status':
        await handleStatusCheck(userMention, channel, ts, env);
        break;

      case 'today_schedule':
        await handleTodaySchedule(userMention, channel, ts, env);
        break;

      case 'deletion':
        if (intent.eventId) {
          await deleteCalendarEvent(intent.eventId, env);
          await sendSlackMessage(
            channel,
            `${userMention}さん、お疲れ様そぽ！\n予約ID: ${intent.eventId} の予定を削除したそぽ！`,
            env,
            ts
          );
        } else {
          await sendSlackMessage(
            channel,
            `${userMention}さん、予約IDがわからなかったそぽ...\n「予約ID: ○○ の予定を削除して」と送ってほしいそぽ！`,
            env,
            ts
          );
        }
        break;

      case 'reservation':
        await handleReservation(userMention, text, channel, ts, env);
        break;

      default:
        await sendSlackMessage(
          channel,
          `${userMention}さん、ごめんそぽ...\nメッセージの内容がわからなかったそぽ。\n\n予約する場合は以下の形式で送ってほしいそぽ：\n\`\`\`\n@室管理そぽたん\n目的: ○○会議\n主催: ○○局\n開始時刻: 2026年1月5日 16時45分\n終了時刻: 2026年1月5日 18時00分\n\`\`\`\n\n削除する場合は「予約ID: ○○ の予定を削除して」と送ってほしいそぽ！\n\n今日の予定を確認したい場合は「今日の予定を教えて」と聞いてほしいそぽ！`,
          env,
          ts
        );
    }
  } catch (error) {
    console.error('Error handling app mention:', error);

    const errorMessage = String(error);
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      await sendSlackMessage(
        channel,
        `${userMention}さん、ごめんそぽ...\nメッセージの制限に達したそぽ。しばらく待ってから（1分ほど）もう一度試してほしいそぽ！`,
        env,
        ts
      );
    } else {
      await sendSlackMessage(
        channel,
        `${userMention}さん、エラーが発生したそぽ...しばらくしてからもう一度試してほしいそぽ。`,
        env,
        ts
      );
    }
  }
}

/**
 * ステータスチェック処理
 */
async function handleStatusCheck(
  userMention: string,
  channel: string,
  ts: string,
  env: Env
): Promise<void> {
  const checks: { name: string; status: 'ok' | 'error'; message?: string }[] = [];

  const calendarCheck = await checkCalendarConnection(env);
  checks.push({
    name: 'Google Calendar',
    status: calendarCheck.ok ? 'ok' : 'error',
    message: calendarCheck.error,
  });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
    });
    checks.push({
      name: 'OpenRouter',
      status: response.ok ? 'ok' : 'error',
      message: response.ok ? undefined : `Status: ${response.status}`,
    });
  } catch (error) {
    checks.push({
      name: 'OpenRouter',
      status: 'error',
      message: String(error),
    });
  }

  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });
    const data = (await response.json()) as { ok: boolean; error?: string };
    checks.push({
      name: 'Slack API',
      status: data.ok ? 'ok' : 'error',
      message: data.ok ? undefined : data.error,
    });
  } catch (error) {
    checks.push({
      name: 'Slack API',
      status: 'error',
      message: String(error),
    });
  }

  const allOk = checks.every((c) => c.status === 'ok');
  const statusLines = checks
    .map((c) => {
      const emoji = c.status === 'ok' ? 'OK: ' : 'NG: ';
      const msg = c.message ? ` (${c.message})` : '';
      return `${emoji}${c.name}${msg}`;
    })
    .join('\n');

  const greeting = allOk
    ? `${userMention}さん、お疲れ様そぽ！\nそぽはとっても元気そぽ～！🎉`
    : `${userMention}さん、そぽはちょっと調子が悪いところがあるそぽ...😢`;

  await sendSlackMessage(channel, `${greeting}\n\n【システム状況】\n${statusLines}`, env, ts);
}

/**
 * 今日の予定問い合わせ処理
 */
async function handleTodaySchedule(
  userMention: string,
  channel: string,
  ts: string,
  env: Env
): Promise<void> {
  const events = await getTodayEvents(env);
  const eventsText = formatTodayEvents(events);
  await sendSlackMessage(channel, `${userMention}さん、お疲れ様そぽ！\n${eventsText}`, env, ts);
}

/**
 * 予約処理（重複チェック付き）
 */
async function handleReservation(
  userMention: string,
  text: string,
  channel: string,
  ts: string,
  env: Env
): Promise<void> {
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

  const existingEvents = await getEventsInRange(info.startTime, info.endTime, env);

  if (existingEvents.length > 0) {
    const conflictList = existingEvents
      .map((e) => `・${e.summary}（${formatTime(e.startTime)}～${formatTime(e.endTime)}）`)
      .join('\n');

    const eventId = await createCalendarEvent(
      info.purpose,
      info.organizer,
      info.startTime,
      info.endTime,
      env
    );

    const response = `${userMention}さん、お疲れ様そぽ！
室の予約が完了したそぽ！

⚠️ 以下の予定と時間が重複しているそぽ！確認してほしいそぽ：
${conflictList}

【登録した予定】
目的: ${info.purpose}
主催: ${info.organizer}
開始時刻: ${formatDateTime(info.startTime)}
終了時刻: ${formatDateTime(info.endTime)}
予約ID: ${eventId}

予約は完了しているから、もしキャンセルしたかったら「予約ID: ${eventId} の予定を削除して」と言ってほしいそぽ！`;

    await sendSlackMessage(channel, response, env, ts);
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
}

/**
 * 毎朝の定期通知を生成
 */
export async function sendDailyNotification(env: Env): Promise<void> {
  const events = await getTodayEvents(env);

  const today = new Date();
  const todayStr = format(toZonedTime(today, TIMEZONE), 'yyyy年MM月dd日');

  let message: string;

  if (events.length === 0) {
    return;
  }

  const eventsList = events
    .map((event, index) => {
      const startTime = formatTime(event.startTime);
      const endTime = formatTime(event.endTime);
      const organizer = event.organizer ? `主催: ${event.organizer}` : '(詳細なし)';
      return `${index + 1}. ${event.summary}\n　時間: ${startTime}～${endTime}\n　${organizer}`;
    })
    .join('\n');

  message = `おはようそぽ！\n今日（${todayStr}）の委員会室の予定をお知らせするそぽ！\n${eventsList}\n今日も一日、頑張ろうそぽ～！`;

  await sendSlackMessage(env.SLACK_NOTIFICATION_CHANNEL_ID, message, env);
}
