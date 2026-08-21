'use client';

import { useEffect, useState } from 'react';
import Mascot from '@/components/employee/Mascot';
import { speak, speechSupported, stopSpeaking } from '@/components/employee/speech';
import type { EmployeeDeliveryView } from '@/lib/employee-view';
import { formatDateTime } from '@/lib/format';
import type { AttendanceKind } from '@/lib/types';

/**
 * 点呼（出勤・退勤）。未確認の連絡を 1 件ずつ伝え、すべて確認してから出退勤を記録する。
 * 読み上げに対応した端末では、そのまま声でも伝える。
 */
export default function RollCall({
  kind,
  name,
  pending,
  mascotUrl,
  busy,
  recordedAt,
  onAcknowledge,
  onFinish,
  onClose,
}: {
  kind: AttendanceKind;
  name: string;
  pending: EmployeeDeliveryView[];
  mascotUrl: string | null;
  busy: boolean;
  recordedAt: string | null;
  onAcknowledge: (ackToken: string) => Promise<void>;
  onFinish: () => Promise<void>;
  onClose: () => void;
}) {
  const [voice, setVoice] = useState(false);
  const label = kind === 'in' ? '出勤' : '退勤';
  const current = pending[0];

  // 表示中の連絡を読み上げる（声を出す設定にしているときだけ）。
  useEffect(() => {
    if (!voice || !current) return;
    speak(`${current.title}。${current.body}`);
    return () => stopSpeaking();
  }, [voice, current]);

  useEffect(() => () => stopSpeaking(), []);

  if (recordedAt) {
    return (
      <section className="card p-6 lg:p-10">
        <Mascot
          mood="done"
          imageUrl={mascotUrl}
          message={
            kind === 'in'
              ? `${name} さん、${label}の点呼が完了しました。今日も安全運転でお願いします。`
              : `${name} さん、本日もお疲れ様でした。${label}を記録しました。`
          }
        />
        <p className="mt-4 text-center text-sm text-slate-500">{formatDateTime(recordedAt)} に記録しました。</p>
        <button type="button" onClick={onClose} className="btn-secondary mx-auto mt-4 block w-full max-w-xs">
          トップにもどる
        </button>
      </section>
    );
  }

  return (
    <section className="card p-5 lg:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-slate-900">{label}の点呼</h2>
        {speechSupported() ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={voice}
              onChange={(event) => {
                setVoice(event.target.checked);
                if (!event.target.checked) stopSpeaking();
              }}
            />
            声で読み上げる
          </label>
        ) : null}
      </div>

      {current ? (
        <>
          <p className="mt-1 text-sm text-slate-500">
            伝える連絡が残り {pending.length} 件あります。内容を確認してください。
          </p>

          <article className={`mt-4 rounded-xl border p-5 ${current.level === 'high' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-baseline gap-2">
              {current.level === 'high' ? <span className="badge bg-red-100 text-red-700">重要</span> : null}
              <h3 className="text-base font-bold text-slate-900 lg:text-lg">{current.title}</h3>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{current.body}</p>
            {current.level === 'high' ? (
              <p className="mt-3 text-sm font-semibold text-red-800">
                この連絡は担当者から電話でもご連絡します。お電話にもご対応をお願いします。
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">{formatDateTime(current.sentAt)}</p>
          </article>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onAcknowledge(current.ackToken)}
            className="btn-primary mt-4 w-full py-4 text-base lg:text-lg"
          >
            {busy ? '登録中…' : '確認しました'}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">伝える連絡はありません。</p>
          <div className="mt-6">
            <Mascot
              mood="normal"
              imageUrl={mascotUrl}
              message={
                kind === 'in'
                  ? `${name} さん、おはようございます。${label}を記録します。`
                  : `${name} さん、お疲れ様でした。${label}を記録します。`
              }
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onFinish()}
            className="btn-primary mx-auto mt-6 block w-full max-w-sm py-4 text-base lg:text-lg"
          >
            {busy ? '記録中…' : `${label}を記録する`}
          </button>
        </>
      )}

      <button type="button" onClick={onClose} className="btn-secondary mx-auto mt-3 block w-full max-w-sm">
        やめる
      </button>
    </section>
  );
}
