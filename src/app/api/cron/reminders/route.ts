import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { sendReminders } from '@/lib/delivery-service';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 未確認の従業員へリマインドを送る定期実行エンドポイント。
 * Cloud Scheduler / cron から 10〜30 分おきに叩く想定。
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await sendReminders();
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return POST(request);
}
