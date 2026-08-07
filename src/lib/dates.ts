// Date helpers for renewal / expiry tracking. Dates are ISO "YYYY-MM-DD".

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Whole days from today until the given ISO date. Negative = already past.
export function daysUntil(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date(todayISO() + 'T00:00:00');
  const diffMs = target.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export type RenewalUrgency = 'overdue' | 'critical' | 'soon' | 'upcoming' | 'ok';

export function urgencyFor(iso: string | undefined | null): RenewalUrgency {
  const d = daysUntil(iso);
  if (d === null) return 'ok';
  if (d < 0) return 'overdue';
  if (d <= 7) return 'critical';
  if (d <= 14) return 'soon';
  if (d <= 30) return 'upcoming';
  return 'ok';
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeRenewal(iso: string | undefined | null): string {
  const d = daysUntil(iso);
  if (d === null) return '—';
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `in ${d}d`;
}

export function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount);
}
