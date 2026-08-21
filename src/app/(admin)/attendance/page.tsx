import { dayRangeUtc, displayDate } from '@/lib/day';
import { formatDateTime } from '@/lib/format';
import * as repo from '@/lib/repo';
import { ATTENDANCE_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * 点呼の状況。従業員が受付画面で「出勤する」「退勤する」を押した記録を日ごとに見る。
 * 「伝えた件数」は、その点呼のときに本人が確認した連絡の件数。
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: requested } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? '') ? (requested as string) : displayDate();

  const [from, to] = dayRangeUtc(date);
  const records = repo.listAttendanceBetween(from, to);
  const employees = repo.listEmployees(true);

  const checkedIn = new Set(records.filter((row) => row.kind === 'in').map((row) => row.employee_id));
  const checkedOut = new Set(records.filter((row) => row.kind === 'out').map((row) => row.employee_id));
  const notYet = employees.filter((employee) => !checkedIn.has(employee.id));

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">点呼</h1>
      <p className="mt-1 text-sm text-slate-500">
        従業員が受付画面から行った出勤・退勤の記録です。連絡はすべて確認してから記録されます。
      </p>

      <form className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label text-xs" htmlFor="date">
            表示する日
          </label>
          <input id="date" type="date" name="date" defaultValue={date} className="input" />
        </div>
        <button type="submit" className="btn-secondary">
          この日を表示
        </button>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <p className="card px-4 py-3 text-sm text-slate-600">
          出勤 <b className="text-lg text-slate-900">{checkedIn.size}</b> 名
        </p>
        <p className="card px-4 py-3 text-sm text-slate-600">
          退勤 <b className="text-lg text-slate-900">{checkedOut.size}</b> 名
        </p>
        <p className="card px-4 py-3 text-sm text-slate-600">
          未点呼 <b className={`text-lg ${notYet.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{notYet.length}</b>{' '}
          名
        </p>
      </div>

      {notYet.length > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          まだ出勤の点呼をしていない従業員: {notYet.map((employee) => employee.name).join('、')}
        </p>
      ) : null}

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">
            {date} の記録（{records.length} 件）
          </h2>
        </div>

        {records.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">この日の記録はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">時刻</th>
                  <th className="th">氏名</th>
                  <th className="th">部署</th>
                  <th className="th">区分</th>
                  <th className="th">伝えた件数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="td">{formatDateTime(record.created_at)}</td>
                    <td className="td font-semibold text-slate-900">{record.employee_name}</td>
                    <td className="td">{record.department}</td>
                    <td className="td">
                      <span
                        className={`badge ${
                          record.kind === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ATTENDANCE_LABELS[record.kind]}
                      </span>
                    </td>
                    <td className="td">{record.told_count} 件</td>
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
