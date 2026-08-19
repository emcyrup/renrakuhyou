/* 連絡票の Service Worker。通知の受信と、通知からの確認操作を担当する。 */

self.addEventListener('install', () => {
  // 新しい Service Worker を即座に有効化する（通知の仕様変更をすぐ反映するため）。
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * 開いたままになっている画面へ「内容を取り直して」と知らせる。
 * 従業員が本人ページを開きっぱなしでも、連絡の受信がその場で反映されるようにするため。
 */
function notifyOpenWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) client.postMessage({ type: 'renrakuhyou:refresh' });
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '連絡があります', body: event.data.text(), url: '/' };
  }

  const isHigh = payload.level === 'high';

  event.waitUntil(
    Promise.all([
      notifyOpenWindows(),
      self.registration.showNotification(payload.title ?? '連絡があります', {
        body: payload.body ?? '',
        tag: payload.token ? `renrakuhyou-${payload.token}` : 'renrakuhyou',
        renotify: true,
        // レベル高とリマインドは、操作するまで通知を残す。
        requireInteraction: isHigh || payload.kind === 'reminder',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.url ?? '/', token: payload.token ?? '' },
        actions: [
          { action: 'ack', title: '確認しました' },
          { action: 'open', title: '内容を見る' },
        ],
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  const { url, token } = event.notification.data ?? {};
  event.notification.close();

  // 通知上の「確認しました」を押した場合は、画面を開かずに確認だけ登録する。
  if (event.action === 'ack' && token) {
    event.waitUntil(
      fetch('/api/push/ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          // 開いたままの本人ページにも確認済みを反映させる。
          return notifyOpenWindows().then(() =>
            self.registration.showNotification('確認を受け付けました', {
              body: 'ありがとうございます。',
              tag: `renrakuhyou-ack-${token}`,
              icon: '/icon-192.png',
            }),
          );
        })
        .catch(() => self.clients.openWindow(url)),
    );
    return;
  }

  // それ以外は確認画面を開く。すでに開いているタブがあればそれを使う。
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
