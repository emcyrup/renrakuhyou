import Link from 'next/link';
import { runRemindersAction } from '@/app/actions';
import OverduePopup, { type OverdueItem, type PhoneCallItem } from '@/components/OverduePopup';
import { LevelBadge } from '@/components/badges';
import { config } from '@/lib/config';
import { elapsedLabel, formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'warn' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const overdueHours = config.overdueHours;
  const summaries = repo.listMessageSummaries(overdueHours);
  const overdueRows = repo.listOverdueDeliveries(overdueHours);
  const pendingCallRows = repo.listPendingPhoneCalls();

  const overdue: OverdueItem[] = overdueRows.map((row) => ({
    deliveryId: row.id,
    messageId: row.message_id,
    messageTitle: row.message_title,
    level: row.message_level,
    employeeName: row.employee_name,
    department: row.department,
    phone: row.phone,
    sentAtLabel: formatDateTime(row.sent_at),
    elapsedLabel: elapsedLabel(row.sent_at),
  }));

  const pendingCalls: PhoneCallItem[] = pendingCallRows.map((row) => ({
    deliveryId: row.id,
    messageId: row.message_id,
    messageTitle: row.message_title,
    employeeName: row.employee_name,
    phone: row.phone,
    acknowledged: Boolean(row.acknowledged_at),
  }));

  return (
    <>
      <OverduePopup overdue={overdue} pendingCalls={pendingCalls} overdueHours={overdueHours} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">ダッシュボード</h1>
        <div className="ml-auto flex gap-2">
          <form action={runRemindersAction}>
            <button type="submit" className="btn-secondary">
              リマインドを今すぐ送信
            </button>
          </form>
          <Link href="/messages/new" className="btn-primary">
            新規連絡を作成
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="連絡（全体）" value={summaries.length} tone="neutral" />
        <StatCard
          label="送信済み"
          value={summaries.filter((summary) => summary.status === 'sent').length}
          tone="neutral"
        />
        <StatCard label={`未確認（${overdueHours}h超）`} value={overdue.length} tone="danger" />
        <StatCard label="電話連絡 未実施" value={pendingCalls.length} tone="warn" />
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">連絡一覧</h2>
        </div>

        {summaries.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            連絡がまだありません。「新規連絡を作成」から登録してください。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">件名</th>
                  <th className="th">レベル</th>
                  <th className="th">作成</th>
                  <th className="th">確認状況</th>
                  <th className="th">電話連絡</th>
                  <th className="th">未確認</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((summary) => (
                  <tr key={summary.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/messages/${summary.id}`} className="font-semibold text-brand-600 hover:underline">
                        {summary.title}
                      </Link>
                      {summary.status === 'draft' ? (
                        <span className="badge ml-2 bg-slate-100 text-slate-600">未送信</span>
                      ) : null}
                    </td>
                    <td className="td">
                      <LevelBadge level={summary.level} />
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDateTime(summary.created_at)}</td>
                    <td className="td whitespace-nowrap">
                      <span className="font-semibold">{summary.acknowledged}</span>
                      <span className="text-slate-400"> / {summary.total} 人</span>
                    </td>
                    <td className="td whitespace-nowrap">
                      {summary.level === 'high' ? (
                        <>
                          <span className="font-semibold">{summary.phone_called}</span>
                          <span className="text-slate-400"> / {summary.total} 人</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td">
                      {summary.overdue > 0 ? (
                        <span className="badge bg-red-100 text-red-700">{summary.overdue} 人</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
