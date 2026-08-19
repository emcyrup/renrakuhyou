import { ackUrlFor, config } from './config';
import { getProvider } from './messaging';
import * as repo from './repo';
import type { DeliveryRow, Employee, Message } from './types';

export interface SendSummary {
  sent: number;
  failed: number;
  errors: string[];
}

async function sendOne(delivery: DeliveryRow, message: Message, kind: 'initial' | 'reminder', elapsedHours?: number) {
  const employee = repo.getEmployee(delivery.employee_id);
  if (!employee) throw new Error('送信相手の従業員が見つかりません');
  if (!employee.active) throw new Error(`${employee.name} は無効化されています`);

  const provider = getProvider(employee.provider);
  const result = await provider.send({
    employee,
    message,
    ackUrl: ackUrlFor(delivery.ack_token),
    kind,
    elapsedHours,
  });

  repo.logOutbound({
    deliveryId: delivery.id,
    provider: employee.provider,
    kind,
    payload: result.payload,
    ok: true,
  });
  return result;
}

/** 連絡を、未送信または送信失敗の宛先へ配信する。 */
export async function sendMessage(messageId: number): Promise<SendSummary> {
  const message = repo.getMessage(messageId);
  if (!message) throw new Error('連絡が見つかりません');

  const summary: SendSummary = { sent: 0, failed: 0, errors: [] };

  for (const delivery of repo.listDeliveries(messageId)) {
    if (delivery.sent_at) continue; // 送信済みは二重送信しない
    try {
      const result = await sendOne(delivery, message, 'initial');
      repo.markSent(delivery.id, result.providerMessageId ?? null);
      summary.sent += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      repo.markSendFailed(delivery.id, detail);
      repo.logOutbound({
        deliveryId: delivery.id,
        provider: delivery.provider,
        kind: 'initial',
        payload: null,
        ok: false,
        detail,
      });
      summary.failed += 1;
      summary.errors.push(`${delivery.employee_name}: ${detail}`);
    }
  }

  if (summary.sent > 0) repo.markMessageSent(messageId);
  return summary;
}

/** 1 件の宛先だけ再送する（送信失敗のリトライ用）。 */
export async function resendDelivery(deliveryId: number): Promise<void> {
  const delivery = repo.getDelivery(deliveryId);
  if (!delivery) throw new Error('配信が見つかりません');
  const message = repo.getMessage(delivery.message_id);
  if (!message) throw new Error('連絡が見つかりません');

  try {
    const result = await sendOne(delivery, message, 'initial');
    repo.markSent(delivery.id, result.providerMessageId ?? null);
    repo.markMessageSent(message.id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    repo.markSendFailed(delivery.id, detail);
    repo.logOutbound({
      deliveryId: delivery.id,
      provider: delivery.provider,
      kind: 'initial',
      payload: null,
      ok: false,
      detail,
    });
    throw error;
  }
}

export interface ReminderSummary {
  targets: number;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * 配信から一定時間を過ぎても確認が返ってきていない従業員へリマインドを送る。
 * cron から /api/cron/reminders 経由、または scripts/worker.ts から定期実行する。
 */
export async function sendReminders(): Promise<ReminderSummary> {
  const targets = repo.listReminderTargets(config.overdueHours, config.reminderIntervalHours, config.maxReminders);
  const summary: ReminderSummary = { targets: targets.length, sent: 0, failed: 0, errors: [] };

  for (const delivery of targets) {
    const message = repo.getMessage(delivery.message_id);
    if (!message) continue;

    const elapsedHours = delivery.sent_at
      ? Math.max(1, Math.round((Date.now() - new Date(`${delivery.sent_at.replace(' ', 'T')}Z`).getTime()) / 3_600_000))
      : config.overdueHours;

    try {
      await sendOne(delivery, message, 'reminder', elapsedHours);
      repo.recordReminderSent(delivery.id);
      summary.sent += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      repo.logOutbound({
        deliveryId: delivery.id,
        provider: delivery.provider,
        kind: 'reminder',
        payload: null,
        ok: false,
        detail,
      });
      summary.failed += 1;
      summary.errors.push(`${delivery.employee_name}: ${detail}`);
    }
  }

  return summary;
}

export type { Employee };
