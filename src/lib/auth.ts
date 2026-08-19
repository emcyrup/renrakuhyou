import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const SESSION_COOKIE = 'renrakuhyou_session';
const SESSION_HOURS = 12;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET が設定されていません（.env を確認してください）');
  return value;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** 確認者のログインパスワードを検証する。 */
export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD が設定されていません（.env を確認してください）');
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSessionToken(name: string): string {
  const payload = `${Buffer.from(name).toString('base64url')}.${Date.now() + SESSION_HOURS * 3_600_000}`;
  return `${payload}.${sign(payload)}`;
}

/** セッション Cookie を検証し、確認者名を返す。 */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [nameB64, expiresAt, signature] = parts;
  const expected = sign(`${nameB64}.${expiresAt}`);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  if (Number(expiresAt) < Date.now()) return null;

  return Buffer.from(nameB64, 'base64url').toString();
}

export async function currentUser(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** 確認者向け画面のガード。未ログインなら /login へ送る。 */
export async function requireUser(): Promise<string> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
