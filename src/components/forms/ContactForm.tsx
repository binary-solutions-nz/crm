import { useState, type FormEvent } from 'react';
import { Field, FieldRow } from '../Field';
import { createDoc, updateDocById } from '../../lib/firestore';
import type { Contact } from '../../types';

interface Props {
  clientId: string;
  initial?: Contact;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ContactForm({ clientId, initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Omit<Contact, 'id'> = {
      clientId,
      name: name.trim(),
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isPrimary,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) await updateDocById<Contact>('contacts', initial.id, payload);
      else await createDoc<Contact>('contacts', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="entity-form">
      <FieldRow>
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Role / title">
          <input value={role} onChange={(e) => setRole(e.target.value)} />
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

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
        />
        Primary contact for this client
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
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add user'}
        </button>
      </div>
    </form>
  );
}
