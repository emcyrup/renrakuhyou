import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PushEnrollment from '@/components/PushEnrollment';
import { elapsedLabel, formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { themeColor: '#3b66d4' };

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: '連絡票',
    // 従業員ごとの manifest。ホーム画面のアイコンから本人のページが開くようにする。
    manifest: `/api/manifest/${token}`,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: '連絡票' },
    icons: { apple: '/icon-192.png' },
  };
}

/**
 * 従業員本人のページ（ログイン不要・URL のトークンで本人を識別）。
 * 通知の設定と、自分宛の連絡の確認をここで行う。
 */
export default async function EnrollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) notFound();

  const deliveries = repo.listDeliveriesForEmployee(employee.id);
  const unacknowledged = deliveries.filter((delivery) => !delivery.acknowledged_at);
  const registeredDevices = repo.listPushSubscriptions(employee.id).length;

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-4">
        <p className="text-xs font-bold text-slate-500">連絡票</p>
        <h1 className="text-lg font-bold text-slate-900">{employee.name} さんのページ</h1>
      </header>

      <PushEnrollment
        enrollToken={token}
        vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''}
        registeredDevices={registeredDevices}
      />

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-800">
            未確認の連絡{unacknowledged.length > 0 ? `（${unacknowledged.length} 件）` : ''}
          </h2>
        </div>

        {unacknowledged.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">未確認の連絡はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {unacknowledged.map((delivery) => (
              <li key={delivery.id}>
                <Link href={`/ack/${delivery.ack_token}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-baseline gap-2">
                    {delivery.message_level === 'high' ? (
                      <span className="badge bg-red-100 text-red-700">重要</span>
                    ) : null}
                    <span className="font-semibold text-slate-900">{delivery.message_title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(delivery.sent_at)}（{elapsedLabel(delivery.sent_at)}）
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deliveries.length > unacknowledged.length ? (
        <section className="card mt-4 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-800">確認済み</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {deliveries
              .filter((delivery) => delivery.acknowledged_at)
              .map((delivery) => (
                <li key={delivery.id} className="px-5 py-3">
                  <p className="text-sm text-slate-700">{delivery.message_title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(delivery.acknowledged_at)} に確認済み
                  </p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
