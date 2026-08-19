import MessageComposer from '@/components/MessageComposer';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default function NewMessagePage() {
  const employees = repo.listEmployees(true).map((employee) => ({
    id: employee.id,
    name: employee.name,
    department: employee.department,
    phone: employee.phone,
    provider: employee.provider,
  }));

  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-slate-900">新規連絡</h1>
      <MessageComposer employees={employees} />
    </>
  );
}
