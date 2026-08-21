import Link from 'next/link';
import { runRemindersAction } from '@/app/actions';
import OverduePopup, { type OverdueItem, type PhoneCallItem } from '@/components/OverduePopup';
import { LevelBadge } from '@/components/badges';
import { config } from '@/lib/config';
import { dayRangeUtc } from '@/lib/day';
import { elapsedLabel, formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';
import { REPORT_CATEGORY_LABELS } from '@/lib/types';

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
  const missingPush = repo.listEmployeesMissingPush();

  // 受付画面から届いた報告と、今日の点呼の状況。
  const unhandledReports = repo.listReports(20).filter((report) => !report.handled_at);
  const [from, to] = dayRangeUtc();
  const attendance = repo.listAttendanceBetween(from, to);
  const checkedIn = new Set(attendance.filter((row) => row.kind === 'in').map((row) => row.employee_id));
  const activeEmployees = repo.listEmployees(true);

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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="連絡（全体）" value={summaries.length} tone="neutral" />
        <StatCard label={`未確認（${overdueHours}h超）`} value={overdue.length} tone="danger" />
        <StatCard label="電話連絡 未実施" value={pendingCalls.length} tone="warn" />
        <StatCard label="未対応の報告" value={unhandledReports.length} tone={unhandledReports.length > 0 ? 'warn' : 'neutral'} />
        <StatCard label="本日 出勤の点呼" value={checkedIn.size} tone="neutral" />
        <StatCard
          label="本日 未点呼"
          value={activeEmployees.length - checkedIn.size}
          tone={activeEmployees.length - checkedIn.size > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {unhandledReports.length > 0 ? (
        <section className="card mt-4 overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">従業員からの報告（未対応）</h2>
            <Link href="/reports" className="text-xs font-semibold text-brand-600 hover:underline">
              すべて見る
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {unhandledReports.slice(0, 5).map((report) => (
              <li key={report.id} className={`px-4 py-2.5 ${report.urgent ? 'bg-red-50' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  {report.urgent ? <span className="badge bg-red-100 text-red-700">急ぎ</span> : null}
                  <span className="badge bg-slate-100 text-slate-700">
                    {REPORT_CATEGORY_LABELS[report.category]}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{report.employee_name}</span>
                  <span className="text-xs text-slate-500">{elapsedLabel(report.created_at)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-700">{report.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {missingPush.length > 0 ? (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <h2 className="text-sm font-bold text-amber-900">
            通知設定が未完了の従業員が {missingPush.length} 名います
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            {missingPush.map((employee) => employee.name).join('、')}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            この状態では連絡が届きません。
            <Link href="/employees" className="font-semibold underline">
              従業員画面
            </Link>
            の「通知設定URL」を本人に案内してください。
          </p>
        </section>
      ) : null}

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
