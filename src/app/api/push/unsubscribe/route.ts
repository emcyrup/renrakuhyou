import { NextResponse } from 'next/server';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** 端末側で通知を解除したときに、購読情報を削除する。 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  repo.deletePushSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
