import { NextResponse } from 'next/server';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/**
 * 従業員ごとの Web App Manifest。
 * start_url を本人のページにすることで、ホーム画面のアイコンから
 * そのまま自分宛の連絡一覧が開くようにする。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const employee = repo.getEmployeeByEnrollToken(token);
  if (!employee) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(
    {
      name: '連絡票',
      short_name: '連絡票',
      description: '会社からの連絡を受け取り、確認を登録します。',
      start_url: `/enroll/${token}`,
      scope: '/',
      display: 'standalone',
      background_color: '#f1f5f9',
      theme_color: '#3b66d4',
      lang: 'ja',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } },
  );
}
