import { deleteDispatchAction, saveDispatchAction } from '@/app/actions';
import { displayDate } from '@/lib/day';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** 配車情報。ここで登録した内容が、従業員の受付画面の「本日の配車情報」に出る。 */
export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const { date: requested, error } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? '') ? (requested as string) : displayDate();

  const dispatches = repo.listDispatches(date);
  const employees = repo.listEmployees(true);

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">配車情報</h1>
      <p className="mt-1 text-sm text-slate-500">
        登録した内容は、その日の従業員の画面に「本日の配車情報」として表示されます。
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

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

      <section className="card mt-4 p-4">
        <h2 className="text-sm font-bold text-slate-800">追加</h2>
        <form action={saveDispatchAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="date" value={date} />
          <div>
            <label className="label text-xs" htmlFor="new-vehicle">
              車番
            </label>
            <input id="new-vehicle" name="vehicleNo" placeholder="1号車" className="input" required />
          </div>
          <div className="lg:col-span-2">
            <label className="label text-xs" htmlFor="new-route">
              区間・コース
            </label>
            <input id="new-route" name="route" placeholder="大阪 → 名古屋" className="input" required />
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-employee">
              担当
            </label>
            <select id="new-employee" name="employeeId" defaultValue="" className="input">
              <option value="">（未定）</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-note">
              備考
            </label>
            <input id="new-note" name="note" placeholder="集合 6:30" className="input" />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-primary">
              追加する
            </button>
          </div>
        </form>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">
            {date} の配車（{dispatches.length} 件）
          </h2>
        </div>

        {dispatches.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">この日の登録はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">車番</th>
                  <th className="th">区間・コース</th>
                  <th className="th">担当</th>
                  <th className="th">備考</th>
                  <th className="th"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatches.map((dispatch) => (
                  <tr key={dispatch.id}>
                    <td className="td">
                      <input
                        form={`dispatch-${dispatch.id}`}
                        name="vehicleNo"
                        defaultValue={dispatch.vehicle_no}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      <input
                        form={`dispatch-${dispatch.id}`}
                        name="route"
                        defaultValue={dispatch.route}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      <select
                        form={`dispatch-${dispatch.id}`}
                        name="employeeId"
                        defaultValue={dispatch.employee_id ?? ''}
                        className="input py-1 text-xs"
                      >
                        <option value="">（未定）</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td">
                      <input
                        form={`dispatch-${dispatch.id}`}
                        name="note"
                        defaultValue={dispatch.note}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      <div className="flex gap-2">
                        <form action={saveDispatchAction} id={`dispatch-${dispatch.id}`}>
                          <input type="hidden" name="id" value={dispatch.id} />
                          <input type="hidden" name="date" value={date} />
                          <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                            保存
                          </button>
                        </form>
                        <form action={deleteDispatchAction}>
                          <input type="hidden" name="id" value={dispatch.id} />
                          <input type="hidden" name="date" value={date} />
                          <button type="submit" className="btn-danger px-3 py-1 text-xs">
                            削除
                          </button>
                        </form>
                      </div>
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
