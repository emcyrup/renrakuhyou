import type { ProviderId } from '@/lib/types';
import { googleChatProvider } from './google-chat';
import { lineProvider } from './line';
import { lineWorksProvider } from './line-works';
import { mockProvider } from './mock';
import { webPushProvider } from './web-push';
import type { MessagingProvider } from './types';

const PROVIDERS: Record<ProviderId, MessagingProvider> = {
  web_push: webPushProvider,
  google_chat: googleChatProvider,
  line_works: lineWorksProvider,
  line: lineProvider,
  mock: mockProvider,
};

/**
 * 管理画面で選べるサービス。
 * LINE / LINE WORKS は送信の実装だけ残してあり、運用では使わないため選択肢には出さない。
 * （既存の従業員に設定されている場合のみ、その行の選択肢に現在値として表示される）
 */
const SELECTABLE_PROVIDERS: ProviderId[] = ['web_push', 'google_chat', 'mock'];

export function getProvider(id: ProviderId): MessagingProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`未対応のメッセージサービスです: ${id}`);
  return provider;
}

export function listProviders(): MessagingProvider[] {
  return Object.values(PROVIDERS);
}

/** 管理画面の選択肢に出すサービス。 */
export function listSelectableProviders(): MessagingProvider[] {
  return SELECTABLE_PROVIDERS.map((id) => PROVIDERS[id]);
}

/** 従業員登録時の既定プロバイダ。選択肢に無い値が指定された場合は mock に戻す。 */
export function defaultProviderId(): ProviderId {
  const configured = process.env.DEFAULT_PROVIDER as ProviderId | undefined;
  return configured && SELECTABLE_PROVIDERS.includes(configured) ? configured : 'mock';
}

export type { MessagingProvider, OutgoingMessage, AckEvent } from './types';
