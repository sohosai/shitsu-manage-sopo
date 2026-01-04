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
        if (response.status === 429) {
            throw new Error('OpenRouter API rate limit exceeded: リクエスト制限に達したそぽ。しばらく待ってから再度試してほしいそぽ！');
        }
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
    type: 'reservation' | 'deletion' | 'status' | 'today_schedule' | 'unknown';
    eventId?: string;
}> {
    // メンションのみ（空メッセージ）の場合はステータス確認
    const textWithoutMention = message.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!textWithoutMention) {
        return { type: 'status' };
    }

    // キーワードベースの簡易判定（LLM呼び出し前の高速パス）
    const lowerText = textWithoutMention.toLowerCase();

    // 今日の予定パターン
    if (
        lowerText.includes('今日の予定') ||
        lowerText.includes('本日の予定') ||
        lowerText.includes('今日のスケジュール') ||
        lowerText.includes('本日のスケジュール') ||
        lowerText.match(/今日.*予定.*教え/) ||
        lowerText.match(/今日.*予定.*確認/)
    ) {
        return { type: 'today_schedule' };
    }

    // 削除パターン（予約IDを含む）
    const deleteMatch = textWithoutMention.match(/予約ID[：:\s]*([a-zA-Z0-9_-]+).*削除/);
    if (deleteMatch) {
        return { type: 'deletion', eventId: deleteMatch[1] };
    }

    // ステータス確認パターン
    if (
        lowerText.includes('調子') ||
        lowerText.includes('元気') ||
        lowerText.includes('ステータス') ||
        lowerText.includes('status') ||
        lowerText.match(/^(おはよう|こんにちは|こんばんは|お疲れ)$/)
    ) {
        return { type: 'status' };
    }

    const systemPrompt = `あなたはメッセージの意図を判定するアシスタントです。
ユーザーのメッセージが以下のどれかを判定してください：
1. reservation: 予定の登録リクエスト（目的、主催、開始時刻、終了時刻が含まれる）
2. deletion: 予定の削除リクエスト（予約IDが含まれ、削除を依頼している）
3. today_schedule: 今日の予定を確認したい（「今日の予定」「本日のスケジュール」など）
4. status: ステータス確認、ヘルスチェック、調子を聞いている
5. unknown: 上記のどれにも当てはまらない

必ず以下のJSON形式で回答してください：
{"intent": "reservation"} または {"intent": "deletion", "eventId": "予約ID"} または {"intent": "today_schedule"} または {"intent": "status"} または {"intent": "unknown"}`;

    const result = await callLLM(message, systemPrompt, env);

    try {
        // JSONを抽出（コードブロック内の場合も対応）
        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) {
            return { type: 'unknown' };
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            intent: string;
            eventId?: string;
        };

        const intentMap: Record<string, 'reservation' | 'deletion' | 'status' | 'today_schedule' | 'unknown'> = {
            reservation: 'reservation',
            deletion: 'deletion',
            status: 'status',
            today_schedule: 'today_schedule',
            unknown: 'unknown',
        };

        return {
            type: intentMap[parsed.intent] ?? 'unknown',
            eventId: parsed.eventId,
        };
    } catch {
        console.error('Failed to parse intent:', result);
        return { type: 'unknown' };
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
