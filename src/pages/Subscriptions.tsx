import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { useCollection } from '../lib/useCollection';
import { deleteDocById } from '../lib/firestore';
import {
  SUBSCRIPTION_CATEGORY_LABELS,
  type Client,
  type Subscription,
} from '../types';
import { formatDate, formatMoney, relativeRenewal } from '../lib/dates';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SubscriptionForm from '../components/forms/SubscriptionForm';
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  RenewalBadge,
  StatusBadge,
} from '../components/ui';

export default function Subscriptions() {
  const subs = useCollection<Subscription>('subscriptions', [orderBy('renewalDate')]);
  const clients = useCollection<Client>('clients', [orderBy('name')]);
  const clientMap = useMemo(
    () => Object.fromEntries(clients.data.map((c) => [c.id, c])),
    [clients.data]
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.data.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      const clientName = clientMap[s.clientId]?.name ?? '';
      return (
        s.name.toLowerCase().includes(q) ||
        (s.vendor ?? '').toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q)
      );
    });
  }, [subs.data, search, statusFilter, clientMap]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteDocById('subscriptions', deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const canCreate = clients.data.length > 0;

  return (
    <div>
      <PageHeader
        title="Subscriptions & Licenses"
        subtitle="All renewals across every client, soonest first"
        actions={
          <button
            className="btn btn-primary"
            onClick={() => setCreating(true)}
            disabled={!canCreate}
            title={canCreate ? '' : 'Add a client first'}
          >
            + New subscription
          </button>
        }
      />

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search name, vendor or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All</option>
        </select>
      </div>

      {(subs.loading || clients.loading) && <Loading />}
      {subs.error && <ErrorState message={subs.error} />}
      {!subs.loading && !subs.error && filtered.length === 0 && (
        <EmptyState message="No subscriptions match." />
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Renewal</th>
                <th>Name</th>
                <th>Client</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Seats</th>
                <th>Cost</th>
                <th>Auto</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <RenewalBadge date={s.renewalDate}>{relativeRenewal(s.renewalDate)}</RenewalBadge>
                    <div className="cell-sub">{formatDate(s.renewalDate)}</div>
                  </td>
                  <td className="cell-strong">{s.name}</td>
                  <td>
                    {clientMap[s.clientId] ? (
                      <Link to={`/clients/${s.clientId}`} className="link">
                        {clientMap[s.clientId].name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{s.vendor ?? '—'}</td>
                  <td>{SUBSCRIPTION_CATEGORY_LABELS[s.category]}</td>
                  <td>{s.seats ?? '—'}</td>
                  <td>{formatMoney(s.cost)}</td>
                  <td>{s.autoRenew ? '✓' : '—'}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="col-actions">
                    <button className="btn-icon" onClick={() => setEditing(s)} title="Edit">
                      ✎
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => setDeleting(s)}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Modal title="New subscription" onClose={() => setCreating(false)} wide>
          <SubscriptionPicker onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit subscription" onClose={() => setEditing(null)} wide>
          <SubscriptionForm
            clientId={editing.clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete subscription"
          message={`Delete "${deleting.name}"? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// When creating from the global page we first pick which client it belongs to.
function SubscriptionPicker({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const clients = useCollection<Client>('clients', [orderBy('name')]);
  const [clientId, setClientId] = useState('');

  if (!clientId) {
    return (
      <div className="entity-form">
        <label className="field">
          <span className="field-label">
            Which client is this for?<span className="field-required">*</span>
          </span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a client…</option>
            {clients.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <SubscriptionForm clientId={clientId} onSaved={onDone} onCancel={onCancel} />
  );
}
