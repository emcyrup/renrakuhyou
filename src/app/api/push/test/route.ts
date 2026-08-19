import webpush from 'web-push';
import { NextResponse } from 'next/server';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** 従業員が自分の端末で通知の到達を確かめるためのテスト送信。 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { enrollToken?: string } | null;
  if (!body?.enrollToken) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const employee = repo.getEmployeeByEnrollToken(body.enrollToken);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys are not configured' }, { status: 503 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', publicKey, privateKey);

  const subscriptions = repo.listPushSubscriptions(employee.id);
  if (subscriptions.length === 0) return NextResponse.json({ error: 'no subscription' }, { status: 409 });

  const payload = JSON.stringify({
    title: 'テスト通知',
    body: `${employee.name} さん、通知は正しく届いています。`,
    url: `/enroll/${body.enrollToken}`,
    level: 'normal',
    kind: 'test',
  });

  let delivered = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      );
      repo.markPushSuccess(subscription.id);
      delivered += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) repo.deletePushSubscription(subscription.endpoint);
    }
  }

  if (delivered === 0) return NextResponse.json({ error: 'delivery failed' }, { status: 502 });
  return NextResponse.json({ ok: true, delivered });
}
