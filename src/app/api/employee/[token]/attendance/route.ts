import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildEmployeeSnapshot } from '@/lib/employee-view';
import * as repo from '@/lib/repo';
import type { AttendanceKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * 点呼（出勤・退勤）の記録。
 * 画面で未確認の連絡をすべて確認してから呼ばれるため、そのとき伝えた件数も一緒に残す。
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { kind?: string; note?: string } | null;
  const kind = body?.kind;
  if (kind !== 'in' && kind !== 'out') {
    return NextResponse.json({ error: '出勤か退勤かを指定してください。' }, { status: 400 });
  }

  // 前回の点呼のあとに確認された連絡の件数＝この点呼で伝えた件数。
  // 画面からの申告ではなく記録から数えるため、あとから見ても正しい。
  const previous = repo.latestAttendance(employee.id);
  const toldCount = repo
    .listDeliveriesForEmployee(employee.id)
    .filter(
      (delivery) =>
        delivery.acknowledged_at && (!previous || delivery.acknowledged_at >= previous.created_at),
    ).length;

  repo.recordAttendance({
    employeeId: employee.id,
    kind: kind as AttendanceKind,
    toldCount,
    note: String(body?.note ?? '').slice(0, 200),
  });

  revalidatePath('/');
  revalidatePath('/attendance');

  return NextResponse.json(await buildEmployeeSnapshot(employee), { headers: { 'cache-control': 'no-store' } });
}
