'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, createSessionToken, requireUser, verifyPassword } from '@/lib/auth';
import { resendDelivery, sendMessage, sendReminders } from '@/lib/delivery-service';
import * as repo from '@/lib/repo';
import type { MessageLevel, ProviderId } from '@/lib/types';

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

// ---------------------------------------------------------------- 認証

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const name = text(formData, 'name');
  const password = text(formData, 'password');
  if (!name) return '確認者名を入力してください。';

  try {
    if (!verifyPassword(password)) return 'パスワードが違います。';
  } catch (error) {
    return error instanceof Error ? error.message : 'ログインに失敗しました。';
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(name), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60,
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}

// ---------------------------------------------------------------- 連絡

/** 連絡を作成し、そのまま送信まで行う。 */
export async function createMessageAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const user = await requireUser();

  const title = text(formData, 'title');
  const body = text(formData, 'body');
  const level = (text(formData, 'level') || 'normal') as MessageLevel;
  const employeeIds = formData.getAll('employeeIds').map((value) => Number(value)).filter(Number.isInteger);
  const sendNow = text(formData, 'sendNow') === 'on';

  if (!title) return '件名を入力してください。';
  if (!body) return '連絡内容を入力してください。';
  if (employeeIds.length === 0) return '送信相手を 1 人以上選択してください。';
  if (level !== 'normal' && level !== 'high') return 'レベルの指定が不正です。';

  const messageId = repo.createMessage({ title, body, level, createdBy: user, employeeIds });

  if (sendNow) {
    const summary = await sendMessage(messageId);
    revalidatePath('/');
    if (summary.failed > 0) {
      redirect(`/messages/${messageId}?error=${encodeURIComponent(`${summary.failed} 件の送信に失敗しました`)}`);
    }
  }

  revalidatePath('/');
  redirect(`/messages/${messageId}`);
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  await requireUser();
  const messageId = Number(text(formData, 'messageId'));
  const summary = await sendMessage(messageId);

  revalidatePath('/');
  revalidatePath(`/messages/${messageId}`);
  if (summary.failed > 0) {
    redirect(`/messages/${messageId}?error=${encodeURIComponent(summary.errors.join(' / '))}`);
  }
}

export async function resendDeliveryAction(formData: FormData): Promise<void> {
  await requireUser();
  const deliveryId = Number(text(formData, 'deliveryId'));
  const messageId = Number(text(formData, 'messageId'));

  try {
    await resendDelivery(deliveryId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    redirect(`/messages/${messageId}?error=${encodeURIComponent(detail)}`);
  }
  revalidatePath(`/messages/${messageId}`);
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  await requireUser();
  repo.deleteMessage(Number(text(formData, 'messageId')));
  revalidatePath('/');
  redirect('/');
}

// ---------------------------------------------------------------- 電話連絡（レベル高）

export async function markPhoneCallAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const deliveryId = Number(text(formData, 'deliveryId'));
  repo.setPhoneCall(deliveryId, user, text(formData, 'note'));

  revalidatePath('/');
  revalidatePath(`/messages/${text(formData, 'messageId')}`);
}

export async function clearPhoneCallAction(formData: FormData): Promise<void> {
  await requireUser();
  repo.clearPhoneCall(Number(text(formData, 'deliveryId')));

  revalidatePath('/');
  revalidatePath(`/messages/${text(formData, 'messageId')}`);
}

// ---------------------------------------------------------------- 従業員

export async function saveEmployeeAction(formData: FormData): Promise<void> {
  await requireUser();

  const id = Number(text(formData, 'id')) || 0;
  const input = {
    name: text(formData, 'name'),
    department: text(formData, 'department'),
    phone: text(formData, 'phone'),
    provider: text(formData, 'provider') as ProviderId,
    providerUserId: text(formData, 'providerUserId'),
  };

  const fail = (reason: string) => redirect(`/employees?error=${encodeURIComponent(reason)}`);
  if (!input.name) fail('氏名を入力してください。');
  if (!input.providerUserId) fail('送信先 ID を入力してください。');

  try {
    if (id) {
      repo.updateEmployee(id, { ...input, active: text(formData, 'active') === 'on' });
    } else {
      repo.createEmployee(input);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(detail.includes('UNIQUE') ? '同じ送信先 ID の従業員がすでに登録されています。' : detail);
  }

  revalidatePath('/employees');
  redirect('/employees');
}

export async function deleteEmployeeAction(formData: FormData): Promise<void> {
  await requireUser();
  repo.deleteEmployee(Number(text(formData, 'id')));
  revalidatePath('/employees');
  redirect('/employees');
}

// ---------------------------------------------------------------- リマインド

/** 画面から手動でリマインド処理を走らせる（通常は cron から実行）。 */
export async function runRemindersAction(): Promise<void> {
  await requireUser();
  await sendReminders();
  revalidatePath('/');
  revalidatePath('/logs');
}
