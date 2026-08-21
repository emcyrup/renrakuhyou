import { NextResponse } from 'next/server';
import { askAi, isAiConfigured } from '@/lib/ai';
import { buildAiContext, buildEmployeeSnapshot } from '@/lib/employee-view';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** 「AI に質問する」。GET はこれまでのやり取り、POST は質問。 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(
    {
      enabled: isAiConfigured(),
      messages: repo.listAiMessages(employee.id, 20).map((message) => ({
        role: message.role,
        body: message.body,
        createdAt: message.created_at,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const payload = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = String(payload?.question ?? '').trim();

  try {
    const snapshot = await buildEmployeeSnapshot(employee);
    const { answer } = await askAi({ employee, question, context: buildAiContext(snapshot) });
    return NextResponse.json({ answer }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  repo.clearAiMessages(employee.id);
  return NextResponse.json({ ok: true });
}
