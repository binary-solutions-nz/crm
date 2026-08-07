// Builds the "upcoming renewals" digest from Firestore and sends it via Graph.

import type { firestore } from 'firebase-admin';
import { sendGraphMail } from './graphMailer';

export interface ReminderConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
  recipients: string[];
  windowDays: number; // include renewals due within this many days
  includeWarranties: boolean;
}

interface RenewalRow {
  kind: 'Subscription' | 'Warranty';
  name: string;
  clientName: string;
  vendor?: string;
  date: string; // YYYY-MM-DD
  days: number; // days until (negative = overdue)
  cost?: number;
}

const SUBSCRIPTION_CATEGORY_LABELS: Record<string, string> = {
  'software-license': 'Software License',
  'saas-subscription': 'SaaS Subscription',
  domain: 'Domain',
  'ssl-certificate': 'SSL Certificate',
  'hardware-warranty': 'Hardware Warranty',
  'support-contract': 'Support Contract',
  other: 'Other',
};

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function money(cost?: number): string {
  if (cost == null || Number.isNaN(cost)) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cost);
}

function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} day(s) OVERDUE`;
  if (days === 0) return 'Due TODAY';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export interface ReminderResult {
  totalItems: number;
  sent: boolean;
  message: string;
}

export async function buildAndSendReminders(
  db: firestore.Firestore,
  cfg: ReminderConfig
): Promise<ReminderResult> {
  // Build a clientId -> name lookup.
  const clientsSnap = await db.collection('clients').get();
  const clientNames = new Map<string, string>();
  clientsSnap.forEach((d) => clientNames.set(d.id, (d.data().name as string) ?? 'Unknown client'));

  const rows: RenewalRow[] = [];

  // Active subscriptions.
  const subsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();
  subsSnap.forEach((doc) => {
    const s = doc.data();
    const date = s.renewalDate as string | undefined;
    if (!date) return;
    const days = daysUntil(date);
    if (days === null || days > cfg.windowDays) return;
    const cat = SUBSCRIPTION_CATEGORY_LABELS[s.category as string] ?? (s.category as string);
    rows.push({
      kind: 'Subscription',
      name: s.name as string,
      clientName: clientNames.get(s.clientId as string) ?? 'Unknown client',
      vendor: [s.vendor, cat].filter(Boolean).join(' · '),
      date,
      days,
      cost: s.cost as number | undefined,
    });
  });

  // Device warranties (optional).
  if (cfg.includeWarranties) {
    const devSnap = await db.collection('devices').get();
    devSnap.forEach((doc) => {
      const d = doc.data();
      const date = d.warrantyExpiry as string | undefined;
      if (!date) return;
      const days = daysUntil(date);
      if (days === null || days > cfg.windowDays) return;
      rows.push({
        kind: 'Warranty',
        name: d.hostname as string,
        clientName: clientNames.get(d.clientId as string) ?? 'Unknown client',
        vendor: 'Hardware warranty',
        date,
        days,
      });
    });
  }

  if (rows.length === 0) {
    return { totalItems: 0, sent: false, message: 'No renewals within the window — no email sent.' };
  }

  rows.sort((a, b) => a.days - b.days);

  const html = renderEmail(rows, cfg.windowDays);
  const overdue = rows.filter((r) => r.days < 0).length;
  const subject =
    `[Binary Solutions CRM] ${rows.length} upcoming renewal(s)` +
    (overdue > 0 ? ` — ${overdue} overdue` : '');

  await sendGraphMail(
    {
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      sender: cfg.sender,
    },
    { subject, html, to: cfg.recipients }
  );

  return {
    totalItems: rows.length,
    sent: true,
    message: `Sent digest with ${rows.length} item(s) to ${cfg.recipients.join(', ')}.`,
  };
}

function renderEmail(rows: RenewalRow[], windowDays: number): string {
  const rowsHtml = rows
    .map((r) => {
      const colour = r.days < 0 ? '#b91c1c' : r.days <= 7 ? '#b45309' : '#1d4ed8';
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;color:${colour};font-weight:600;white-space:nowrap;">
            ${dueLabel(r.days)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${formatDate(
            r.date
          )}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(
            r.name
          )}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(
            r.clientName
          )}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(
            r.vendor ?? ''
          )}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${money(
            r.cost
          )}</td>
        </tr>`;
    })
    .join('');

  const today = new Date().toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:760px;margin:0 auto;">
    <div style="background:#111827;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
      <h2 style="margin:0;font-size:18px;">Binary Solutions — Upcoming Renewals</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${today} · next ${windowDays} days</p>
    </div>
    <div style="border:1px solid #e3e8f0;border-top:none;border-radius:0 0 10px 10px;padding:0;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;">
            <th style="padding:10px;">Due</th>
            <th style="padding:10px;">Date</th>
            <th style="padding:10px;">Item</th>
            <th style="padding:10px;">Client</th>
            <th style="padding:10px;">Detail</th>
            <th style="padding:10px;">Cost</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <p style="color:#6b7280;font-size:12px;margin:16px 2px;">
      This is an automated reminder from the Binary Solutions CRM. Review and action these
      renewals in the dashboard.
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
