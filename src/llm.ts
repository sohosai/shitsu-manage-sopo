import type { Env } from './types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'tngtech/deepseek-r1t2-chimera:free';

interface LLMResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * OpenRouter APIを呼び出してLLMにリクエストを送る
 */
async function callLLM(
    prompt: string,
    systemPrompt: string,
    env: Env
): Promise<string> {
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://shitsu-manage-sopo.workers.dev',
            'X-Title': 'Shitsu Manage Sopo Bot',
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as LLMResponse;
    return data.choices[0]?.message?.content ?? '';
}

/**
 * メッセージを解析して意図を判定する
 */
export async function analyzeIntent(
    message: string,
    env: Env
): Promise<{
    isReservation: boolean;
    isDeletion: boolean;
    eventId?: string;
}> {
    const systemPrompt = `あなたはメッセージの意図を判定するアシスタントです。
ユーザーのメッセージが以下のどちらかを判定してください：
1. 予定の登録リクエスト（目的、主催、開始時刻、終了時刻が含まれる）
2. 予定の削除リクエスト（予約IDが含まれ、削除を依頼している）

必ず以下のJSON形式で回答してください：
{"intent": "reservation"} または {"intent": "deletion", "eventId": "予約ID"} または {"intent": "unknown"}`;

    const result = await callLLM(message, systemPrompt, env);

    try {
        // JSONを抽出（コードブロック内の場合も対応）
        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) {
            return { isReservation: false, isDeletion: false };
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            intent: string;
            eventId?: string;
        };

        return {
            isReservation: parsed.intent === 'reservation',
            isDeletion: parsed.intent === 'deletion',
            eventId: parsed.eventId,
        };
    } catch {
        console.error('Failed to parse intent:', result);
        return { isReservation: false, isDeletion: false };
    }
}

/**
 * メッセージから予約情報を抽出する
 */
export async function extractReservationInfo(
    message: string,
    env: Env
): Promise<{
    purpose: string;
    organizer: string;
    startTime: string;
    endTime: string;
} | null> {
    const systemPrompt = `あなたは予約情報を抽出するアシスタントです。
ユーザーのメッセージから以下の情報を抽出してください：
- 目的 (purpose)
- 主催 (organizer)
- 開始時刻 (startTime): ISO 8601形式 (例: 2026-01-05T16:45:00+09:00)
- 終了時刻 (endTime): ISO 8601形式 (例: 2026-01-05T18:00:00+09:00)

現在の時刻は ${new Date().toISOString()} です。
開始時刻・終了時刻の年について、何も指定がない場合は、${new Date().getFullYear()}年とみなしてください。

必ず以下のJSON形式で回答してください：
{"purpose": "...", "organizer": "...", "startTime": "...", "endTime": "..."}

情報が不足している場合は、不足している項目を "不明" としてください。`;

    const result = await callLLM(message, systemPrompt, env);

    try {
        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) {
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            purpose: string;
            organizer: string;
            startTime: string;
            endTime: string;
        };

        return parsed;
    } catch {
        console.error('Failed to parse reservation info:', result);
        return null;
    }
}
