'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import PushEnrollment from '@/components/PushEnrollment';
import type { EmployeeDeliveryView, EmployeeSnapshot } from '@/lib/employee-view';
import { elapsedLabel, formatDateTime } from '@/lib/format';

type TabId = 'home' | 'messages' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'トップ' },
  { id: 'messages', label: 'メッセージ' },
  { id: 'settings', label: '設定' },
];

/** 画面を開いたままでも新しい連絡に気づけるよう、この間隔で自動更新する。 */
const POLL_INTERVAL_MS = 30_000;

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * 従業員本人のページ。トップ / メッセージ / 設定 をタブで切り替える。
 * 画面を開いたままでも新しい連絡に気づけるよう、次の 3 つの経路で内容を更新する。
 *   1. 一定間隔の自動更新（画面が表示されている間だけ）
 *   2. 通知を受信したとき（Service Worker からの通知で即時に更新）
 *   3. 「更新」ボタン（手動）
 */
export default function EmployeeApp({
  token,
  vapidPublicKey,
  initial,
}: {
  token: string;
  vapidPublicKey: string;
  initial: EmployeeSnapshot;
}) {
  const [tab, setTab] = useState<TabId>('home');
  const [data, setData] = useState<EmployeeSnapshot>(initial);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(0);

  // 画面を開いてから届いた連絡を見分けるために、既に知っている配信の ID を覚えておく。
  const knownIds = useRef(new Set(initial.deliveries.map((delivery) => delivery.id)));

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/${token}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`更新できませんでした（${response.status}）`);

      const next = (await response.json()) as EmployeeSnapshot;
      const fresh = next.deliveries.filter(
        (delivery) => !knownIds.current.has(delivery.id) && !delivery.acknowledgedAt,
      );
      for (const delivery of next.deliveries) knownIds.current.add(delivery.id);

      if (fresh.length > 0) setArrived((count) => count + fresh.length);
      setData(next);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [token]);

  // サーバーで描画した内容がいつ時点のものかを示す（表示は画面側の時計に合わせる）。
  useEffect(() => {
    setUpdatedAt(Date.now());
  }, []);

  // 自動更新。画面が隠れている間は動かさず、戻ってきた時点ですぐ更新する。
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  // 通知を受け取った時点で Service Worker が知らせてくれるので、待たずに更新する。
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'renrakuhyou:refresh') void refresh();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refresh]);

  const unacknowledged = data.deliveries.filter((delivery) => !delivery.acknowledgedAt);

  return (
    <main className="mx-auto max-w-xl px-4 py-5">
      <header className="mb-3">
        <p className="text-xs font-bold text-slate-500">連絡票</p>
        <h1 className="text-lg font-bold text-slate-900">{data.name} さんのページ</h1>
      </header>

      <nav className="card mb-3 flex overflow-hidden p-1" aria-label="画面の切り替え">
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                if (item.id === 'messages') setArrived(0);
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                active ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
              {item.id === 'messages' && unacknowledged.length > 0 ? (
                <span
                  className={`ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-bold ${
                    active ? 'bg-white text-brand-600' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {unacknowledged.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {arrived > 0 ? (
        <button
          type="button"
          onClick={() => {
            setTab('messages');
            setArrived(0);
          }}
          className="mb-3 w-full rounded-xl bg-brand-500 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm"
        >
          新しい連絡が {arrived} 件届きました。タップして開く
        </button>
      ) : null}

      {tab !== 'settings' ? (
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-slate-500">
            最終更新 {updatedAt === null ? '—' : timeLabel(updatedAt)}
            <span className="hidden sm:inline">（自動更新しています）</span>
          </p>
          <button type="button" onClick={() => void refresh()} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
            {busy ? '更新中…' : '更新'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {error}（通信状況をご確認ください）
        </p>
      ) : null}

      {tab === 'home' ? (
        <HomeTab
          unacknowledged={unacknowledged}
          total={data.deliveries.length}
          registeredDevices={data.registeredDevices}
          onOpenSettings={() => setTab('settings')}
          onOpenMessages={() => setTab('messages')}
        />
      ) : null}

      {tab === 'messages' ? <MessagesTab deliveries={data.deliveries} /> : null}

      {tab === 'settings' ? (
        <div className="space-y-4">
          <NameForm token={token} name={data.name} onSaved={(name) => setData((prev) => ({ ...prev, name }))} />
          <PushEnrollment
            enrollToken={token}
            vapidPublicKey={vapidPublicKey}
            registeredDevices={data.registeredDevices}
          />
        </div>
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------- トップ

function HomeTab({
  unacknowledged,
  total,
  registeredDevices,
  onOpenSettings,
  onOpenMessages,
}: {
  unacknowledged: EmployeeDeliveryView[];
  total: number;
  registeredDevices: number;
  onOpenSettings: () => void;
  onOpenMessages: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="card p-5">
        {unacknowledged.length === 0 ? (
          <p className="text-sm text-slate-600">
            <b className="text-slate-900">未確認の連絡はありません。</b>
            <br />
            新しい連絡が届くと、この画面にも自動で表示されます。
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              未確認の連絡が <b className="text-lg text-red-600">{unacknowledged.length}</b> 件あります。
              内容を開いて「確認しました」を押してください。
            </p>
            <ul className="mt-3 space-y-2">
              {unacknowledged.slice(0, 5).map((delivery) => (
                <li key={delivery.id}>
                  <Link
                    href={`/ack/${delivery.ackToken}`}
                    className="block rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-baseline gap-2">
                      {delivery.level === 'high' ? <span className="badge bg-red-100 text-red-700">重要</span> : null}
                      <span className="font-semibold text-slate-900">{delivery.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(delivery.sentAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
            {unacknowledged.length > 5 ? (
              <button type="button" onClick={onOpenMessages} className="btn-secondary mt-3 w-full">
                すべての連絡を見る
              </button>
            ) : null}
          </>
        )}
      </section>

      {registeredDevices === 0 ? (
        <section className="card p-5">
          <p className="text-sm text-amber-800">
            <b>通知の設定がまだ完了していません。</b>
            <br />
            このままでは連絡が届いたことに気づけません。「設定」から通知を有効にしてください。
          </p>
          <button type="button" onClick={onOpenSettings} className="btn-primary mt-3 w-full py-3 text-base">
            通知の設定へ
          </button>
        </section>
      ) : (
        <p className="px-1 text-xs text-slate-500">
          これまでに届いた連絡は {total} 件です。「メッセージ」から確認できます。
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- メッセージ

function MessagesTab({ deliveries }: { deliveries: EmployeeDeliveryView[] }) {
  if (deliveries.length === 0) {
    return (
      <section className="card p-8">
        <p className="text-center text-sm text-slate-500">届いている連絡はありません。</p>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {deliveries.map((delivery) => (
          <li key={delivery.id}>
            <Link href={`/ack/${delivery.ackToken}`} className="block px-5 py-3 hover:bg-slate-50">
              <div className="flex items-baseline gap-2">
                {delivery.level === 'high' ? <span className="badge bg-red-100 text-red-700">重要</span> : null}
                {delivery.acknowledgedAt ? (
                  <span className="badge bg-slate-100 text-slate-600">確認済み</span>
                ) : (
                  <span className="badge bg-amber-100 text-amber-800">未確認</span>
                )}
                <span
                  className={delivery.acknowledgedAt ? 'text-sm text-slate-700' : 'font-semibold text-slate-900'}
                >
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
    </section>
  );
}

// ---------------------------------------------------------------- 設定（氏名）

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
        className="mt-3 space-y-3"
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
        <button type="submit" disabled={busy || !value.trim() || value.trim() === name} className="btn-primary w-full">
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
