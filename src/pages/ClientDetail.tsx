import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useCollection } from '../lib/useCollection';
import { deleteDocById } from '../lib/firestore';
import {
  BILLING_CYCLE_LABELS,
  DEVICE_TYPE_LABELS,
  SUBSCRIPTION_CATEGORY_LABELS,
  type Client,
  type Contact,
  type Device,
  type Service,
  type Subscription,
} from '../types';
import { formatDate, formatMoney, relativeRenewal } from '../lib/dates';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ClientForm from '../components/forms/ClientForm';
import ContactForm from '../components/forms/ContactForm';
import DeviceForm from '../components/forms/DeviceForm';
import ServiceForm from '../components/forms/ServiceForm';
import SubscriptionForm from '../components/forms/SubscriptionForm';
import {
  EmptyState,
  ErrorState,
  Loading,
  RenewalBadge,
  StatusBadge,
} from '../components/ui';

type Tab = 'users' | 'devices' | 'services' | 'subscriptions';

export default function ClientDetail() {
  const { clientId = '' } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDoc(doc(db, 'clients', clientId)).then((snap) => {
      if (!active) return;
      if (snap.exists()) setClient({ id: snap.id, ...(snap.data() as object) } as Client);
      else setNotFound(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [clientId, refreshKey]);

  if (loading) return <Loading />;
  if (notFound || !client) {
    return (
      <EmptyState
        message="Client not found."
        action={
          <Link to="/clients" className="btn btn-primary">
            Back to clients
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/clients" className="link">
          Clients
        </Link>
        <span> / {client.name}</span>
      </div>

      <div className="detail-header">
        <div>
          <h1 className="page-title">
            {client.name} <StatusBadge status={client.status} />
          </h1>
          <p className="page-subtitle cell-capitalise">{client.type}</p>
        </div>
        <button className="btn" onClick={() => setEditing(true)}>
          ✎ Edit client
        </button>
      </div>

      <div className="info-grid">
        <InfoItem label="Primary contact" value={client.primaryContactName} />
        <InfoItem label="Email" value={client.email} />
        <InfoItem label="Phone" value={client.phone} />
        <InfoItem label="Website" value={client.website} isLink />
        <InfoItem label="Address" value={client.address} />
      </div>
      {client.notes && <p className="detail-notes">{client.notes}</p>}

      <div className="tabs">
        <TabButton active={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
          Subscriptions
        </TabButton>
        <TabButton active={tab === 'services'} onClick={() => setTab('services')}>
          Services
        </TabButton>
        {client.type === 'organisation' && (
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            Users
          </TabButton>
        )}
        <TabButton active={tab === 'devices'} onClick={() => setTab('devices')}>
          Devices / PCs
        </TabButton>
      </div>

      <div className="tab-panel">
        {tab === 'subscriptions' && <SubscriptionsTab clientId={clientId} />}
        {tab === 'services' && <ServicesTab clientId={clientId} />}
        {tab === 'users' && <UsersTab clientId={clientId} />}
        {tab === 'devices' && <DevicesTab clientId={clientId} />}
      </div>

      {editing && (
        <Modal title="Edit client" onClose={() => setEditing(false)} wide>
          <ClientForm
            initial={client}
            onSaved={() => {
              setEditing(false);
              setRefreshKey((k) => k + 1);
            }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---- Small presentational helpers -------------------------------------------

function InfoItem({
  label,
  value,
  isLink,
}: {
  label: string;
  value?: string;
  isLink?: boolean;
}) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className="info-value">
        {value ? (
          isLink ? (
            <a href={value} target="_blank" rel="noreferrer" className="link">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          '—'
        )}
      </span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`tab${active ? ' tab-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionToolbar({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="section-toolbar">
      <h3>{title}</h3>
      <button className="btn btn-primary btn-sm" onClick={onAdd}>
        + {addLabel}
      </button>
    </div>
  );
}

// ---- Subscriptions tab -------------------------------------------------------

function SubscriptionsTab({ clientId }: { clientId: string }) {
  const { data, loading, error } = useCollection<Subscription>(
    'subscriptions',
    [where('clientId', '==', clientId), orderBy('renewalDate')],
    [clientId]
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div>
      <SectionToolbar title="Subscriptions & licenses" onAdd={() => setCreating(true)} addLabel="Add subscription" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {!loading && data.length === 0 && <EmptyState message="No subscriptions for this client yet." />}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Renewal</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Seats</th>
                <th>Cost</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <RenewalBadge date={s.renewalDate}>{relativeRenewal(s.renewalDate)}</RenewalBadge>
                    <div className="cell-sub">{formatDate(s.renewalDate)}</div>
                  </td>
                  <td className="cell-strong">{s.name}</td>
                  <td>{s.vendor ?? '—'}</td>
                  <td>{SUBSCRIPTION_CATEGORY_LABELS[s.category]}</td>
                  <td>{s.seats ?? '—'}</td>
                  <td>{formatMoney(s.cost)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="col-actions">
                    <button className="btn-icon" onClick={() => setEditing(s)} title="Edit">
                      ✎
                    </button>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleting(s)} title="Delete">
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
        <Modal title="Add subscription" onClose={() => setCreating(false)} wide>
          <SubscriptionForm clientId={clientId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit subscription" onClose={() => setEditing(null)} wide>
          <SubscriptionForm
            clientId={clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete subscription"
          message={`Delete "${deleting.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ---- Services tab ------------------------------------------------------------

function ServicesTab({ clientId }: { clientId: string }) {
  const { data, loading, error } = useCollection<Service>(
    'services',
    [where('clientId', '==', clientId), orderBy('name')],
    [clientId]
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div>
      <SectionToolbar title="Services" onAdd={() => setCreating(true)} addLabel="Add service" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {!loading && data.length === 0 && <EmptyState message="No services for this client yet." />}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Billing</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.name}</td>
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
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleting(s)} title="Delete">
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
        <Modal title="Add service" onClose={() => setCreating(false)} wide>
          <ServiceForm clientId={clientId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit service" onClose={() => setEditing(null)} wide>
          <ServiceForm
            clientId={clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete service"
          message={`Delete "${deleting.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ---- Users tab ---------------------------------------------------------------

function UsersTab({ clientId }: { clientId: string }) {
  const { data, loading, error } = useCollection<Contact>(
    'contacts',
    [where('clientId', '==', clientId), orderBy('name')],
    [clientId]
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteDocById('contacts', deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionToolbar title="Users" onAdd={() => setCreating(true)} addLabel="Add user" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {!loading && data.length === 0 && <EmptyState message="No users recorded for this organisation yet." />}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Primary</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="cell-strong">{c.name}</td>
                  <td>{c.role ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.isPrimary ? '✓' : '—'}</td>
                  <td className="col-actions">
                    <button className="btn-icon" onClick={() => setEditing(c)} title="Edit">
                      ✎
                    </button>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleting(c)} title="Delete">
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
        <Modal title="Add user" onClose={() => setCreating(false)} wide>
          <ContactForm clientId={clientId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit user" onClose={() => setEditing(null)} wide>
          <ContactForm
            clientId={clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete user"
          message={`Delete "${deleting.name}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ---- Devices tab -------------------------------------------------------------

function DevicesTab({ clientId }: { clientId: string }) {
  const { data, loading, error } = useCollection<Device>(
    'devices',
    [where('clientId', '==', clientId), orderBy('hostname')],
    [clientId]
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteDocById('devices', deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionToolbar title="Devices / PCs" onAdd={() => setCreating(true)} addLabel="Add device" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {!loading && data.length === 0 && <EmptyState message="No devices recorded for this client yet." />}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Type</th>
                <th>OS</th>
                <th>Assigned to</th>
                <th>Serial</th>
                <th>Warranty</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td className="cell-strong">{d.hostname}</td>
                  <td>{DEVICE_TYPE_LABELS[d.type]}</td>
                  <td>{d.os ?? '—'}</td>
                  <td>{d.assignedTo ?? '—'}</td>
                  <td>{d.serialNumber ?? '—'}</td>
                  <td>
                    {d.warrantyExpiry ? (
                      <RenewalBadge date={d.warrantyExpiry}>{formatDate(d.warrantyExpiry)}</RenewalBadge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="col-actions">
                    <button className="btn-icon" onClick={() => setEditing(d)} title="Edit">
                      ✎
                    </button>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleting(d)} title="Delete">
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
        <Modal title="Add device" onClose={() => setCreating(false)} wide>
          <DeviceForm clientId={clientId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit device" onClose={() => setEditing(null)} wide>
          <DeviceForm
            clientId={clientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete device"
          message={`Delete "${deleting.hostname}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
