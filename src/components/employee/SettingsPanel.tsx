'use client';

import { useState } from 'react';
import PushEnrollment from '@/components/PushEnrollment';

/** 「設定」。通知の設定と、自分の名前の変更。 */
export default function SettingsPanel({
  token,
  name,
  vapidPublicKey,
  registeredDevices,
  onSaved,
  onClose,
}: {
  token: string;
  name: string;
  vapidPublicKey: string;
  registeredDevices: number;
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <NameForm token={token} name={name} onSaved={onSaved} />
      <PushEnrollment enrollToken={token} vapidPublicKey={vapidPublicKey} registeredDevices={registeredDevices} />
      <button type="button" onClick={onClose} className="btn-secondary w-full">
        トップにもどる
      </button>
    </div>
  );
}

function NameForm({ token, name, onSaved }: { token: string; name: string; onSaved: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch(`/api/employee/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: value }),
      });
      const payload = (await response.json().catch(() => null)) as { name?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `保存できませんでした（${response.status}）`);

      const next = payload?.name ?? value.trim();
      setValue(next);
      onSaved(next);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold text-slate-800">お名前</h2>
      <p className="mt-1 text-xs text-slate-500">
        画面と、確認者側の一覧に表示される名前です。変更するとすぐに反映されます。
      </p>

      <form
        className="mt-3 space-y-3 lg:flex lg:max-w-md lg:items-start lg:gap-3 lg:space-y-0"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          aria-label="お名前"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          maxLength={40}
          className="input"
        />
        <button
          type="submit"
          disabled={busy || !value.trim() || value.trim() === name}
          className="btn-primary w-full lg:w-auto lg:shrink-0"
        >
          {busy ? '保存中…' : '名前を変更する'}
        </button>
      </form>

      {saved ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">保存しました。</p> : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
