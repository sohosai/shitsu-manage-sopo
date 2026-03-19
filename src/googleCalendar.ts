import type { Env, CalendarEvent, DailyEvent } from './types.js';
import { startOfDay, endOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Asia/Tokyo';

interface ServiceAccountCredentials {
    client_email: string;
    private_key: string;
}

/**
 * Base64URLエンコード
 */
function base64UrlEncode(data: string): string {
    const base64 = btoa(data);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * サービスアカウントでJWTを生成してアクセストークンを取得
 */
async function getAccessToken(env: Env): Promise<string> {
    const credentials = JSON.parse(
        env.GOOGLE_SERVICE_ACCOUNT_JSON
    ) as ServiceAccountCredentials;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${headerB64}.${payloadB64}`;

    // PEM形式の秘密鍵をインポート
    const pemContents = credentials.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\n/g, '');
    const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(unsignedToken)
    );

    const signatureB64 = base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
    );
    const jwt = `${unsignedToken}.${signatureB64}`;

    // JWTをアクセストークンに交換
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Failed to get access token: ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    return tokenData.access_token;
}

/**
 * Google Calendarにイベントを作成
 */
export async function createCalendarEvent(
    purpose: string,
    organizer: string,
    startTime: string,
    endTime: string,
    env: Env
): Promise<string> {
    const accessToken = await getAccessToken(env);

    const event = {
        summary: purpose,
        description: `主催: ${organizer}`,
        start: {
            dateTime: startTime,
            timeZone: TIMEZONE,
        },
        end: {
            dateTime: endTime,
            timeZone: TIMEZONE,
        },
    };

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(event),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create calendar event: ${errorText}`);
    }

    const data = (await response.json()) as CalendarEvent;
    return data.id;
}

/**
 * Google Calendarからイベントを削除
 */
export async function deleteCalendarEvent(
    eventId: string,
    env: Env
): Promise<void> {
    const accessToken = await getAccessToken(env);

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Failed to delete calendar event: ${errorText}`);
    }
}

/**
 * 本日のイベント一覧を取得
 */
export async function getTodayEvents(env: Env): Promise<DailyEvent[]> {
    const accessToken = await getAccessToken(env);

    const now = new Date();
    const todayInTokyo = toZonedTime(now, TIMEZONE);
    const dayStart = startOfDay(todayInTokyo);
    const dayEnd = endOfDay(todayInTokyo);

    const params = new URLSearchParams({
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        timeZone: TIMEZONE,
    });

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?${params}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get calendar events: ${errorText}`);
    }

    const data = (await response.json()) as { items: CalendarEvent[] };

    return (data.items || []).map((event) => {
        // descriptionから主催者を抽出
        let organizer: string | undefined;
        if (event.description) {
            const match = event.description.match(/主催:\s*(.+)/);
            if (match) {
                organizer = match[1].trim();
            }
        }

        return {
            summary: event.summary,
            startTime: event.start.dateTime,
            endTime: event.end.dateTime,
            organizer,
        };
    });
}

/**
 * 指定期間内のイベントを取得（重複チェック用）
 */
export async function getEventsInRange(
    startTime: string,
    endTime: string,
    env: Env
): Promise<DailyEvent[]> {
    const accessToken = await getAccessToken(env);

    const params = new URLSearchParams({
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: 'true',
        orderBy: 'startTime',
        timeZone: TIMEZONE,
    });

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?${params}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get calendar events: ${errorText}`);
    }

    const data = (await response.json()) as { items: CalendarEvent[] };

    return (data.items || []).map((event) => {
        let organizer: string | undefined;
        if (event.description) {
            const match = event.description.match(/主催:\s*(.+)/);
            if (match) {
                organizer = match[1].trim();
            }
        }

        return {
            summary: event.summary,
            startTime: event.start.dateTime,
            endTime: event.end.dateTime,
            organizer,
        };
    });
}

/**
 * API接続テスト（ステータスチェック用）
 */
export async function checkCalendarConnection(env: Env): Promise<{ ok: boolean; error?: string }> {
    try {
        const accessToken = await getAccessToken(env);

        const response = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            return { ok: false, error: `Calendar API: ${response.status}` };
        }

        return { ok: true };
    } catch (error) {
        return { ok: false, error: String(error) };
    }
}
