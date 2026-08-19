import { NextResponse } from 'next/server';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

interface Body {
  enrollToken?: string;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
}

/** 従業員の端末を通知先として登録する。認証は本人宛の enroll_token で行う。 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;

  const enrollToken = body?.enrollToken;
  const endpoint = body?.subscription?.endpoint;
  const p256dh = body?.subscription?.keys?.p256dh;
  const auth = body?.subscription?.keys?.auth;

  if (!enrollToken || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  const employee = repo.getEmployeeByEnrollToken(enrollToken);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  repo.savePushSubscription({
    employeeId: employee.id,
    endpoint,
    p256dh,
    auth,
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, 200),
  });

  return NextResponse.json({ ok: true });
}
