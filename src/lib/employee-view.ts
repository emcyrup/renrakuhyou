import * as repo from './repo';
import type { Employee, MessageLevel } from './types';

/**
 * 従業員本人のページに渡すデータ。
 * 画面（クライアント側）と更新用 API の両方がこの形を使う。
 * 本文は確認画面で表示するため、ここには含めない。
 */
export interface EmployeeDeliveryView {
  id: number;
  ackToken: string;
  title: string;
  level: MessageLevel;
  sentAt: string | null;
  acknowledgedAt: string | null;
}

export interface EmployeeSnapshot {
  name: string;
  deliveries: EmployeeDeliveryView[];
  registeredDevices: number;
}

export function buildEmployeeSnapshot(employee: Employee): EmployeeSnapshot {
  return {
    name: employee.name,
    deliveries: repo.listDeliveriesForEmployee(employee.id).map((delivery) => ({
      id: delivery.id,
      ackToken: delivery.ack_token,
      title: delivery.message_title,
      level: delivery.message_level,
      sentAt: delivery.sent_at,
      acknowledgedAt: delivery.acknowledged_at,
    })),
    registeredDevices: repo.listPushSubscriptions(employee.id).length,
  };
}
