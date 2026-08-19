import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '連絡票 | 従業員連絡アプリ',
  description: 'メッセージアプリ経由で従業員へ連絡し、開封・確認・電話連絡の状況を管理します。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
