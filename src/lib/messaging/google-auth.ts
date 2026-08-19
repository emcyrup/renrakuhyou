import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHAT_ISSUER = 'chat@system.gserviceaccount.com';
const CHAT_CERT_URL = 'https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON に client_email / private_key がありません');
  }
  // .env に 1 行で書いた場合の "\n" を実際の改行へ戻す。
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** サービスアカウントの自己署名 JWT を access token に交換する（有効期限までキャッシュ）。 */
export async function getChatAccessToken(scope = 'https://www.googleapis.com/auth/chat.bot'): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const sa = serviceAccount();
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
    // ドメイン全体の委任を使う場合は代理実行するユーザーを指定する。
    ...(process.env.GOOGLE_IMPERSONATE_SUBJECT ? { sub: process.env.GOOGLE_IMPERSONATE_SUBJECT } : {}),
  };

  const signingInput = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google のトークン取得に失敗しました: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

let cachedCerts: { certs: Record<string, string>; fetchedAt: number } | null = null;

async function chatCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() - cachedCerts.fetchedAt < 60 * 60 * 1000) return cachedCerts.certs;
  const res = await fetch(CHAT_CERT_URL);
  if (!res.ok) throw new Error(`Google Chat の公開鍵取得に失敗しました: ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = { certs, fetchedAt: Date.now() };
  return certs;
}

/**
 * Google Chat から届いた Webhook の Authorization: Bearer トークンを検証する。
 * 発行者が chat@system.gserviceaccount.com で、audience が自分のアプリであることを確認する。
 */
export async function verifyChatBearerToken(token: string, audience: string): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) return false;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { kid?: string; alg?: string };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
    iss?: string;
    aud?: string;
    exp?: number;
  };

  if (header.alg !== 'RS256' || !header.kid) return false;
  if (payload.iss !== CHAT_ISSUER) return false;
  if (payload.aud !== audience) return false;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return false;

  const cert = (await chatCerts())[header.kid];
  if (!cert) return false;

  return crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    crypto.createPublicKey({ key: cert, format: 'pem' }),
    Buffer.from(signatureB64, 'base64url'),
  );
}
