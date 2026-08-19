'use server';

import { revalidatePath } from 'next/cache';
import * as repo from '@/lib/repo';

/**
 * 従業員の「確認」アクション。
 * 認証は連絡ごとに発行した推測困難なトークン（ack_token）で行う。
 */
export async function acknowledgeAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  if (!token) return;

  const delivery = repo.getDeliveryByToken(token);
  if (!delivery) return;

  repo.markAcknowledged(token);
  revalidatePath(`/ack/${token}`);
  revalidatePath(`/messages/${delivery.message_id}`);
  revalidatePath('/');
}
