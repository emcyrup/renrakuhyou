import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/**
 * 通知上の「確認しました」から呼ばれる確認 API。
 * 認証は配信ごとに発行した ack_token で行う（画面を開かずに確認だけ登録する）。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const delivery = repo.getDeliveryByToken(body.token);
  if (!delivery) return NextResponse.json({ error: 'not found' }, { status: 404 });

  repo.markAcknowledged(body.token);
  revalidatePath(`/messages/${delivery.message_id}`);
  revalidatePath('/');

  return NextResponse.json({ ok: true });
}
