'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import PushEnrollment from '@/components/PushEnrollment';
import type { EmployeeDeliveryView, EmployeeSnapshot } from '@/lib/employee-view';
import { elapsedLabel, formatDateTime } from '@/lib/format';

type TabId = 'home' | 'messages' | 'settings';

const TABS: { id: TabId; label: string; description: string }[] = [
  { id: 'home', label: 'トップ', description: '今の状況を見る' },
  { id: 'messages', label: 'メッセージ', description: '届いた連絡を見る' },
  { id: 'settings', label: '設定', description: '通知とお名前' },
];

/** 画面を開いたままでも新しい連絡に気づけるよう、この間隔で自動更新する。 */
const POLL_INTERVAL_MS = 30_000;

function timeLabel(at: number, timeZone: string): string {
  return new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
}

/**
 * 従業員本人のページ。トップ / メッセージ / 設定 を切り替える。
 * スマートフォンでは上部のタブ、パソコンでは左の大きなメニューで切り替え、
 * パソコンでは右側に未確認の連絡と通知の状態を常に表示する。
 *
 * 画面を開いたままでも新しい連絡に気づけるよう、次の 3 つの経路で内容を更新する。
 *   1. 通知を受信したとき（Service Worker からの知らせで即時に更新）
 *   2. 一定間隔の自動更新（画面が表示されている間だけ）
 *   3. 「更新」ボタン（手動）
 */
export default function EmployeeApp({
  token,
  vapidPublicKey,
  timeZone,
  initial,
}: {
  token: string;
  vapidPublicKey: string;
  /** 時刻の表示に使うタイムゾーン（サーバーの TZ_DISPLAY）。一覧の日時と食い違わないように渡す。 */
  timeZone: string;
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
  const openMessages = () => {
    setTab('messages');
    setArrived(0);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-5 lg:max-w-6xl lg:px-6 lg:py-6">
      <header className="mb-3 lg:mb-5 lg:flex lg:items-start lg:gap-4">
        <div className="lg:w-56 lg:shrink-0">
          <p className="text-xs font-bold text-slate-500">連絡票</p>
          <h1 className="text-lg font-bold text-slate-900 lg:text-xl">{data.name} さんのページ</h1>
        </div>
        <Greeting name={data.name} timeZone={timeZone} />
        <Clock timeZone={timeZone} />
      </header>

      <nav className="card mb-3 flex overflow-hidden p-1 lg:hidden" aria-label="画面の切り替え">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => (item.id === 'messages' ? openMessages() : setTab(item.id))}
            aria-current={item.id === tab ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition ${
              item.id === tab ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
            {item.id === 'messages' && unacknowledged.length > 0 ? (
              <span
                className={`inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold ${
                  item.id === tab ? 'bg-white text-brand-600' : 'bg-red-100 text-red-700'
                }`}
              >
                {unacknowledged.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {arrived > 0 ? (
        <button
          type="button"
          onClick={openMessages}
          className="mb-3 w-full rounded-xl bg-brand-500 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm lg:mb-4 lg:text-base"
        >
          新しい連絡が {arrived} 件届きました。押して開く
        </button>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {error}（通信状況をご確認ください）
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)_18rem] lg:items-start lg:gap-5">
        {/* パソコン向けの大きなメニュー */}
        <nav className="hidden lg:flex lg:flex-col lg:gap-3" aria-label="画面の切り替え">
          {TABS.map((item) => (
            <MenuButton
              key={item.id}
              item={item}
              active={item.id === tab}
              badge={item.id === 'messages' ? unacknowledged.length : 0}
              onClick={() => (item.id === 'messages' ? openMessages() : setTab(item.id))}
            />
          ))}
        </nav>

        <div className="space-y-4">
          {tab !== 'settings' ? (
            <div className="lg:hidden">
              <RefreshBar updatedAt={updatedAt} busy={busy} timeZone={timeZone} onRefresh={() => void refresh()} />
            </div>
          ) : null}

          {tab === 'home' ? (
            <HomeTab
              unacknowledged={unacknowledged}
              total={data.deliveries.length}
              registeredDevices={data.registeredDevices}
              onOpenSettings={() => setTab('settings')}
              onOpenMessages={openMessages}
            />
          ) : null}

          {tab === 'messages' ? <MessagesTab deliveries={data.deliveries} /> : null}

          {tab === 'settings' ? (
            <>
              <NameForm token={token} name={data.name} onSaved={(name) => setData((prev) => ({ ...prev, name }))} />
              <PushEnrollment
                enrollToken={token}
                vapidPublicKey={vapidPublicKey}
                registeredDevices={data.registeredDevices}
              />
            </>
          ) : null}
        </div>

        {/* パソコン向けの情報欄。どのタブでも見えるようにする。 */}
        <aside className="hidden lg:block lg:space-y-4">
          <section className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">
                未確認の連絡{unacknowledged.length > 0 ? `（${unacknowledged.length} 件）` : ''}
              </h2>
            </div>
            {unacknowledged.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">ありません</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {unacknowledged.slice(0, 4).map((delivery) => (
                    <li key={delivery.id}>
                      <Link href={`/ack/${delivery.ackToken}`} className="block px-4 py-3 hover:bg-slate-50">
                        <div className="flex items-baseline gap-1.5">
                          {delivery.level === 'high' ? (
                            <span className="badge bg-red-100 text-red-700">重要</span>
                          ) : null}
                          <span className="text-sm font-semibold text-slate-900">{delivery.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(delivery.sentAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-200 p-3">
                  <button type="button" onClick={openMessages} className="btn-secondary w-full">
                    もっと見る
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-bold text-slate-800">通知の状態</h2>
            {data.registeredDevices > 0 ? (
              <>
                <p className="mt-2">
                  <span className="badge bg-emerald-100 text-emerald-800">設定済み</span>
                </p>
                <p className="mt-1.5 text-sm text-slate-600">
                  この端末に連絡が届きます（{data.registeredDevices} 台）
                </p>
              </>
            ) : (
              <>
                <p className="mt-2">
                  <span className="badge bg-amber-100 text-amber-800">未設定</span>
                </p>
                <p className="mt-1.5 text-sm text-amber-800">このままでは連絡が届きません。</p>
                <button type="button" onClick={() => setTab('settings')} className="btn-primary mt-3 w-full">
                  通知の設定へ
                </button>
              </>
            )}
          </section>

          <section className="card p-4">
            <RefreshBar updatedAt={updatedAt} busy={busy} timeZone={timeZone} onRefresh={() => void refresh()} />
          </section>
        </aside>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- 見出し

/** パソコンでのみ表示する時刻。サーバーとの差で表示がずれないよう、画面に出てから動かす。 */
function Clock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <div className="hidden lg:block lg:w-44" aria-hidden />;

  return (
    <div className="card hidden px-4 py-2 text-center lg:block lg:w-44">
      <p className="text-xl font-bold tabular-nums text-brand-600">
        {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })}
      </p>
      <p className="text-xs text-slate-500">
        {now.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          timeZone,
        })}
      </p>
    </div>
  );
}

function Greeting({ name, timeZone }: { name: string; timeZone: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const hour = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone }));
    setGreeting(hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'お疲れ様です');
  }, []);

  return (
    <div className="hidden lg:flex lg:flex-1 lg:justify-center">
      {greeting ? (
        <p className="rounded-full bg-white px-6 py-2.5 text-base font-bold text-slate-800 shadow-sm">
          {name} さん、{greeting}！
        </p>
      ) : null}
    </div>
  );
}

function MenuButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: (typeof TABS)[number];
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
        active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${
          active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <TabIcon id={item.id} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-base font-bold text-slate-900">{item.label}</span>
          {badge > 0 ? (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-100 px-1 text-xs font-bold text-red-700">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="block text-xs text-slate-500">{item.description}</span>
      </span>
    </button>
  );
}

function TabIcon({ id }: { id: TabId }) {
  const props = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };

  if (id === 'home') {
    return (
      <svg {...props}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    );
  }
  if (id === 'messages') {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3.5 7 8.5 6 8.5-6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
    </svg>
  );
}

function RefreshBar({
  updatedAt,
  busy,
  timeZone,
  onRefresh,
}: {
  updatedAt: number | null;
  busy: boolean;
  timeZone: string;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 lg:px-0">
      <p className="text-xs text-slate-500">
        最終更新 {updatedAt === null ? '—' : timeLabel(updatedAt, timeZone)}
        <span className="hidden sm:inline lg:hidden xl:inline">（自動更新しています）</span>
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="btn-secondary shrink-0 whitespace-nowrap px-3 py-1 text-xs"
      >
        {busy ? '更新中…' : '更新'}
      </button>
    </div>
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
    <>
      <section className="card p-5 lg:flex lg:min-h-[24rem] lg:flex-col lg:justify-center lg:p-10 lg:text-center">
        {unacknowledged.length === 0 ? (
          <>
            <p className="text-sm text-slate-600 lg:text-lg">
              <b className="text-slate-900">未確認の連絡はありません。</b>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              新しい連絡が届くと、この画面にも自動で表示されます。
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 lg:text-lg">
              未確認の連絡が <b className="text-lg text-red-600 lg:text-3xl">{unacknowledged.length}</b> 件あります。
            </p>
            <p className="mt-1 text-sm text-slate-500">内容を開いて「確認しました」を押してください。</p>

            <Link
              href={`/ack/${unacknowledged[0].ackToken}`}
              className="btn-primary mt-4 w-full py-3 text-base lg:mx-auto lg:w-80 lg:py-4 lg:text-lg"
            >
              連絡を開く
            </Link>

            {/* スマートフォンでは右側の欄が無いため、ここに一覧を出す */}
            <ul className="mt-4 space-y-2 text-left lg:hidden">
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
              <button type="button" onClick={onOpenMessages} className="btn-secondary mt-3 w-full lg:hidden">
                すべての連絡を見る
              </button>
            ) : null}
          </>
        )}
      </section>

      {registeredDevices === 0 ? (
        <section className="card p-5 lg:hidden">
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
        <p className="px-1 text-xs text-slate-500 lg:text-center">
          これまでに届いた連絡は {total} 件です。「メッセージ」から確認できます。
        </p>
      )}
    </>
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
            <Link href={`/ack/${delivery.ackToken}`} className="block px-5 py-3 hover:bg-slate-50 lg:py-4">
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
