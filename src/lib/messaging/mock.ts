import { renderPlainText, type MessagingProvider, type OutgoingMessage, type SendResult } from './types';

/**
 * 開発／検証用プロバイダ。外部送信は行わず、送信内容を outbound_logs に残す。
 * 送信ログ画面から確認 URL をたどって従業員側の動作を再現できる。
 */
export const mockProvider: MessagingProvider = {
  id: 'mock',
  label: 'モック（開発用）',

  isConfigured() {
    return true;
  },

  async send(outgoing: OutgoingMessage): Promise<SendResult> {
    const text = renderPlainText(outgoing);
    // eslint-disable-next-line no-console -- 開発用プロバイダの意図的な出力
    console.log(`[mock] to=${outgoing.employee.name} kind=${outgoing.kind}\n${text}\n`);
    return {
      providerMessageId: `mock-${Date.now()}`,
      payload: { to: outgoing.employee.provider_user_id, text, ackUrl: outgoing.ackUrl },
    };
  },
};
