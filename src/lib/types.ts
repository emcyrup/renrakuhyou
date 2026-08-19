export type ProviderId = 'google_chat' | 'line_works' | 'line' | 'mock';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google_chat: 'Google Chat',
  line_works: 'LINE WORKS',
  line: 'LINE 公式アカウント',
  mock: 'モック（開発用）',
};

export type MessageLevel = 'normal' | 'high';

export const LEVEL_LABELS: Record<MessageLevel, string> = {
  normal: '通常',
  high: '高（開封＋電話連絡が必要）',
};

export interface Employee {
  id: number;
  name: string;
  department: string;
  phone: string;
  provider: ProviderId;
  provider_user_id: string;
  provider_space_id: string;
  active: number;
  created_at: string;
}

export interface Message {
  id: number;
  title: string;
  body: string;
  level: MessageLevel;
  status: 'draft' | 'sent';
  created_by: string;
  created_at: string;
  sent_at: string | null;
}

export interface Delivery {
  id: number;
  message_id: number;
  employee_id: number;
  ack_token: string;
  provider: ProviderId;
  provider_message_id: string | null;
  send_error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  phone_called_at: string | null;
  phone_called_by: string | null;
  phone_call_note: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  created_at: string;
}

/** 配信 + 従業員 + 連絡をまとめた画面表示用の行。 */
export interface DeliveryRow extends Delivery {
  employee_name: string;
  department: string;
  phone: string;
  message_title: string;
  message_level: MessageLevel;
}

export type DeliveryState = 'pending' | 'failed' | 'sent' | 'opened' | 'acknowledged' | 'completed';

export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  pending: '未送信',
  failed: '送信失敗',
  sent: '送信済み（未開封）',
  opened: '開封済み（未確認）',
  acknowledged: '確認済み（電話連絡待ち）',
  completed: '完了',
};

/**
 * 1 件の配信の状態を判定する。
 * レベル高の連絡は「従業員の確認」に加えて「確認者の電話連絡」まで済んで初めて完了とする。
 */
export function deliveryState(d: {
  sent_at: string | null;
  send_error: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  phone_called_at: string | null;
  message_level: MessageLevel;
}): DeliveryState {
  if (d.send_error) return 'failed';
  if (!d.sent_at) return 'pending';
  if (!d.opened_at && !d.acknowledged_at) return 'sent';
  if (!d.acknowledged_at) return 'opened';
  if (d.message_level === 'high' && !d.phone_called_at) return 'acknowledged';
  return 'completed';
}
