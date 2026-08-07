import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { useCollection } from '../lib/useCollection';
import { deleteDocById } from '../lib/firestore';
import type { Client } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ClientForm from '../components/forms/ClientForm';
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui';

export default function Clients() {
  const navigate = useNavigate();
  const { data, loading, error } = useCollection<Client>('clients', [orderBy('name')]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'organisation'>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.primaryContactName ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, typeFilter]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteDocById('clients', deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Individuals and organisations under management"
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New client
          </button>
        }
      />

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as never)}>
          <option value="all">All types</option>
          <option value="organisation">Organisations</option>
          <option value="individual">Individuals</option>
        </select>
      </div>

      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          message="No clients yet."
          action={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Add your first client
            </button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Primary contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="row-clickable"
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <td className="cell-strong">{c.name}</td>
                  <td className="cell-capitalise">{c.type}</td>
                  <td>{c.primaryContactName ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-icon" onClick={() => setEditing(c)} title="Edit">
                      ✎
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      onClick={() => setDeleting(c)}
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
        <Modal title="New client" onClose={() => setCreating(false)} wide>
          <ClientForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit client" onClose={() => setEditing(null)} wide>
          <ClientForm
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete client"
          message={`Delete "${deleting.name}"? This does not automatically remove their subscriptions, services, users or devices — remove those first if needed.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
