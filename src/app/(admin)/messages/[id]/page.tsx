import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  clearPhoneCallAction,
  deleteMessageAction,
  markPhoneCallAction,
  resendDeliveryAction,
  sendMessageAction,
} from '@/app/actions';
import { LevelBadge, StateBadge } from '@/components/badges';
import { ackUrlFor, config } from '@/lib/config';
import { elapsedHours, formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';
import { deliveryState } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MessageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const message = repo.getMessage(Number(id));
  if (!message) notFound();

  const deliveries = repo.listDeliveries(message.id);
  const unsent = deliveries.filter((delivery) => !delivery.sent_at).length;
  const acknowledged = deliveries.filter((delivery) => delivery.acknowledged_at).length;
  const called = deliveries.filter((delivery) => delivery.phone_called_at).length;
  const isMock = deliveries.some((delivery) => delivery.provider === 'mock');

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← 一覧へ
        </Link>
        <LevelBadge level={message.level} />
        <h1 className="w-full text-xl font-bold text-slate-900">{message.title}</h1>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section className="card p-4">
          <h2 className="text-sm font-bold text-slate-800">連絡内容</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{message.body}</p>
        </section>

        <aside className="card space-y-3 p-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">作成</p>
            <p className="text-slate-800">
              {formatDateTime(message.created_at)}
              {message.created_by ? `（${message.created_by}）` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">送信</p>
            <p className="text-slate-800">{message.sent_at ? formatDateTime(message.sent_at) : '未送信'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">確認状況</p>
            <p className="text-slate-800">
              {acknowledged} / {deliveries.length} 人が確認済み
            </p>
            {message.level === 'high' ? (
              <p className="text-slate-800">
                電話連絡 {called} / {deliveries.length} 人
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {unsent > 0 ? (
              <form action={sendMessageAction}>
                <input type="hidden" name="messageId" value={message.id} />
                <button type="submit" className="btn-primary w-full">
                  未送信 {unsent} 件を送信
                </button>
              </form>
            ) : null}
            <form action={deleteMessageAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button type="submit" className="btn-danger w-full">
                この連絡を削除
              </button>
            </form>
          </div>
        </aside>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">送信相手と確認状況</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            「開封」は従業員が確認画面またはチャットのカードを開いた時点、「確認」は従業員が確認ボタンを押した時点です。
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">従業員</th>
                <th className="th">状態</th>
                <th className="th">送信</th>
                <th className="th">開封</th>
                <th className="th">確認</th>
                {message.level === 'high' ? <th className="th">電話連絡</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((delivery) => {
                const state = deliveryState(delivery);
                const overdue = !delivery.acknowledged_at && elapsedHours(delivery.sent_at) >= config.overdueHours;

                return (
                  <tr key={delivery.id} className={overdue ? 'bg-red-50/50' : undefined}>
                    <td className="td">
                      <p className="font-semibold text-slate-900">{delivery.employee_name}</p>
                      <p className="text-xs text-slate-500">
                        {delivery.department}
                        {delivery.phone ? ` / ${delivery.phone}` : ''}
                      </p>
                      {isMock && delivery.provider === 'mock' ? (
                        <a
                          href={ackUrlFor(delivery.ack_token)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-600 hover:underline"
                        >
                          確認画面を開く（モック用）
                        </a>
                      ) : null}
                    </td>

                    <td className="td">
                      <StateBadge state={state} />
                      {delivery.send_error ? (
                        <p className="mt-1 max-w-64 text-xs text-red-600">{delivery.send_error}</p>
                      ) : null}
                      {delivery.reminder_count > 0 ? (
                        <p className="mt-1 text-xs text-slate-500">リマインド {delivery.reminder_count} 回</p>
                      ) : null}
                    </td>

                    <td className="td whitespace-nowrap text-slate-600">
                      {delivery.sent_at ? (
                        formatDateTime(delivery.sent_at)
                      ) : (
                        <form action={resendDeliveryAction}>
                          <input type="hidden" name="deliveryId" value={delivery.id} />
                          <input type="hidden" name="messageId" value={message.id} />
                          <button type="submit" className="text-sm font-medium text-brand-600 hover:underline">
                            送信する
                          </button>
                        </form>
                      )}
                    </td>

                    <td className="td whitespace-nowrap text-slate-600">{formatDateTime(delivery.opened_at)}</td>
                    <td className="td whitespace-nowrap text-slate-600">{formatDateTime(delivery.acknowledged_at)}</td>

                    {message.level === 'high' ? (
                      <td className="td">
                        {delivery.phone_called_at ? (
                          <div className="space-y-1">
                            <p className="text-sm text-emerald-700">
                              実施済み {formatDateTime(delivery.phone_called_at)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {delivery.phone_called_by}
                              {delivery.phone_call_note ? ` / ${delivery.phone_call_note}` : ''}
                            </p>
                            <form action={clearPhoneCallAction}>
                              <input type="hidden" name="deliveryId" value={delivery.id} />
                              <input type="hidden" name="messageId" value={message.id} />
                              <button type="submit" className="text-xs text-slate-500 hover:underline">
                                取り消す
                              </button>
                            </form>
                          </div>
                        ) : (
                          <form action={markPhoneCallAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="deliveryId" value={delivery.id} />
                            <input type="hidden" name="messageId" value={message.id} />
                            <input
                              name="note"
                              className="input w-40 py-1 text-xs"
                              placeholder="メモ（任意）"
                              maxLength={200}
                            />
                            <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                              電話連絡済みにする
                            </button>
                          </form>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
