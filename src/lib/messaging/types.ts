import type { Employee, Message, ProviderId } from '@/lib/types';

export type SendKind = 'initial' | 'reminder';

export interface OutgoingMessage {
  employee: Employee;
  message: Message;
  /** 従業員が開封／確認を行う Web 画面の URL（全プロバイダ共通の確認手段）。 */
  ackUrl: string;
  kind: SendKind;
  /** リマインドの場合、送信からの経過時間（時間単位）。 */
  elapsedHours?: number;
}

export interface SendResult {
  providerMessageId?: string;
  /** 監査ログに残す送信ペイロード。 */
  payload: unknown;
}

/** チャット側のボタン押下などで受け取る確認イベント。 */
export interface AckEvent {
  ackToken: string;
  /** 'open' = 開封のみ、'ack' = 「確認」アクション。 */
  action: 'open' | 'ack';
}

export interface MessagingProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** 送信に必要な環境変数が揃っているか。 */
  isConfigured(): boolean;
  send(outgoing: OutgoingMessage): Promise<SendResult>;
  /**
   * Webhook リクエストを検証し、確認イベントに変換する。
   * 対話ボタンを持たないプロバイダは undefined でよい（Web の確認画面のみ利用）。
   */
  handleWebhook?(rawBody: string, headers: Headers): Promise<{ events: AckEvent[]; responseBody?: unknown }>;
}

/** チャットに載せる本文（プロバイダ共通のプレーンテキスト表現）。 */
export function renderPlainText(outgoing: OutgoingMessage): string {
  const { message, employee, ackUrl, kind, elapsedHours } = outgoing;
  const head =
    kind === 'reminder'
      ? `【未確認のご連絡】${employee.name} さん\n送信から${elapsedHours ?? 24}時間以上、確認の登録がありません。`
      : message.level === 'high'
        ? `【重要／レベル高】${employee.name} さん宛のご連絡です。`
        : `【ご連絡】${employee.name} さん宛のご連絡です。`;

  const levelNote =
    message.level === 'high'
      ? '\n\n※ レベル高の連絡です。内容をご確認のうえ、担当者からの電話にもご対応ください。'
      : '';

  return `${head}\n\n■ ${message.title}\n\n${message.body}${levelNote}\n\n内容の確認と「確認」の登録はこちら:\n${ackUrl}`;
}
