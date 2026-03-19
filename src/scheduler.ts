import { addDays, set } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Env } from './types.js';
import { sendDailyNotification } from './index.js';

const TIMEZONE = 'Asia/Tokyo';
const DAILY_NOTIFICATION_HOUR = 9;

function getNextRunAt(now: Date = new Date()): Date {
  const nowInTokyo = toZonedTime(now, TIMEZONE);
  let nextRunInTokyo = set(nowInTokyo, {
    hours: DAILY_NOTIFICATION_HOUR,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });

  if (nextRunInTokyo <= nowInTokyo) {
    nextRunInTokyo = addDays(nextRunInTokyo, 1);
  }

  return fromZonedTime(nextRunInTokyo, TIMEZONE);
}

export function startDailyNotificationScheduler(env: Env): () => void {
  let timeoutId: NodeJS.Timeout | undefined;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) {
      return;
    }

    const nextRunAt = getNextRunAt();
    const delayMs = Math.max(nextRunAt.getTime() - Date.now(), 1_000);

    console.log(`[scheduler] Next daily notification at ${nextRunAt.toISOString()}`);

    timeoutId = setTimeout(async () => {
      try {
        await sendDailyNotification(env);
      } catch (error) {
        console.error('[scheduler] Daily notification failed:', error);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
