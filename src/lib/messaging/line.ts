import crypto from 'node:crypto';
import { renderPlainText, type AckEvent, type MessagingProvider, type OutgoingMessage, type SendResult } from './types';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

export const lineProvider: MessagingProvider = {
  id: 'line',
  label: 'LINE 公式アカウント',

  isConfigured() {
    return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
  },

  async send(outgoing: OutgoingMessage): Promise<SendResult> {
    const ackToken = new URL(outgoing.ackUrl).pathname.split('/').pop() ?? '';
    const text = renderPlainText(outgoing);

    const payload = {
      to: outgoing.employee.provider_user_id,
      messages: [
        {
          type: 'template',
          // トーク一覧に表示される代替テキスト（最大 400 字）
          altText: `${outgoing.message.level === 'high' ? '【重要】' : ''}${outgoing.message.title}`.slice(0, 400),
          template: {
            type: 'buttons',
            title: outgoing.message.title.slice(0, 40),
            // buttons テンプレートの text は 60 字まで。全文は後続のテキストメッセージで送る。
            text: (outgoing.kind === 'reminder' ? '未確認の連絡があります' : '内容をご確認ください').slice(0, 60),
            actions: [
              { type: 'postback', label: '確認しました', data: `ack=${ackToken}`, displayText: '確認しました' },
              { type: 'uri', label: '内容を開く', uri: outgoing.ackUrl },
            ],
          },
        },
        { type: 'text', text: text.slice(0, 4900) },
      ],
    };

    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requireEnv('LINE_CHANNEL_ACCESS_TOKEN')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`LINE への送信に失敗しました: ${res.status} ${await res.text()}`);

    return { payload };
  },

  async handleWebhook(rawBody, headers) {
    const signature = headers.get('x-line-signature') ?? '';
    const expected = crypto
      .createHmac('sha256', requireEnv('LINE_CHANNEL_SECRET'))
      .update(rawBody)
      .digest('base64');
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error('LINE の Webhook 署名が一致しません');
    }

    const body = JSON.parse(rawBody) as { events?: { type?: string; postback?: { data?: string } }[] };
    const events: AckEvent[] = [];
    for (const event of body.events ?? []) {
      const data = event.postback?.data;
      if (event.type === 'postback' && data?.startsWith('ack=')) {
        events.push({ ackToken: data.slice(4), action: 'ack' });
      }
    }
    return { events };
  },
};
