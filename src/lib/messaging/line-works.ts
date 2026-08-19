import crypto from 'node:crypto';
import { renderPlainText, type AckEvent, type MessagingProvider, type OutgoingMessage, type SendResult } from './types';

const AUTH_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';
const API_BASE = 'https://www.worksapis.com/v1.0';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** サービスアカウント JWT を access token に交換する（有効期限までキャッシュ）。 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const clientId = requireEnv('LINEWORKS_CLIENT_ID');
  const clientSecret = requireEnv('LINEWORKS_CLIENT_SECRET');
  const serviceAccount = requireEnv('LINEWORKS_SERVICE_ACCOUNT');
  const privateKey = requireEnv('LINEWORKS_PRIVATE_KEY').replace(/\\n/g, '\n');

  const issuedAt = Math.floor(Date.now() / 1000);
  const signingInput =
    `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.` +
    `${base64url(JSON.stringify({ iss: clientId, sub: serviceAccount, iat: issuedAt, exp: issuedAt + 3600 }))}`;
  const assertion = `${signingInput}.${base64url(crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey))}`;

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'bot',
    }),
  });
  if (!res.ok) throw new Error(`LINE WORKS のトークン取得に失敗しました: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in: string | number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in) * 1000 };
  return json.access_token;
}

export const lineWorksProvider: MessagingProvider = {
  id: 'line_works',
  label: 'LINE WORKS',

  isConfigured() {
    return Boolean(process.env.LINEWORKS_CLIENT_ID && process.env.LINEWORKS_BOT_ID);
  },

  async send(outgoing: OutgoingMessage): Promise<SendResult> {
    const botId = requireEnv('LINEWORKS_BOT_ID');
    const ackToken = new URL(outgoing.ackUrl).pathname.split('/').pop() ?? '';

    const payload = {
      content: {
        type: 'button_template',
        contentText: renderPlainText(outgoing),
        actions: [
          { type: 'postback', label: '確認しました', postback: `ack:${ackToken}`, displayText: '確認しました' },
          { type: 'uri', label: '内容を開く', uri: outgoing.ackUrl },
        ],
      },
    };

    const token = await getAccessToken();
    const res = await fetch(
      `${API_BASE}/bots/${botId}/users/${encodeURIComponent(outgoing.employee.provider_user_id)}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(`LINE WORKS への送信に失敗しました: ${res.status} ${await res.text()}`);

    return { payload };
  },

  async handleWebhook(rawBody, headers) {
    const botSecret = requireEnv('LINEWORKS_BOT_SECRET');
    const signature = headers.get('x-works-signature') ?? '';
    const expected = crypto.createHmac('sha256', botSecret).update(rawBody).digest('base64');
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error('LINE WORKS の Webhook 署名が一致しません');
    }

    const body = JSON.parse(rawBody) as { type?: string; data?: string };
    const events: AckEvent[] = [];
    if (body.type === 'postback' && body.data?.startsWith('ack:')) {
      events.push({ ackToken: body.data.slice(4), action: 'ack' });
    }
    return { events };
  },
};
