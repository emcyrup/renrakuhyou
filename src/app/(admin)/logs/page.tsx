import { runRemindersAction } from '@/app/actions';
import { config } from '@/lib/config';
import { formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';
import { PROVIDER_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function LogsPage() {
  const logs = repo.listOutboundLogs(100);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">送信ログ</h1>
        <form action={runRemindersAction} className="ml-auto">
          <button type="submit" className="btn-secondary">
            リマインドを今すぐ送信
          </button>
        </form>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        リマインドは送信から {config.overdueHours} 時間経過後、{config.reminderIntervalHours} 時間おきに最大{' '}
        {config.maxReminders} 回まで自動送信されます。
      </p>

      <section className="card mt-4 overflow-hidden">
        {logs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">ログはまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">日時</th>
                  <th className="th">種別</th>
                  <th className="th">サービス</th>
                  <th className="th">宛先</th>
                  <th className="th">件名</th>
                  <th className="th">結果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="td whitespace-nowrap text-slate-500">{formatDateTime(log.created_at)}</td>
                    <td className="td">{log.kind === 'reminder' ? 'リマインド' : '初回送信'}</td>
                    <td className="td">{PROVIDER_LABELS[log.provider]}</td>
                    <td className="td">{log.employee_name ?? '—'}</td>
                    <td className="td">{log.message_title ?? '—'}</td>
                    <td className="td">
                      {log.ok ? (
                        <span className="badge bg-emerald-100 text-emerald-800">成功</span>
                      ) : (
                        <span className="badge bg-red-100 text-red-700" title={log.detail ?? undefined}>
                          失敗
                        </span>
                      )}
                      {log.detail ? <p className="mt-1 max-w-80 text-xs text-red-600">{log.detail}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
