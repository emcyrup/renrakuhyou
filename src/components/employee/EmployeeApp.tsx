'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AiPanel from '@/components/employee/AiPanel';
import InfoSidebar from '@/components/employee/InfoSidebar';
import Mascot from '@/components/employee/Mascot';
import MessagesPanel from '@/components/employee/MessagesPanel';
import ReportPanel from '@/components/employee/ReportPanel';
import RollCall from '@/components/employee/RollCall';
import SettingsPanel from '@/components/employee/SettingsPanel';
import { useVoiceInput } from '@/components/employee/speech';
import type { EmployeeSnapshot } from '@/lib/employee-view';
import { formatDateTime } from '@/lib/format';
import type { ReportCategory } from '@/lib/types';

type Panel = 'home' | 'in' | 'out' | 'info' | 'report' | 'ai' | 'settings';

const MENU: { id: Panel; label: string; description: string; tone: string }[] = [
  { id: 'in', label: '出勤する', description: '出勤の点呼をします', tone: 'text-emerald-700 bg-emerald-50' },
  { id: 'out', label: '退勤する', description: '退勤の点呼をします', tone: 'text-amber-700 bg-amber-50' },
  { id: 'info', label: '情報を確認する', description: '連絡事項やお知らせを確認', tone: 'text-brand-700 bg-brand-50' },
  { id: 'report', label: '報告する', description: '車両・道路・荷物の報告', tone: 'text-violet-700 bg-violet-50' },
  { id: 'ai', label: 'AI に質問する', description: '何でも AI に聞いてみよう', tone: 'text-pink-700 bg-pink-50' },
];

/** 画面を開いたままでも新しい連絡に気づけるよう、この間隔で自動更新する。 */
const POLL_INTERVAL_MS = 30_000;

/**
 * 従業員の受付画面。
 * 左の大きなボタンで操作を選び、中央にその内容、右に配車・お知らせ・仲間の報告を出す。
 * 開いたままでも内容が古くならないよう、通知の受信時・一定間隔・「更新」で読み直す。
 */
export default function EmployeeApp({
  token,
  vapidPublicKey,
  timeZone,
  mascotUrl,
  initial,
}: {
  token: string;
  vapidPublicKey: string;
  timeZone: string;
  mascotUrl: string | null;
  initial: EmployeeSnapshot;
}) {
  const [panel, setPanel] = useState<Panel>('home');
  const [data, setData] = useState<EmployeeSnapshot>(initial);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(0);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');

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
  const urgentNotice = unacknowledged.some((delivery) => delivery.level === 'high');
  // 急ぎの報告は、確認者が対応するまで（最大 6 時間）画面全体で知らせる。
  const urgentReport = data.reports.some(
    (report) =>
      report.urgent &&
      !report.handled &&
      Date.now() - new Date(`${report.createdAt.replace(' ', 'T')}Z`).getTime() < 6 * 60 * 60 * 1000,
  );
  const alert = urgentNotice || urgentReport;

  const open = (next: Panel) => {
    setRecordedAt(null);
    setError(null);
    setPanel(next);
    if (next === 'info') setArrived(0);
  };

  const acknowledge = async (ackToken: string) => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/push/ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: ackToken }),
      });
      if (!response.ok) throw new Error(`確認を登録できませんでした（${response.status}）`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  const finishRollCall = async (kind: 'in' | 'out') => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/employee/${token}/attendance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const payload = (await response.json().catch(() => null)) as (EmployeeSnapshot & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? `記録できませんでした（${response.status}）`);

      setData(payload);
      setUpdatedAt(Date.now());
      setRecordedAt(payload.attendance?.at ?? new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  const submitReport = async (input: {
    category: ReportCategory;
    body: string;
    urgent: boolean;
    shared: boolean;
  }) => {
    const response = await fetch(`/api/employee/${token}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as (EmployeeSnapshot & { error?: string }) | null;
    if (!response.ok || !payload) throw new Error(payload?.error ?? `報告を送れませんでした（${response.status}）`);

    setData(payload);
    setUpdatedAt(Date.now());
  };

  const askByVoice = (text: string) => {
    setAiQuestion(text);
    setPanel('ai');
  };

  return (
    <div className={`min-h-screen ${alert ? 'bg-red-50' : 'bg-slate-100'}`}>
      <main className="mx-auto max-w-6xl px-4 py-4 lg:px-6 lg:py-5">
        <Header
          companyName={data.companyName}
          name={data.name}
          oneWord={data.oneWord}
          weather={data.weather}
          timeZone={timeZone}
        />

        {arrived > 0 ? (
          <button
            type="button"
            onClick={() => open('info')}
            className="mb-3 w-full rounded-xl bg-brand-500 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm lg:text-base"
          >
            新しい連絡が {arrived} 件届きました。押して開く
          </button>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_18rem] lg:items-start lg:gap-5">
          <nav className="mb-4 grid grid-cols-2 gap-2 lg:mb-0 lg:grid-cols-1 lg:gap-3" aria-label="操作の選択">
            <p className="col-span-2 text-xs font-bold text-slate-500 lg:col-span-1">まずはこちらを選んでね！</p>
            {MENU.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => open(item.id)}
                aria-current={panel === item.id ? 'page' : undefined}
                className={`rounded-xl border p-3 text-left transition lg:p-4 ${
                  panel === item.id
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className={`badge ${item.tone}`}>{item.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                {item.id === 'info' && unacknowledged.length > 0 ? (
                  <span className="mt-1 inline-block rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">
                    未確認 {unacknowledged.length} 件
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => open('settings')}
              className={`rounded-xl border p-3 text-left text-sm transition lg:p-4 ${
                panel === 'settings'
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="font-bold text-slate-700">設定</span>
              <span className="mt-0.5 block text-xs text-slate-500">通知とお名前</span>
              {data.registeredDevices === 0 ? (
                <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800">
                  通知が未設定
                </span>
              ) : null}
            </button>
          </nav>

          <div className="space-y-4">
            {panel === 'home' ? (
              <HomePanel
                data={data}
                alert={alert}
                mascotUrl={mascotUrl}
                unacknowledged={unacknowledged.length}
                onOpenInfo={() => open('info')}
              />
            ) : null}

            {panel === 'in' || panel === 'out' ? (
              <RollCall
                kind={panel}
                name={data.name}
                pending={unacknowledged}
                mascotUrl={mascotUrl}
                busy={working}
                recordedAt={recordedAt}
                onAcknowledge={acknowledge}
                onFinish={() => finishRollCall(panel)}
                onClose={() => open('home')}
              />
            ) : null}

            {panel === 'info' ? <MessagesPanel deliveries={data.deliveries} onClose={() => open('home')} /> : null}

            {panel === 'report' ? <ReportPanel onSubmit={submitReport} onClose={() => open('home')} /> : null}

            {panel === 'ai' ? (
              <AiPanel
                token={token}
                enabled={data.aiEnabled}
                initialQuestion={aiQuestion}
                onClose={() => open('home')}
              />
            ) : null}

            {panel === 'settings' ? (
              <SettingsPanel
                token={token}
                name={data.name}
                vapidPublicKey={vapidPublicKey}
                registeredDevices={data.registeredDevices}
                onSaved={(name) => setData((prev) => ({ ...prev, name }))}
                onClose={() => open('home')}
              />
            ) : null}

            <AskBar
              enabled={data.aiEnabled}
              onAsk={askByVoice}
              onOpen={() => open('ai')}
              updatedAt={updatedAt}
              busy={busy}
              timeZone={timeZone}
              onRefresh={() => void refresh()}
            />
          </div>

          <aside className="mt-4 lg:mt-0">
            <InfoSidebar data={data} onOpenMessages={() => open('info')} onOpenReport={() => open('report')} />
          </aside>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- 見出し

function Header({
  companyName,
  name,
  oneWord,
  weather,
  timeZone,
}: {
  companyName: string;
  name: string;
  oneWord: string;
  weather: EmployeeSnapshot['weather'];
  timeZone: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now ? Number(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone })) : null;
  const greeting = hour === null ? '' : hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'お疲れ様です';

  return (
    <header className="mb-4 gap-4 lg:flex lg:items-start">
      <div className="lg:w-60 lg:shrink-0">
        <p className="text-xs font-bold text-slate-500">{companyName}</p>
        <h1 className="text-lg font-bold text-slate-900 lg:text-xl">AI 受付</h1>
        {oneWord ? (
          <p className="mt-2 hidden rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 lg:block">
            <b className="block text-[0.7rem] text-amber-700">今日のひとこと</b>
            {oneWord}
          </p>
        ) : null}
      </div>

      <div className="hidden flex-1 justify-center lg:flex">
        {greeting ? (
          <p className="h-fit rounded-full bg-white px-6 py-2.5 text-base font-bold text-slate-800 shadow-sm">
            {name} さん、{greeting}！
          </p>
        ) : null}
      </div>

      <div className="card mt-3 flex items-center justify-between px-4 py-2 lg:mt-0 lg:block lg:w-52 lg:text-center">
        <div>
          <p className="text-xl font-bold tabular-nums text-brand-600">
            {now ? now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }) : '--:--'}
          </p>
          <p className="text-xs text-slate-500">
            {now
              ? now.toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                  timeZone,
                })
              : ''}
          </p>
        </div>
        {weather ? (
          <p className="text-xs text-slate-600 lg:mt-1">
            天気 {weather.text}
            {weather.high !== null || weather.low !== null ? (
              <span className="ml-1 whitespace-nowrap">
                {weather.high !== null ? `最高${weather.high}℃` : ''}
                {weather.high !== null && weather.low !== null ? ' / ' : ''}
                {weather.low !== null ? `最低${weather.low}℃` : ''}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- トップ

function HomePanel({
  data,
  alert,
  mascotUrl,
  unacknowledged,
  onOpenInfo,
}: {
  data: EmployeeSnapshot;
  alert: boolean;
  mascotUrl: string | null;
  unacknowledged: number;
  onOpenInfo: () => void;
}) {
  const message = alert
    ? '重要な連絡があります。内容を確認してください。'
    : unacknowledged > 0
      ? `未確認の連絡が ${unacknowledged} 件あります。`
      : '何かあればいつでも聞いてください。';

  return (
    <section className={`card flex min-h-[22rem] flex-col justify-center p-6 lg:p-10 ${alert ? 'border-red-300' : ''}`}>
      <Mascot mood={alert ? 'alert' : 'normal'} imageUrl={mascotUrl} message={message} />

      {data.oneWord ? (
        <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 lg:hidden">
          {data.oneWord}
        </p>
      ) : null}

      {unacknowledged > 0 ? (
        <button type="button" onClick={onOpenInfo} className="btn-primary mx-auto mt-6 w-full max-w-sm py-3 text-base">
          連絡を確認する
        </button>
      ) : null}

      {data.attendance ? (
        <p className="mt-6 text-center text-xs text-slate-500">
          直近の点呼: {data.attendance.kind === 'in' ? '出勤' : '退勤'}（{formatDateTime(data.attendance.at)}）
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- 下部の入力欄

function AskBar({
  enabled,
  onAsk,
  onOpen,
  updatedAt,
  busy,
  timeZone,
  onRefresh,
}: {
  enabled: boolean;
  onAsk: (text: string) => void;
  onOpen: () => void;
  updatedAt: number | null;
  busy: boolean;
  timeZone: string;
  onRefresh: () => void;
}) {
  const voice = useVoiceInput(onAsk);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={!enabled || !voice.supported}
          onClick={voice.listening ? voice.stop : voice.start}
          className={`${voice.listening ? 'btn-danger' : 'btn-primary'} px-6 py-3 text-base`}
        >
          {voice.listening ? '聞き取り中… 止める' : '話しかける'}
        </button>
        <button type="button" disabled={!enabled} onClick={onOpen} className="btn-secondary px-6 py-3 text-base">
          キーボードで入力する
        </button>
      </div>

      <p className="mt-2 text-center text-xs text-slate-500">
        {!enabled
          ? 'AI の設定が未完了のため、今は質問を受け付けられません。'
          : voice.supported
            ? '（例）おはよう ／ 今日の予定は？ ／ 高速の渋滞情報ある？'
            : 'この端末では音声入力に対応していません。キーボードからどうぞ。'}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
        <p className="text-xs text-slate-400">
          最終更新{' '}
          {updatedAt === null
            ? '—'
            : new Date(updatedAt).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone,
              })}
          （自動更新しています）
        </p>
        <button type="button" onClick={onRefresh} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
          {busy ? '更新中…' : '更新'}
        </button>
      </div>
    </section>
  );
}
