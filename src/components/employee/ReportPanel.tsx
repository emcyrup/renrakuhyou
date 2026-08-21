'use client';

import { useState } from 'react';
import { useVoiceInput } from '@/components/employee/speech';
import type { ReportCategory } from '@/lib/types';
import { REPORT_CATEGORY_LABELS } from '@/lib/types';

const CATEGORIES: { id: ReportCategory; hint: string }[] = [
  { id: 'vehicle', hint: '故障・傷・警告灯など' },
  { id: 'road', hint: '渋滞・通行止め・事故など' },
  { id: 'cargo', hint: '荷物・納品先の変更など' },
  { id: 'other', hint: '上記以外' },
];

/** 「報告する」。車両・道路・荷物などを会社へ報告し、仲間にも共有する。 */
export default function ReportPanel({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: { category: ReportCategory; body: string; urgent: boolean; shared: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ReportCategory>('vehicle');
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voice = useVoiceInput((text) => setBody((prev) => (prev ? `${prev} ${text}` : text)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ category, body: body.trim(), urgent, shared });
      setBody('');
      setUrgent(false);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="card p-6 text-center lg:p-10">
        <p className="text-lg font-bold text-slate-900">報告を受け付けました。</p>
        <p className="mt-2 text-sm text-slate-600">
          会社に届きました。{shared ? '仲間の画面にも表示されます。' : ''}
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <button type="button" onClick={() => setDone(false)} className="btn-secondary">
            続けて報告する
          </button>
          <button type="button" onClick={onClose} className="btn-primary">
            トップにもどる
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 lg:p-8">
      <h2 className="text-lg font-bold text-slate-900">報告する</h2>
      <p className="mt-1 text-sm text-slate-500">車両・道路・荷物のことを会社に報告します。</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            aria-pressed={category === item.id}
            className={`rounded-xl border p-3 text-left transition ${
              category === item.id
                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <span className="block text-base font-bold text-slate-900">{REPORT_CATEGORY_LABELS[item.id]}</span>
            <span className="block text-xs text-slate-500">{item.hint}</span>
          </button>
        ))}
      </div>

      <label className="label mt-4" htmlFor="report-body">
        内容
      </label>
      <textarea
        id="report-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        maxLength={500}
        placeholder="例）名神高速の上り、一部工事で渋滞しています。"
        className="input"
      />

      {voice.supported ? (
        <button
          type="button"
          onClick={voice.listening ? voice.stop : voice.start}
          className={`mt-2 ${voice.listening ? 'btn-danger' : 'btn-secondary'} w-full`}
        >
          {voice.listening ? '聞き取りを止める' : '声で入力する'}
        </button>
      ) : null}

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />
          <span>
            <b className="text-red-700">急ぎの報告</b>（事故・故障など、すぐ知らせたいこと）
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
          仲間の画面にも共有する
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={() => void submit()}
        className="btn-primary mt-4 w-full py-4 text-base"
      >
        {busy ? '送信中…' : '報告する'}
      </button>
      <button type="button" onClick={onClose} className="btn-secondary mt-2 w-full">
        やめる
      </button>
    </section>
  );
}
