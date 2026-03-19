import type { Env } from './types.js';

/**
 * Slackリクエストの署名を検証する
 */
export async function verifySlackRequest(
    request: Request,
    body: string,
    env: Env
): Promise<boolean> {
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');

    if (!timestamp || !signature) {
        return false;
    }

    // リプレイ攻撃対策：5分以上前のリクエストは拒否
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 60 * 5) {
        return false;
    }

    // 署名を計算
    const sigBaseString = `v0:${timestamp}:${body}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.SLACK_SIGNING_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(sigBaseString)
    );

    // 16進数に変換
    const computed = 'v0=' + Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return computed === signature;
}

/**
 * Slackにメッセージを送信する
 */
export async function sendSlackMessage(
    channel: string,
    text: string,
    env: Env,
    threadTs?: string
): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
            channel,
            text,
            ...(threadTs && { thread_ts: threadTs }),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
    }
}

/**
 * ユーザーIDからメンション文字列を生成
 */
export function formatUserMention(userId: string): string {
    return `<@${userId}>`;
}
