import Link from 'next/link';
import { logoutAction } from '@/app/actions';
import { requireUser } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/messages/new', label: '新規連絡' },
  { href: '/dispatches', label: '配車情報' },
  { href: '/reports', label: '報告' },
  { href: '/attendance', label: '点呼' },
  { href: '/employees', label: '従業員' },
  { href: '/logs', label: '送信ログ' },
  { href: '/settings', label: '設定' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-slate-900">
            連絡票
          </Link>

          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form action={logoutAction} className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-500">{user}</span>
            <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
