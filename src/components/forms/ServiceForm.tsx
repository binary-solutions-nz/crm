import { useState, type FormEvent } from 'react';
import { Field, FieldRow } from '../Field';
import { createDoc, updateDocById } from '../../lib/firestore';
import {
  BILLING_CYCLE_LABELS,
  type BillingCycle,
  type EntityStatus,
  type Service,
} from '../../types';

interface Props {
  clientId: string;
  initial?: Service;
  onSaved: () => void;
  onCancel: () => void;
}

const CATEGORIES = [
  'Managed IT',
  'Help Desk',
  'Backup & DR',
  'Email & Microsoft 365',
  'Hosting',
  'Networking',
  'Cyber Security',
  'Cloud',
  'Other',
];

export default function ServiceForm({ clientId, initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Managed IT');
  const [status, setStatus] = useState<EntityStatus>(initial?.status ?? 'active');
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initial?.billingCycle ?? 'monthly'
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const parsedCost = cost.trim() === '' ? undefined : Number(cost);
    const payload: Omit<Service, 'id'> = {
      clientId,
      name: name.trim(),
      category,
      status,
      cost: Number.isNaN(parsedCost as number) ? undefined : parsedCost,
      billingCycle,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) await updateDocById<Service>('services', initial.id, payload);
      else await createDoc<Service>('services', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="entity-form">
      <Field label="Service name" required>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>

      <FieldRow>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Cost (NZD)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <Field label="Billing cycle">
          <select
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
          >
            {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      {error && <p className="login-error">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add service'}
        </button>
      </div>
    </form>
  );
}
