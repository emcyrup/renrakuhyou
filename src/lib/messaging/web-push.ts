import webpush from 'web-push';
import * as repo from '@/lib/repo';
import type { MessagingProvider, OutgoingMessage, SendResult } from './types';

let configured = false;

function configure(): void {
  if (configured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY が設定されていません（npm run push:keys で生成できます）');
  }

  // subject は push サービスへの連絡先。mailto: か https: の URL である必要がある。
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', publicKey, privateKey);
  configured = true;
}

/** 通知に載せる本文。通知領域は狭いため、詳細は確認画面に譲る。 */
function buildPayload(outgoing: OutgoingMessage, ackToken: string) {
  const { message, employee, ackUrl, kind, elapsedHours } = outgoing;
  const high = message.level === 'high';

  const title =
    kind === 'reminder'
      ? `【未確認】${message.title}`
      : high
        ? `【重要】${message.title}`
        : message.title;

  const body =
    kind === 'reminder'
      ? `${employee.name} さん\n送信から約${elapsedHours ?? 24}時間、確認の登録がありません。内容をご確認ください。`
      : high
        ? `${message.body}\n\n※ 担当者から電話でもご連絡します。`
        : message.body;

  return { title, body: body.slice(0, 300), url: ackUrl, token: ackToken, level: message.level, kind };
}

/**
 * ブラウザの Web Push（PWA）で従業員へ通知するプロバイダ。
 * 従業員は /enroll/[token] を開いて端末を登録しておく必要がある。
 * 外部サービスの契約が不要で、通数課金も人数上限もない。
 */
export const webPushProvider: MessagingProvider = {
  id: 'web_push',
  label: 'アプリ通知（Web Push）',

  isConfigured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  },

  async send(outgoing: OutgoingMessage): Promise<SendResult> {
    configure();

    const subscriptions = repo.listPushSubscriptions(outgoing.employee.id);
    if (subscriptions.length === 0) {
      throw new Error(
        `${outgoing.employee.name} さんの通知設定が未完了です。従業員画面の「通知設定URL」を本人に案内してください。`,
      );
    }

    const ackToken = new URL(outgoing.ackUrl).pathname.split('/').pop() ?? '';
    const payload = buildPayload(outgoing, ackToken);
    const body = JSON.stringify(payload);

    const errors: string[] = [];
    let delivered = 0;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
        repo.markPushSuccess(subscription.id);
        delivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404 / 410 は購読が失効した端末。残しておくと毎回失敗するため削除する。
        if (statusCode === 404 || statusCode === 410) {
          repo.deletePushSubscription(subscription.endpoint);
          errors.push('登録済み端末の通知購読が失効していました');
        } else {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (delivered === 0) {
      throw new Error(`通知を送信できませんでした: ${errors.join(' / ')}`);
    }

    return {
      providerMessageId: `push-${delivered}`,
      payload: { ...payload, devices: delivered, errors },
    };
  },
};
