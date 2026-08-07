import type { ReactNode } from 'react';
import { urgencyFor, type RenewalUrgency } from '../lib/dates';

// ---- Status + urgency badges -------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'badge badge-green' : 'badge badge-grey';
  return <span className={cls}>{status}</span>;
}

const URGENCY_CLASS: Record<RenewalUrgency, string> = {
  overdue: 'badge badge-red',
  critical: 'badge badge-red',
  soon: 'badge badge-amber',
  upcoming: 'badge badge-blue',
  ok: 'badge badge-grey',
};

export function RenewalBadge({ date, children }: { date?: string; children: ReactNode }) {
  const u = urgencyFor(date);
  return <span className={URGENCY_CLASS[u]}>{children}</span>;
}

// ---- Page header -------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ---- Empty / loading / error states -----------------------------------------

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error-state">⚠ {message}</div>;
}
