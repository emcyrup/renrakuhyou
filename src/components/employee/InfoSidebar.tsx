'use client';

import Link from 'next/link';
import type { EmployeeSnapshot } from '@/lib/employee-view';
import { elapsedLabel } from '@/lib/format';
import { REPORT_CATEGORY_LABELS } from '@/lib/types';

/** 画面右の情報欄（本日の配車情報 / 重要なお知らせ / みんなの報告）。 */
export default function InfoSidebar({
  data,
  onOpenMessages,
  onOpenReport,
}: {
  data: EmployeeSnapshot;
  onOpenMessages: () => void;
  onOpenReport: () => void;
}) {
  const notices = data.deliveries.filter((delivery) => delivery.level === 'high').slice(0, 3);

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700">
          本日の配車情報
        </h2>
        {data.dispatches.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-500">登録がありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.dispatches.map((dispatch) => (
              <li
                key={dispatch.id}
                className={`px-4 py-2.5 text-sm ${dispatch.mine ? 'bg-brand-50/60' : ''}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="w-16 shrink-0 font-bold text-slate-700">{dispatch.vehicleNo}</span>
                  <span className="text-slate-800">{dispatch.route}</span>
                  {dispatch.mine ? <span className="badge bg-brand-100 text-brand-700">自分</span> : null}
                </div>
                {dispatch.note ? <p className="mt-0.5 text-xs text-slate-500">{dispatch.note}</p> : null}
                {!dispatch.mine && dispatch.employeeName ? (
                  <p className="mt-0.5 text-xs text-slate-400">{dispatch.employeeName}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700">
          重要なお知らせ
        </h2>
        {notices.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-500">ありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link href={`/ack/${notice.ackToken}`} className="block px-4 py-2.5 hover:bg-slate-50">
                  <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {notice.acknowledgedAt ? '確認済み' : '未確認'} / {elapsedLabel(notice.sentAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-200 p-2.5">
          <button type="button" onClick={onOpenMessages} className="btn-secondary w-full py-1.5 text-xs">
            もっと見る
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">
          みんなの報告
        </h2>
        {data.reports.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-500">まだありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.reports.slice(0, 5).map((report) => (
              <li key={report.id} className="px-4 py-2.5">
                <div className="flex items-baseline gap-1.5">
                  {report.urgent ? <span className="badge bg-red-100 text-red-700">急ぎ</span> : null}
                  <span className="text-xs font-bold text-slate-500">
                    {REPORT_CATEGORY_LABELS[report.category]}
                  </span>
                  <span className="text-xs text-slate-400">{report.employeeName}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-800">{report.body}</p>
                <p className="mt-0.5 text-xs text-slate-400">{elapsedLabel(report.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-200 p-2.5">
          <button type="button" onClick={onOpenReport} className="btn-secondary w-full py-1.5 text-xs">
            報告する
          </button>
        </div>
      </section>
    </div>
  );
}
