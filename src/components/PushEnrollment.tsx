'use client';

import { useCallback, useEffect, useState } from 'react';

type Status =
  | 'checking'
  | 'needs-install' // iOS でホーム画面に追加されていない
  | 'unsupported' // 通知に対応していないブラウザ
  | 'ready' // 通知を有効にできる
  | 'denied' // 通知がブロックされている
  | 'enabled'; // 登録済み

/** VAPID の公開鍵（base64url）を subscribe() が受け取る形式へ変換する。 */
function toApplicationServerKey(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS は Mac として名乗るため、タッチ対応も合わせて判定する。
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PushEnrollment({
  enrollToken,
  vapidPublicKey,
  registeredDevices,
}: {
  enrollToken: string;
  vapidPublicKey: string;
  registeredDevices: number;
}) {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const detect = useCallback(async () => {
    if (!vapidPublicKey) {
      setStatus('unsupported');
      setError('サーバー側の通知設定（VAPID 鍵）が未設定です。管理者にご連絡ください。');
      return;
    }

    // iOS はホーム画面に追加した場合のみ通知を受け取れる。
    if (isIos() && !isStandalone()) {
      setStatus('needs-install');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setStatus(subscription ? 'enabled' : 'ready');
  }, [vapidPublicKey]);

  useEffect(() => {
    void detect();
  }, [detect]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'ready');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(vapidPublicKey) as BufferSource,
        }));

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollToken, subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error(`登録に失敗しました（${response.status}）`);

      setStatus('enabled');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollToken }),
      });
      if (!response.ok) throw new Error(`テスト通知を送れませんでした（${response.status}）`);
      setTestSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold text-slate-800">通知の設定</h2>

      {status === 'checking' ? <p className="mt-2 text-sm text-slate-500">確認中…</p> : null}

      {status === 'needs-install' ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-700">
            iPhone / iPad では、<b>ホーム画面に追加</b>すると通知を受け取れるようになります。
            下の手順どおりに操作してください。
          </p>
          <ol className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <li>
              1. 画面下の<b>共有ボタン</b>（□に↑のマーク）を押す
            </li>
            <li>
              2. メニューを下にたどって<b>「ホーム画面に追加」</b>を選ぶ
            </li>
            <li>3. 右上の「追加」を押す</li>
            <li>
              4. ホーム画面にできた<b>「連絡票」アイコン</b>から開き直す
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            ※ Safari で開いている必要があります。設定は最初の一度だけです。
          </p>
        </div>
      ) : null}

      {status === 'unsupported' ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error ?? 'このブラウザは通知に対応していません。Safari（iPhone）または Chrome（Android）でお試しください。'}
        </p>
      ) : null}

      {status === 'denied' ? (
        <div className="mt-2 space-y-2">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            通知がブロックされています。端末の設定から「連絡票」の通知を許可してください。
          </p>
          <button type="button" onClick={() => void detect()} className="btn-secondary">
            許可したので再確認する
          </button>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-700">
            下のボタンを押して通知を許可すると、会社からの連絡がこの端末に届きます。
          </p>
          <button type="button" onClick={enable} disabled={busy} className="btn-primary w-full py-3 text-base">
            {busy ? '設定中…' : '通知を有効にする'}
          </button>
        </div>
      ) : null}

      {status === 'enabled' ? (
        <div className="mt-2 space-y-3">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <b>設定は完了しています。</b>
            この端末に連絡が届きます{registeredDevices > 1 ? `（登録済みの端末: ${registeredDevices} 台）` : ''}。
          </p>
          <button type="button" onClick={sendTest} disabled={busy} className="btn-secondary">
            {busy ? '送信中…' : 'テスト通知を送る'}
          </button>
          {testSent ? (
            <p className="text-xs text-slate-500">
              テスト通知を送りました。数秒経っても届かない場合は、端末の通知設定をご確認ください。
            </p>
          ) : null}
        </div>
      ) : null}

      {error && status !== 'unsupported' ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
