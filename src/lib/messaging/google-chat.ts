import { db } from '@/lib/db';
import { getChatAccessToken, verifyChatBearerToken } from './google-auth';
import type { AckEvent, MessagingProvider, OutgoingMessage, SendResult } from './types';

const CHAT_API = 'https://chat.googleapis.com/v1';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 送信先スペースを解決する。
 * provider_user_id に spaces/... が入っていればそのまま、users/... またはメールなら DM スペースを引き当てる。
 * 解決結果は employees.provider_space_id にキャッシュする。
 */
async function resolveSpace(employee: OutgoingMessage['employee']): Promise<string> {
  if (employee.provider_space_id) return employee.provider_space_id;

  const raw = employee.provider_user_id.trim();
  if (raw.startsWith('spaces/')) return raw;

  const userName = raw.startsWith('users/') ? raw : `users/${raw}`;
  const token = await getChatAccessToken();
  const res = await fetch(`${CHAT_API}/spaces:findDirectMessage?name=${encodeURIComponent(userName)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Google Chat の DM スペースを解決できません (${res.status}). ` +
        `対象ユーザーが Chat アプリを追加済みか確認してください: ${await res.text()}`,
    );
  }

  const space = ((await res.json()) as { name?: string }).name;
  if (!space) throw new Error('Google Chat の DM スペースが取得できませんでした');

  db().prepare('UPDATE employees SET provider_space_id = ? WHERE id = ?').run(space, employee.id);
  return space;
}

function buildCard(outgoing: OutgoingMessage, ackToken: string) {
  const { message, employee, ackUrl, kind, elapsedHours } = outgoing;
  const high = message.level === 'high';

  const subtitle =
    kind === 'reminder'
      ? `未確認（送信から約${elapsedHours ?? 24}時間経過）`
      : high
        ? 'レベル: 高（確認＋電話連絡が必要です）'
        : 'レベル: 通常';

  const lead =
    kind === 'reminder'
      ? `${escapeHtml(employee.name)} さん<br><b>まだ確認の登録がありません。</b>内容をご確認のうえ「確認しました」を押してください。`
      : `${escapeHtml(employee.name)} さん宛のご連絡です。`;

  return {
    cardsV2: [
      {
        cardId: `renrakuhyou-${ackToken}`,
        card: {
          header: { title: message.title, subtitle },
          sections: [
            { widgets: [{ textParagraph: { text: lead } }] },
            { widgets: [{ textParagraph: { text: escapeHtml(message.body).replace(/\n/g, '<br>') } }] },
            ...(high
              ? [
                  {
                    widgets: [
                      {
                        textParagraph: {
                          text: '<b>※ レベル高の連絡です。</b>担当者から電話でもご連絡します。ご対応をお願いします。',
                        },
                      },
                    ],
                  },
                ]
              : []),
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '確認しました',
                        onClick: {
                          action: { function: 'ack', parameters: [{ key: 'token', value: ackToken }] },
                        },
                      },
                      { text: '内容を開く', onClick: { openLink: { url: ackUrl } } },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

/** Webhook ペイロードから確認イベントを取り出す（新旧いずれのイベント形式にも対応）。 */
function extractAckEvent(body: Record<string, unknown>): AckEvent | null {
  if (body.type !== 'CARD_CLICKED') return null;

  const common = body.common as { invokedFunction?: string; parameters?: Record<string, string> } | undefined;
  if (common?.invokedFunction === 'ack' && common.parameters?.token) {
    return { ackToken: common.parameters.token, action: 'ack' };
  }

  const action = body.action as
    | { actionMethodName?: string; parameters?: { key: string; value: string }[] }
    | undefined;
  if (action?.actionMethodName === 'ack') {
    const token = action.parameters?.find((p) => p.key === 'token')?.value;
    if (token) return { ackToken: token, action: 'ack' };
  }

  return null;
}

export const googleChatProvider: MessagingProvider = {
  id: 'google_chat',
  label: 'Google Chat',

  isConfigured() {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  },

  async send(outgoing: OutgoingMessage): Promise<SendResult> {
    const ackToken = new URL(outgoing.ackUrl).pathname.split('/').pop() ?? '';
    const space = await resolveSpace(outgoing.employee);
    const payload = buildCard(outgoing, ackToken);

    const token = await getChatAccessToken();
    const res = await fetch(`${CHAT_API}/${space}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Google Chat への送信に失敗しました: ${res.status} ${await res.text()}`);

    const json = (await res.json()) as { name?: string };
    return { providerMessageId: json.name, payload };
  },

  async handleWebhook(rawBody, headers) {
    const audience = process.env.GOOGLE_CHAT_AUDIENCE;
    if (!audience) throw new Error('GOOGLE_CHAT_AUDIENCE（Google Cloud のプロジェクト番号）が未設定です');

    const bearer = headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer || !(await verifyChatBearerToken(bearer, audience))) {
      throw new Error('Google Chat の Webhook 認証に失敗しました');
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const event = extractAckEvent(body);

    return {
      events: event ? [event] : [],
      responseBody: event
        ? { text: '確認を受け付けました。ありがとうございます。' }
        : body.type === 'ADDED_TO_SPACE'
          ? { text: '連絡票アプリです。今後こちらに連絡が届きます。' }
          : {},
    };
  },
};
