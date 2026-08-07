import { useState, type FormEvent } from 'react';
import { Field, FieldRow } from '../Field';
import { createDoc, updateDocById } from '../../lib/firestore';
import {
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_CATEGORY_LABELS,
  type BillingCycle,
  type EntityStatus,
  type Subscription,
  type SubscriptionCategory,
} from '../../types';

interface Props {
  clientId: string;
  initial?: Subscription;
  onSaved: () => void;
  onCancel: () => void;
}

export default function SubscriptionForm({ clientId, initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [category, setCategory] = useState<SubscriptionCategory>(
    initial?.category ?? 'saas-subscription'
  );
  const [seats, setSeats] = useState(initial?.seats != null ? String(initial.seats) : '');
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initial?.billingCycle ?? 'annual'
  );
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? '');
  const [renewalDate, setRenewalDate] = useState(initial?.renewalDate ?? '');
  const [autoRenew, setAutoRenew] = useState(initial?.autoRenew ?? false);
  const [status, setStatus] = useState<EntityStatus>(initial?.status ?? 'active');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!renewalDate) {
      setError('Renewal / expiry date is required — it drives the reminders.');
      return;
    }
    setBusy(true);
    setError(null);
    const parsedCost = cost.trim() === '' ? undefined : Number(cost);
    const parsedSeats = seats.trim() === '' ? undefined : Number(seats);
    const payload: Omit<Subscription, 'id'> = {
      clientId,
      name: name.trim(),
      vendor: vendor.trim() || undefined,
      category,
      seats: Number.isNaN(parsedSeats as number) ? undefined : parsedSeats,
      cost: Number.isNaN(parsedCost as number) ? undefined : parsedCost,
      billingCycle,
      purchaseDate: purchaseDate || undefined,
      renewalDate,
      autoRenew,
      status,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) await updateDocById<Subscription>('subscriptions', initial.id, payload);
      else await createDoc<Subscription>('subscriptions', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="entity-form">
      <FieldRow>
        <Field label="Subscription / license name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Vendor">
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Microsoft"
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Category" required>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SubscriptionCategory)}
          >
            {Object.entries(SUBSCRIPTION_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
        <Field label="Seats / quantity">
          <input type="number" min="0" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </Field>
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

      <FieldRow>
        <Field label="Purchase date">
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </Field>
        <Field label="Renewal / expiry date" required hint="Drives upcoming-renewal reminders">
          <input
            type="date"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
            required
          />
        </Field>
      </FieldRow>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={autoRenew}
          onChange={(e) => setAutoRenew(e.target.checked)}
        />
        Auto-renews
      </label>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      {error && <p className="login-error">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add subscription'}
        </button>
      </div>
    </form>
  );
}
