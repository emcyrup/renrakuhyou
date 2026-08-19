import { DELIVERY_STATE_LABELS, type DeliveryState, type MessageLevel } from '@/lib/types';

const STATE_STYLES: Record<DeliveryState, string> = {
  pending: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
  sent: 'bg-amber-100 text-amber-800',
  opened: 'bg-sky-100 text-sky-800',
  acknowledged: 'bg-violet-100 text-violet-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

export function StateBadge({ state }: { state: DeliveryState }) {
  return <span className={`badge ${STATE_STYLES[state]}`}>{DELIVERY_STATE_LABELS[state]}</span>;
}

export function LevelBadge({ level }: { level: MessageLevel }) {
  return level === 'high' ? (
    <span className="badge bg-red-100 text-red-700">レベル高</span>
  ) : (
    <span className="badge bg-slate-100 text-slate-600">通常</span>
  );
}
