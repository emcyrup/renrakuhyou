import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildEmployeeSnapshot } from '@/lib/employee-view';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

const MAX_NAME_LENGTH = 40;

/**
 * 従業員本人の受付画面が使う API。認証は URL のトークン（enroll_token）で行う。
 *   GET   : 画面の再読み込み（新しい連絡の受信を画面に反映する）
 *   PATCH : 氏名の変更
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(await buildEmployeeSnapshot(employee), { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = String(body?.name ?? '').trim();

  if (!name) return NextResponse.json({ error: '氏名を入力してください。' }, { status: 400 });
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `氏名は ${MAX_NAME_LENGTH} 文字以内で入力してください。` }, { status: 400 });
  }

  repo.renameEmployee(employee.id, name);
  // 確認者側の一覧にもすぐ反映されるようにする。
  revalidatePath('/employees');

  const updated = repo.getEmployeeByEnrollToken(token);
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(await buildEmployeeSnapshot(updated), { headers: { 'cache-control': 'no-store' } });
}
