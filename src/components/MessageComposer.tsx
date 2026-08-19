'use client';

import { useActionState, useMemo, useState } from 'react';
import { createMessageAction } from '@/app/actions';
import { PROVIDER_LABELS, type ProviderId } from '@/lib/types';

export interface RecipientOption {
  id: number;
  name: string;
  department: string;
  phone: string;
  provider: ProviderId;
}

export default function MessageComposer({ employees }: { employees: RecipientOption[] }) {
  const [error, formAction, pending] = useActionState(createMessageAction, null);
  const [selected, setSelected] = useState<number[]>([]);
  const [level, setLevel] = useState<'normal' | 'high'>('normal');
  const [keyword, setKeyword] = useState('');
  // 送信後は未制御の入力がリセットされるため、入力内容を保持して書き直しを防ぐ。
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const groups = useMemo(() => {
    const filtered = employees.filter(
      (employee) =>
        !keyword ||
        employee.name.includes(keyword) ||
        employee.department.includes(keyword),
    );
    const map = new Map<string, RecipientOption[]>();
    for (const employee of filtered) {
      const key = employee.department || '（部署未設定）';
      map.set(key, [...(map.get(key) ?? []), employee]);
    }
    return [...map.entries()];
  }, [employees, keyword]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const toggleGroup = (members: RecipientOption[]) => {
    const ids = members.map((member) => member.id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  // 電話連絡が必要なレベル高で、電話番号が未登録の宛先を事前に警告する。
  const missingPhone = useMemo(
    () => employees.filter((employee) => selected.includes(employee.id) && !employee.phone),
    [employees, selected],
  );

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="card p-4">
          <div>
            <label className="label" htmlFor="title">
              件名
            </label>
            <input
              id="title"
              name="title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="body">
              連絡内容
            </label>
            <textarea
              id="body"
              name="body"
              className="input min-h-48"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              入力した内容がそのままメッセージアプリへ送られます。
            </p>
          </div>

          <fieldset className="mt-4">
            <legend className="label">レベル</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="level"
                  value="normal"
                  checked={level === 'normal'}
                  onChange={() => setLevel('normal')}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">通常</span>
                  <span className="block text-xs text-slate-500">従業員の「確認」で完了になります。</span>
                </span>
              </label>

              <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3 hover:bg-red-50">
                <input
                  type="radio"
                  name="level"
                  value="high"
                  checked={level === 'high'}
                  onChange={() => setLevel('high')}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-red-700">高</span>
                  <span className="block text-xs text-red-700/80">
                    従業員の「確認」に加えて、確認者による電話連絡の記録が必要です。
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {level === 'high' && missingPhone.length > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            電話番号が未登録の宛先があります（{missingPhone.map((employee) => employee.name).join('、')}）。
            従業員画面から登録しておくと、電話連絡の際に番号を確認できます。
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="sendNow" defaultChecked />
            作成後すぐに送信する
          </label>
          <button type="submit" className="btn-primary ml-auto" disabled={pending || selected.length === 0}>
            {pending ? '処理中…' : `${selected.length} 人へ連絡を作成`}
          </button>
        </div>
      </div>

      <div className="card flex max-h-[36rem] flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">送信相手（{selected.length} 人選択中）</h2>
          <input
            className="input mt-2"
            placeholder="氏名・部署で絞り込み"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {employees.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              従業員が未登録です。先に「従業員」画面から登録してください。
            </p>
          ) : (
            groups.map(([department, members]) => (
              <div key={department} className="py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{department}</p>
                  <button
                    type="button"
                    onClick={() => toggleGroup(members)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    まとめて選択
                  </button>
                </div>

                <ul className="mt-1 space-y-1">
                  {members.map((employee) => (
                    <li key={employee.id}>
                      <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          name="employeeIds"
                          value={employee.id}
                          checked={selected.includes(employee.id)}
                          onChange={() => toggle(employee.id)}
                        />
                        <span className="font-medium text-slate-800">{employee.name}</span>
                        <span className="ml-auto text-xs text-slate-400">{PROVIDER_LABELS[employee.provider]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </form>
  );
}
