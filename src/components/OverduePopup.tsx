'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export interface OverdueItem {
  deliveryId: number;
  messageId: number;
  messageTitle: string;
  level: 'normal' | 'high';
  employeeName: string;
  department: string;
  phone: string;
  sentAtLabel: string;
  elapsedLabel: string;
}

export interface PhoneCallItem {
  deliveryId: number;
  messageId: number;
  messageTitle: string;
  employeeName: string;
  phone: string;
  acknowledged: boolean;
}

/**
 * 未確認（既定で 24 時間以上）の連絡と、レベル高で電話連絡が未実施の宛先を
 * 画面を開いた時点でポップアップ表示する。
 * 同じ内容で繰り返し出ないよう、閉じた状態はタブ内（sessionStorage）に保持する。
 */
export default function OverduePopup({
  overdue,
  pendingCalls,
  overdueHours,
}: {
  overdue: OverdueItem[];
  pendingCalls: PhoneCallItem[];
  overdueHours: number;
}) {
  const signature = useMemo(
    () =>
      [
        ...overdue.map((item) => `o${item.deliveryId}`),
        ...pendingCalls.map((item) => `p${item.deliveryId}`),
      ].join(','),
    [overdue, pendingCalls],
  );

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!signature) return;
    if (sessionStorage.getItem('renrakuhyou.alert.dismissed') === signature) return;
    setOpen(true);
  }, [signature]);

  if (!open) return null;

  const dismiss = () => {
    sessionStorage.setItem('renrakuhyou.alert.dismissed', signature);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="overdue-popup-title"
    >
      <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-red-50 px-5 py-4">
          <div>
            <h2 id="overdue-popup-title" className="text-base font-bold text-red-800">
              未確認の連絡があります
            </h2>
            <p className="mt-0.5 text-sm text-red-700">
              送信から {overdueHours} 時間以上が経過しても確認が返ってきていない連絡と、電話連絡が未実施の宛先です。
            </p>
          </div>
          <button type="button" onClick={dismiss} className="ml-auto text-slate-400 hover:text-slate-700" aria-label="閉じる">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {overdue.length > 0 ? (
            <section>
              <h3 className="text-sm font-bold text-slate-800">未確認（{overdue.length} 件）</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {overdue.map((item) => (
                  <li key={item.deliveryId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                    <span className="font-semibold text-slate-900">{item.employeeName}</span>
                    {item.department ? <span className="text-xs text-slate-500">{item.department}</span> : null}
                    {item.level === 'high' ? <span className="badge bg-red-100 text-red-700">レベル高</span> : null}
                    <Link href={`/messages/${item.messageId}`} className="text-sm text-brand-600 hover:underline">
                      {item.messageTitle}
                    </Link>
                    <span className="ml-auto text-xs text-slate-500">
                      送信 {item.sentAtLabel}（{item.elapsedLabel}）
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pendingCalls.length > 0 ? (
            <section>
              <h3 className="text-sm font-bold text-slate-800">電話連絡が未実施（{pendingCalls.length} 件）</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {pendingCalls.map((item) => (
                  <li key={item.deliveryId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                    <span className="font-semibold text-slate-900">{item.employeeName}</span>
                    {item.phone ? <span className="text-xs text-slate-500">{item.phone}</span> : null}
                    <Link href={`/messages/${item.messageId}`} className="text-sm text-brand-600 hover:underline">
                      {item.messageTitle}
                    </Link>
                    <span className="ml-auto text-xs text-slate-500">
                      {item.acknowledged ? '本人確認済み' : '本人未確認'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={dismiss} className="btn-secondary">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
