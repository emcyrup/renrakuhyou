import { deleteEmployeeAction, saveEmployeeAction } from '@/app/actions';
import CopyField from '@/components/CopyField';
import { config } from '@/lib/config';
import { defaultProviderId, listProviders } from '@/lib/messaging';
import * as repo from '@/lib/repo';
import { PROVIDER_LABELS, type ProviderId } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PROVIDER_HINTS: Record<ProviderId, string> = {
  web_push: '入力不要（自動採番されます。従業員には「通知設定URL」を案内してください）',
  google_chat: 'メールアドレス（例: taro@example.co.jp）または users/xxxxx',
  line_works: 'LINE WORKS のユーザー ID またはメールアドレス',
  line: 'LINE のユーザー ID（U から始まる 33 文字）',
  mock: '任意の識別子（外部送信は行いません）',
};

function ProviderSelect({ formId, value }: { formId: string; value: ProviderId }) {
  return (
    <select form={formId} name="provider" defaultValue={value} className="input py-1 text-xs">
      {listProviders().map((provider) => (
        <option key={provider.id} value={provider.id}>
          {PROVIDER_LABELS[provider.id]}
          {provider.isConfigured() ? '' : '（未設定）'}
        </option>
      ))}
    </select>
  );
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const employees = repo.listEmployees();
  const pushCounts = repo.countPushSubscriptionsByEmployee();

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">従業員</h1>
      <p className="mt-1 text-sm text-slate-500">
        連絡の送信相手を登録します。メッセージサービスごとの送信先 ID が必要です。
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card mt-4 p-4">
        <h2 className="text-sm font-bold text-slate-800">新規登録</h2>
        <form action={saveEmployeeAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label text-xs" htmlFor="new-name">
              氏名
            </label>
            <input id="new-name" name="name" className="input" required />
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-department">
              部署
            </label>
            <input id="new-department" name="department" className="input" />
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-phone">
              電話番号
            </label>
            <input id="new-phone" name="phone" className="input" placeholder="レベル高の連絡用" />
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-provider">
              サービス
            </label>
            <select id="new-provider" name="provider" defaultValue={defaultProviderId()} className="input">
              {listProviders().map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {PROVIDER_LABELS[provider.id]}
                  {provider.isConfigured() ? '' : '（未設定）'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs" htmlFor="new-provider-user-id">
              送信先 ID
            </label>
            <input id="new-provider-user-id" name="providerUserId" className="input" />
            <p className="mt-1 text-xs text-slate-500">アプリ通知の場合は空欄で構いません。</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-primary">
              登録する
            </button>
          </div>
        </form>

        <ul className="mt-4 space-y-1 text-xs text-slate-500">
          {listProviders().map((provider) => (
            <li key={provider.id}>
              <span className="font-semibold text-slate-600">{PROVIDER_LABELS[provider.id]}</span>：
              {PROVIDER_HINTS[provider.id]}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">登録済み（{employees.length} 名）</h2>
        </div>

        {employees.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">まだ登録がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[70rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">氏名</th>
                  <th className="th">部署</th>
                  <th className="th">電話番号</th>
                  <th className="th">サービス</th>
                  <th className="th">送信先 ID</th>
                  <th className="th">通知設定</th>
                  <th className="th">有効</th>
                  <th className="th"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="td">
                      <input form={`emp-${employee.id}`} name="name" defaultValue={employee.name} className="input py-1" />
                    </td>
                    <td className="td">
                      <input
                        form={`emp-${employee.id}`}
                        name="department"
                        defaultValue={employee.department}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      <input
                        form={`emp-${employee.id}`}
                        name="phone"
                        defaultValue={employee.phone}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      <ProviderSelect formId={`emp-${employee.id}`} value={employee.provider} />
                    </td>
                    <td className="td">
                      <input
                        form={`emp-${employee.id}`}
                        name="providerUserId"
                        defaultValue={employee.provider_user_id}
                        className="input py-1"
                      />
                    </td>
                    <td className="td">
                      {employee.provider === 'web_push' ? (
                        <div className="space-y-1">
                          {(pushCounts.get(employee.id) ?? 0) > 0 ? (
                            <span className="badge bg-emerald-100 text-emerald-800">
                              設定済み（{pushCounts.get(employee.id)} 台）
                            </span>
                          ) : (
                            <span className="badge bg-red-100 text-red-700">未設定</span>
                          )}
                          <CopyField
                            label={`${employee.name} さんの通知設定URL`}
                            value={`${config.appBaseUrl}/enroll/${employee.enroll_token}`}
                          />
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-center">
                      <input
                        form={`emp-${employee.id}`}
                        type="checkbox"
                        name="active"
                        defaultChecked={employee.active === 1}
                      />
                    </td>
                    <td className="td">
                      <div className="flex gap-2">
                        <form action={saveEmployeeAction} id={`emp-${employee.id}`}>
                          <input type="hidden" name="id" value={employee.id} />
                          <button type="submit" className="btn-secondary px-3 py-1 text-xs">
                            保存
                          </button>
                        </form>
                        <form action={deleteEmployeeAction}>
                          <input type="hidden" name="id" value={employee.id} />
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
