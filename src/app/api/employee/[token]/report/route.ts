import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildEmployeeSnapshot } from '@/lib/employee-view';
import * as repo from '@/lib/repo';
import type { ReportCategory } from '@/lib/types';
import { REPORT_CATEGORY_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_BODY_LENGTH = 500;

/** 従業員からの報告（車両・道路・荷物・その他）を受け取る。 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const payload = (await request.json().catch(() => null)) as {
    category?: string;
    body?: string;
    urgent?: boolean;
    shared?: boolean;
  } | null;

  const category = String(payload?.category ?? '') as ReportCategory;
  const body = String(payload?.body ?? '').trim();

  if (!(category in REPORT_CATEGORY_LABELS)) {
    return NextResponse.json({ error: '報告の種類を選んでください。' }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: '報告の内容を入力してください。' }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `報告は ${MAX_BODY_LENGTH} 文字以内で入力してください。` }, { status: 400 });
  }

  repo.createReport({
    employeeId: employee.id,
    category,
    body,
    urgent: payload?.urgent === true,
    shared: payload?.shared !== false,
  });

  revalidatePath('/');
  revalidatePath('/reports');

  return NextResponse.json(await buildEmployeeSnapshot(employee), { headers: { 'cache-control': 'no-store' } });
}
