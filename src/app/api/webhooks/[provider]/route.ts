import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/messaging';
import * as repo from '@/lib/repo';
import type { ProviderId } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * メッセージサービスからのコールバック受信口。
 * チャット上の「確認しました」ボタンが押されると、ここで確認済みとして記録する。
 *
 *   Google Chat  : POST /api/webhooks/google_chat
 *   LINE WORKS   : POST /api/webhooks/line_works
 *   LINE         : POST /api/webhooks/line
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;

  let provider;
  try {
    provider = getProvider(providerId as ProviderId);
  } catch {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }

  if (!provider.handleWebhook) {
    return NextResponse.json({ error: 'webhook not supported' }, { status: 400 });
  }

  const rawBody = await request.text();

  let result;
  try {
    result = await provider.handleWebhook(rawBody, request.headers);
  } catch (error) {
    // 署名・トークン検証の失敗はここに入る。詳細は返さない。
    console.error('[webhook] 検証に失敗しました', error);
    return NextResponse.json({ error: 'invalid request' }, { status: 401 });
  }

  for (const event of result.events) {
    const delivery = repo.getDeliveryByToken(event.ackToken);
    if (!delivery) continue;
    if (event.action === 'ack') {
      repo.markAcknowledged(event.ackToken);
    } else {
      repo.markOpened(event.ackToken);
    }
  }

  return NextResponse.json(result.responseBody ?? {});
}
