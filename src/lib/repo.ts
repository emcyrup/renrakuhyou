import crypto from 'node:crypto';
import { db, nowIso } from './db';
import type { Delivery, DeliveryRow, Employee, Message, MessageLevel, ProviderId } from './types';

// ---------------------------------------------------------------- 従業員

export function listEmployees(activeOnly = false): Employee[] {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return db().prepare(`SELECT * FROM employees ${where} ORDER BY department, name`).all() as Employee[];
}

export function getEmployee(id: number): Employee | undefined {
  return db().prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | undefined;
}

export function createEmployee(input: {
  name: string;
  department: string;
  phone: string;
  provider: ProviderId;
  providerUserId: string;
}): number {
  const result = db()
    .prepare(
      `INSERT INTO employees (name, department, phone, provider, provider_user_id)
       VALUES (@name, @department, @phone, @provider, @providerUserId)`,
    )
    .run(input);
  return Number(result.lastInsertRowid);
}

export function updateEmployee(
  id: number,
  input: { name: string; department: string; phone: string; provider: ProviderId; providerUserId: string; active: boolean },
): void {
  db()
    .prepare(
      `UPDATE employees
          SET name = @name, department = @department, phone = @phone,
              provider = @provider, provider_user_id = @providerUserId, active = @active,
              provider_space_id = CASE WHEN provider_user_id = @providerUserId THEN provider_space_id ELSE '' END
        WHERE id = @id`,
    )
    .run({ ...input, id, active: input.active ? 1 : 0 });
}

export function deleteEmployee(id: number): void {
  db().prepare('DELETE FROM employees WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- 連絡

export interface MessageSummary extends Message {
  total: number;
  acknowledged: number;
  opened: number;
  phone_called: number;
  overdue: number;
}

/** 連絡一覧（宛先の確認状況つき）。overdue は「送信から一定時間を過ぎても未確認」の件数。 */
export function listMessageSummaries(overdueHours: number): MessageSummary[] {
  return db()
    .prepare(
      `SELECT m.*,
              COUNT(d.id)                                            AS total,
              COUNT(d.acknowledged_at)                               AS acknowledged,
              COUNT(d.opened_at)                                     AS opened,
              COUNT(d.phone_called_at)                               AS phone_called,
              SUM(CASE WHEN d.acknowledged_at IS NULL
                        AND d.sent_at IS NOT NULL
                        AND d.sent_at <= datetime('now', ?) THEN 1 ELSE 0 END) AS overdue
         FROM messages m
         LEFT JOIN deliveries d ON d.message_id = m.id
        GROUP BY m.id
        ORDER BY m.created_at DESC, m.id DESC`,
    )
    .all(`-${overdueHours} hours`) as MessageSummary[];
}

export function getMessage(id: number): Message | undefined {
  return db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

/** 連絡を作成し、選択された送信相手ぶんの配信行を同時に作る。 */
export function createMessage(input: {
  title: string;
  body: string;
  level: MessageLevel;
  createdBy: string;
  employeeIds: number[];
}): number {
  const conn = db();
  const tx = conn.transaction((data: typeof input) => {
    const messageId = Number(
      conn
        .prepare('INSERT INTO messages (title, body, level, created_by) VALUES (?, ?, ?, ?)')
        .run(data.title, data.body, data.level, data.createdBy).lastInsertRowid,
    );

    const insertDelivery = conn.prepare(
      `INSERT INTO deliveries (message_id, employee_id, ack_token, provider)
       VALUES (?, ?, ?, (SELECT provider FROM employees WHERE id = ?))`,
    );
    for (const employeeId of data.employeeIds) {
      insertDelivery.run(messageId, employeeId, crypto.randomBytes(24).toString('base64url'), employeeId);
    }
    return messageId;
  });
  return tx(input);
}

export function deleteMessage(id: number): void {
  db().prepare('DELETE FROM messages WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- 配信

const DELIVERY_ROW_SELECT = `
  SELECT d.*, e.name AS employee_name, e.department, e.phone,
         m.title AS message_title, m.level AS message_level
    FROM deliveries d
    JOIN employees e ON e.id = d.employee_id
    JOIN messages   m ON m.id = d.message_id
`;

export function listDeliveries(messageId: number): DeliveryRow[] {
  return db()
    .prepare(`${DELIVERY_ROW_SELECT} WHERE d.message_id = ? ORDER BY e.department, e.name`)
    .all(messageId) as DeliveryRow[];
}

export function getDeliveryByToken(token: string): DeliveryRow | undefined {
  return db().prepare(`${DELIVERY_ROW_SELECT} WHERE d.ack_token = ?`).get(token) as DeliveryRow | undefined;
}

export function getDelivery(id: number): DeliveryRow | undefined {
  return db().prepare(`${DELIVERY_ROW_SELECT} WHERE d.id = ?`).get(id) as DeliveryRow | undefined;
}

export function markSent(deliveryId: number, providerMessageId: string | null): void {
  db()
    .prepare('UPDATE deliveries SET sent_at = ?, provider_message_id = ?, send_error = NULL WHERE id = ?')
    .run(nowIso(), providerMessageId, deliveryId);
}

export function markSendFailed(deliveryId: number, error: string): void {
  db().prepare('UPDATE deliveries SET send_error = ? WHERE id = ?').run(error.slice(0, 500), deliveryId);
}

/** 開封を記録する（初回のみ）。 */
export function markOpened(token: string): void {
  db()
    .prepare('UPDATE deliveries SET opened_at = COALESCE(opened_at, ?) WHERE ack_token = ?')
    .run(nowIso(), token);
}

/** 従業員の「確認」アクションを記録する。開封時刻が未記録なら同時に埋める。 */
export function markAcknowledged(token: string): boolean {
  const at = nowIso();
  const result = db()
    .prepare(
      `UPDATE deliveries
          SET acknowledged_at = COALESCE(acknowledged_at, ?), opened_at = COALESCE(opened_at, ?)
        WHERE ack_token = ?`,
    )
    .run(at, at, token);
  return result.changes > 0;
}

/** レベル高の連絡に対する電話連絡の実施記録。 */
export function setPhoneCall(deliveryId: number, calledBy: string, note: string): void {
  db()
    .prepare('UPDATE deliveries SET phone_called_at = ?, phone_called_by = ?, phone_call_note = ? WHERE id = ?')
    .run(nowIso(), calledBy, note, deliveryId);
}

export function clearPhoneCall(deliveryId: number): void {
  db()
    .prepare('UPDATE deliveries SET phone_called_at = NULL, phone_called_by = NULL, phone_call_note = NULL WHERE id = ?')
    .run(deliveryId);
}

export function markMessageSent(messageId: number): void {
  db().prepare("UPDATE messages SET status = 'sent', sent_at = COALESCE(sent_at, ?) WHERE id = ?").run(nowIso(), messageId);
}

// ---------------------------------------------------------------- 未確認の抽出

/** 送信から overdueHours を過ぎても従業員の確認が取れていない配信。 */
export function listOverdueDeliveries(overdueHours: number): DeliveryRow[] {
  return db()
    .prepare(
      `${DELIVERY_ROW_SELECT}
        WHERE d.acknowledged_at IS NULL
          AND d.sent_at IS NOT NULL
          AND d.sent_at <= datetime('now', ?)
        ORDER BY d.sent_at ASC`,
    )
    .all(`-${overdueHours} hours`) as DeliveryRow[];
}

/** レベル高で、送信済みなのに電話連絡がまだ記録されていない配信。 */
export function listPendingPhoneCalls(): DeliveryRow[] {
  return db()
    .prepare(
      `${DELIVERY_ROW_SELECT}
        WHERE m.level = 'high'
          AND d.sent_at IS NOT NULL
          AND d.phone_called_at IS NULL
        ORDER BY d.sent_at ASC`,
    )
    .all() as DeliveryRow[];
}

/** リマインド対象：未確認かつ、前回リマインドから間隔が空いていて、上限回数未満のもの。 */
export function listReminderTargets(
  overdueHours: number,
  intervalHours: number,
  maxReminders: number,
): DeliveryRow[] {
  return db()
    .prepare(
      `${DELIVERY_ROW_SELECT}
        WHERE d.acknowledged_at IS NULL
          AND d.sent_at IS NOT NULL
          AND d.send_error IS NULL
          AND d.sent_at <= datetime('now', ?)
          AND d.reminder_count < ?
          AND (d.last_reminder_at IS NULL OR d.last_reminder_at <= datetime('now', ?))
        ORDER BY d.sent_at ASC`,
    )
    .all(`-${overdueHours} hours`, maxReminders, `-${intervalHours} hours`) as DeliveryRow[];
}

export function recordReminderSent(deliveryId: number): void {
  db()
    .prepare('UPDATE deliveries SET reminder_count = reminder_count + 1, last_reminder_at = ? WHERE id = ?')
    .run(nowIso(), deliveryId);
}

// ---------------------------------------------------------------- 送信ログ

export function logOutbound(input: {
  deliveryId: number | null;
  provider: ProviderId;
  kind: 'initial' | 'reminder';
  payload: unknown;
  ok: boolean;
  detail?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO outbound_logs (delivery_id, provider, kind, payload, ok, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.deliveryId,
      input.provider,
      input.kind,
      JSON.stringify(input.payload ?? null),
      input.ok ? 1 : 0,
      input.detail ?? null,
    );
}

export interface OutboundLogRow {
  id: number;
  delivery_id: number | null;
  provider: ProviderId;
  kind: 'initial' | 'reminder';
  payload: string;
  ok: number;
  detail: string | null;
  created_at: string;
  employee_name: string | null;
  message_title: string | null;
  ack_token: string | null;
}

export function listOutboundLogs(limit = 50): OutboundLogRow[] {
  return db()
    .prepare(
      `SELECT l.*, e.name AS employee_name, m.title AS message_title, d.ack_token
         FROM outbound_logs l
         LEFT JOIN deliveries d ON d.id = l.delivery_id
         LEFT JOIN employees  e ON e.id = d.employee_id
         LEFT JOIN messages   m ON m.id = d.message_id
        ORDER BY l.id DESC
        LIMIT ?`,
    )
    .all(limit) as OutboundLogRow[];
}

export type { Delivery };
