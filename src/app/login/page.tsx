'use client';

import { useActionState, useState } from 'react';
import { loginAction } from '@/app/actions';

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, null);
  // フォームの送信後は未制御の入力がリセットされるため、確認者名だけは保持する。
  const [name, setName] = useState('');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={formAction} className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">連絡票</h1>
        <p className="mt-1 text-sm text-slate-500">確認者としてログインしてください。</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              確認者名
            </label>
            <input
              id="name"
              name="name"
              className="input"
              autoComplete="username"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">電話連絡の実施記録に、この名前が残ります。</p>
          </div>

          <div>
            <label className="label" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={pending}>
          {pending ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  );
}
