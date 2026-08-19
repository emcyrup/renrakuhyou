import { notFound } from 'next/navigation';
import { acknowledgeAction } from '@/app/ack/actions';
import { formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** 従業員向けの確認画面。URL のトークンだけでアクセスできる（ログイン不要）。 */
export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const delivery = repo.getDeliveryByToken(token);
  if (!delivery) notFound();

  // 画面を開いた時点を「開封」として記録する。
  repo.markOpened(token);

  const message = repo.getMessage(delivery.message_id);
  if (!message) notFound();

  const acknowledged = Boolean(delivery.acknowledged_at);
  const high = message.level === 'high';

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="card overflow-hidden">
        <div className={`px-5 py-4 ${high ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className={`text-xs font-bold ${high ? 'text-red-700' : 'text-slate-500'}`}>
            {high ? '重要な連絡（レベル高）' : '連絡'}
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">{message.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {delivery.employee_name} さん宛 / 送信 {formatDateTime(delivery.sent_at)}
          </p>
        </div>

        <div className="px-5 py-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{message.body}</p>

          {high ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              この連絡は担当者から電話でもご連絡します。お電話にもご対応をお願いします。
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          {acknowledged ? (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p className="font-semibold">確認済みとして登録されています。</p>
              <p className="mt-0.5 text-xs">{formatDateTime(delivery.acknowledged_at)} に受け付けました。</p>
            </div>
          ) : (
            <form action={acknowledgeAction}>
              <input type="hidden" name="token" value={token} />
              <p className="mb-3 text-sm text-slate-600">
                内容を確認したら、下のボタンを押してください。配信者へ確認済みとして通知されます。
              </p>
              <button type="submit" className="btn-primary w-full py-3 text-base">
                確認しました
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">連絡票</p>
    </main>
  );
}
