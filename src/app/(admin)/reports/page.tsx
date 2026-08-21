import { deleteReportAction, handleReportAction } from '@/app/actions';
import { elapsedLabel, formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';
import { REPORT_CATEGORY_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** 従業員からの報告（車両・道路・荷物）。急ぎの報告を上に出す。 */
export default async function ReportsPage() {
  const reports = repo.listReports(100);
  const pending = reports.filter((report) => !report.handled_at);
  const handled = reports.filter((report) => report.handled_at);

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">報告</h1>
      <p className="mt-1 text-sm text-slate-500">
        従業員が「報告する」から送った内容です。対応が済んだものは「対応済みにする」で片付けられます。
      </p>

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">未対応（{pending.length} 件）</h2>
        </div>

        {pending.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">未対応の報告はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((report) => (
              <li key={report.id} className={`px-4 py-3 ${report.urgent ? 'bg-red-50' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  {report.urgent ? <span className="badge bg-red-100 text-red-700">急ぎ</span> : null}
                  <span className="badge bg-slate-100 text-slate-700">
                    {REPORT_CATEGORY_LABELS[report.category]}
                  </span>
                  <span className="font-semibold text-slate-900">{report.employee_name}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(report.created_at)}（{elapsedLabel(report.created_at)}）
                  </span>
                  {report.shared === 0 ? (
                    <span className="badge bg-slate-100 text-slate-500">仲間に共有していない</span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{report.body}</p>
                <div className="mt-2 flex gap-2">
                  <form action={handleReportAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                      対応済みにする
                    </button>
                  </form>
                  <form action={deleteReportAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <button type="submit" className="btn-danger px-3 py-1 text-xs">
                      削除
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">対応済み（{handled.length} 件）</h2>
        </div>

        {handled.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">まだありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {handled.map((report) => (
              <li key={report.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="badge bg-slate-100 text-slate-700">
                    {REPORT_CATEGORY_LABELS[report.category]}
                  </span>
                  <span className="text-sm text-slate-700">{report.employee_name}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(report.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{report.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(report.handled_at)} に {report.handled_by} が対応
                </p>
                <form action={handleReportAction} className="mt-2">
                  <input type="hidden" name="id" value={report.id} />
                  <input type="hidden" name="undo" value="on" />
                  <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                    未対応にもどす
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
