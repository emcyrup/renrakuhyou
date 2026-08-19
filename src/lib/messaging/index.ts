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

export function getProvider(id: ProviderId): MessagingProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`未対応のメッセージサービスです: ${id}`);
  return provider;
}

export function listProviders(): MessagingProvider[] {
  return Object.values(PROVIDERS);
}

/** 従業員登録時の既定プロバイダ。 */
export function defaultProviderId(): ProviderId {
  const configured = process.env.DEFAULT_PROVIDER as ProviderId | undefined;
  return configured && configured in PROVIDERS ? configured : 'mock';
}

export type { MessagingProvider, OutgoingMessage, AckEvent } from './types';
