import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { useCollection } from '../lib/useCollection';
import {
  SUBSCRIPTION_CATEGORY_LABELS,
  type Client,
  type Device,
  type Subscription,
} from '../types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { daysUntil, formatDate, formatMoney, relativeRenewal } from '../lib/dates';
import { EmptyState, Loading, PageHeader, RenewalBadge } from '../components/ui';

// A unified renewal item drawn from both subscriptions and device warranties.
interface RenewalItem {
  id: string;
  kind: 'Subscription' | 'Warranty';
  name: string;
  clientId: string;
  date: string;
  detail: string;
  cost?: number;
}

const WINDOWS = [
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 60 days', days: 60 },
  { label: 'Next 90 days', days: 90 },
  { label: 'Next 12 months', days: 365 },
];

export default function Renewals() {
  const subs = useCollection<Subscription>('subscriptions', [orderBy('renewalDate')]);
  const devices = useCollection<Device>('devices', []);
  const clients = useCollection<Client>('clients', [orderBy('name')]);
  const clientMap = useMemo(
    () => Object.fromEntries(clients.data.map((c) => [c.id, c.name])),
    [clients.data]
  );
  const [windowDays, setWindowDays] = useState(90);
  const [includeWarranties, setIncludeWarranties] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  async function sendNow() {
    setSending(true);
    setSendResult(null);
    try {
      const call = httpsCallable<unknown, { sent: boolean; message: string }>(
        functions,
        'sendRemindersNow'
      );
      const res = await call({});
      setSendResult(res.data.message);
    } catch (err) {
      setSendResult(
        'Failed to send: ' +
          ((err as Error).message ?? 'unknown error') +
          '. Check the Cloud Function is deployed and Graph settings are configured.'
      );
    } finally {
      setSending(false);
    }
  }

  const items = useMemo<RenewalItem[]>(() => {
    const list: RenewalItem[] = [];
    for (const s of subs.data) {
      if (s.status !== 'active') continue;
      list.push({
        id: 's-' + s.id,
        kind: 'Subscription',
        name: s.name,
        clientId: s.clientId,
        date: s.renewalDate,
        detail: [s.vendor, SUBSCRIPTION_CATEGORY_LABELS[s.category]].filter(Boolean).join(' · '),
        cost: s.cost,
      });
    }
    if (includeWarranties) {
      for (const d of devices.data) {
        if (!d.warrantyExpiry) continue;
        list.push({
          id: 'd-' + d.id,
          kind: 'Warranty',
          name: d.hostname,
          clientId: d.clientId,
          date: d.warrantyExpiry,
          detail: 'Hardware warranty',
        });
      }
    }
    return list
      .filter((it) => {
        const d = daysUntil(it.date);
        return d !== null && d <= windowDays; // include overdue (negative) too
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [subs.data, devices.data, windowDays, includeWarranties]);

  const loading = subs.loading || clients.loading;

  return (
    <div>
      <PageHeader
        title="Upcoming Renewals"
        subtitle="Licenses, subscriptions and warranties approaching their renewal date"
        actions={
          <button className="btn" onClick={sendNow} disabled={sending}>
            {sending ? 'Sending…' : '✉ Send reminder email now'}
          </button>
        }
      />

      {sendResult && <div className="notice">{sendResult}</div>}

      <div className="toolbar">
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
        >
          {WINDOWS.map((w) => (
            <option key={w.days} value={w.days}>
              {w.label}
            </option>
          ))}
        </select>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={includeWarranties}
            onChange={(e) => setIncludeWarranties(e.target.checked)}
          />
          Include hardware warranties
        </label>
      </div>

      {loading && <Loading />}
      {!loading && items.length === 0 && (
        <EmptyState message="Nothing renewing in this window. 🎉" />
      )}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Due</th>
                <th>Date</th>
                <th>Item</th>
                <th>Type</th>
                <th>Client</th>
                <th>Detail</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <RenewalBadge date={it.date}>{relativeRenewal(it.date)}</RenewalBadge>
                  </td>
                  <td>{formatDate(it.date)}</td>
                  <td className="cell-strong">{it.name}</td>
                  <td>{it.kind}</td>
                  <td>
                    {clientMap[it.clientId] ? (
                      <Link to={`/clients/${it.clientId}`} className="link">
                        {clientMap[it.clientId]}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{it.detail || '—'}</td>
                  <td>{formatMoney(it.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
