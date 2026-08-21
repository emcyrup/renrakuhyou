'use client';

import Link from 'next/link';
import type { EmployeeDeliveryView } from '@/lib/employee-view';
import { elapsedLabel, formatDateTime } from '@/lib/format';

/** 「情報を確認する」。自分宛の連絡の一覧。 */
export default function MessagesPanel({
  deliveries,
  onClose,
}: {
  deliveries: EmployeeDeliveryView[];
  onClose: () => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-bold text-slate-900">連絡事項・お知らせ</h2>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 underline">
          とじる
        </button>
      </div>

      {deliveries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">届いている連絡はありません。</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {deliveries.map((delivery) => (
            <li key={delivery.id}>
              <Link href={`/ack/${delivery.ackToken}`} className="block px-5 py-3 hover:bg-slate-50 lg:py-4">
                <div className="flex items-baseline gap-2">
                  {delivery.level === 'high' ? <span className="badge bg-red-100 text-red-700">重要</span> : null}
                  {delivery.acknowledgedAt ? (
                    <span className="badge bg-slate-100 text-slate-600">確認済み</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-800">未確認</span>
                  )}
                  <span className={delivery.acknowledgedAt ? 'text-sm text-slate-700' : 'font-semibold text-slate-900'}>
                    {delivery.title}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {delivery.acknowledgedAt
                    ? `${formatDateTime(delivery.acknowledgedAt)} に確認済み`
                    : `${formatDateTime(delivery.sentAt)}（${elapsedLabel(delivery.sentAt)}）`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
