import { useState, type FormEvent } from 'react';
import { Field, FieldRow } from '../Field';
import { createDoc, updateDocById } from '../../lib/firestore';
import type { Client, ClientType, EntityStatus } from '../../types';

interface Props {
  initial?: Client;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ClientForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ClientType>(initial?.type ?? 'organisation');
  const [status, setStatus] = useState<EntityStatus>(initial?.status ?? 'active');
  const [primaryContactName, setPrimaryContactName] = useState(initial?.primaryContactName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Omit<Client, 'id'> = {
      name: name.trim(),
      type,
      status,
      primaryContactName: primaryContactName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) await updateDocById<Client>('clients', initial.id, payload);
      else await createDoc<Client>('clients', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="entity-form">
      <FieldRow>
        <Field label="Client name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Type" required>
          <select value={type} onChange={(e) => setType(e.target.value as ClientType)}>
            <option value="organisation">Organisation</option>
            <option value="individual">Individual</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Primary contact">
          <input
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Website">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
      </Field>

      <Field label="Address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>

      {error && <p className="login-error">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Create client'}
        </button>
      </div>
    </form>
  );
}
