import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import EmployeeApp from '@/components/EmployeeApp';
import { buildEmployeeSnapshot } from '@/lib/employee-view';
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
 * 画面は「トップ / メッセージ / 設定」のタブで切り替える（→ components/EmployeeApp）。
 * ここでは最初の表示に使うデータだけを用意し、以降の更新は画面側から API で行う。
 */
export default async function EnrollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) notFound();

  return (
    <EmployeeApp
      token={token}
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''}
      initial={buildEmployeeSnapshot(employee)}
    />
  );
}
