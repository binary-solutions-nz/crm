import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { useCollection } from '../lib/useCollection';
import { deleteDocById } from '../lib/firestore';
import { BILLING_CYCLE_LABELS, type Client, type Service } from '../types';
import { formatMoney } from '../lib/dates';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceForm from '../components/forms/ServiceForm';
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  StatusBadge,
} from '../components/ui';

export default function Services() {
  const services = useCollection<Service>('services', [orderBy('name')]);
  const clients = useCollection<Client>('clients', [orderBy('name')]);
  const clientMap = useMemo(
    () => Object.fromEntries(clients.data.map((c) => [c.id, c])),
    [clients.data]
  );

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.data.filter((s) => {
      if (!q) return true;
      const clientName = clientMap[s.clientId]?.name ?? '';
      return (
        s.name.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q)
      );
    });
  }, [services.data, search, clientMap]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteDocById('services', deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const canCreate = clients.data.length > 0;

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Ongoing services delivered to clients"
        actions={
          <button
            className="btn btn-primary"
            onClick={() => setCreating(true)}
            disabled={!canCreate}
            title={canCreate ? '' : 'Add a client first'}
          >
            + New service
          </button>
        }
      />

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search service, category or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(services.loading || clients.loading) && <Loading />}
      {services.error && <ErrorState message={services.error} />}
      {!services.loading && !services.error && filtered.length === 0 && (
        <EmptyState message="No services match." />
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Client</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Billing</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
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
                  <td>{s.category ?? '—'}</td>
                  <td>{formatMoney(s.cost)}</td>
                  <td>{s.billingCycle ? BILLING_CYCLE_LABELS[s.billingCycle] : '—'}</td>
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
        <Modal title="New service" onClose={() => setCreating(false)} wide>
          <ServicePicker onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit service" onClose={() => setEditing(null)} wide>
          <ServiceForm
            clientId={editing.clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete service"
          message={`Delete "${deleting.name}"? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

function ServicePicker({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
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

  return <ServiceForm clientId={clientId} onSaved={onDone} onCancel={onCancel} />;
}
