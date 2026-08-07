import { useState, type FormEvent } from 'react';
import { Field, FieldRow } from '../Field';
import { createDoc, updateDocById } from '../../lib/firestore';
import { DEVICE_TYPE_LABELS, type Device, type DeviceType, type EntityStatus } from '../../types';

interface Props {
  clientId: string;
  initial?: Device;
  onSaved: () => void;
  onCancel: () => void;
}

export default function DeviceForm({ clientId, initial, onSaved, onCancel }: Props) {
  const [hostname, setHostname] = useState(initial?.hostname ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'desktop');
  const [os, setOs] = useState(initial?.os ?? '');
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '');
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? '');
  const [warrantyExpiry, setWarrantyExpiry] = useState(initial?.warrantyExpiry ?? '');
  const [status, setStatus] = useState<EntityStatus>(initial?.status ?? 'active');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Omit<Device, 'id'> = {
      clientId,
      hostname: hostname.trim(),
      type,
      os: os.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      assignedTo: assignedTo.trim() || undefined,
      purchaseDate: purchaseDate || undefined,
      warrantyExpiry: warrantyExpiry || undefined,
      status,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) await updateDocById<Device>('devices', initial.id, payload);
      else await createDoc<Device>('devices', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="entity-form">
      <FieldRow>
        <Field label="Hostname / label" required>
          <input value={hostname} onChange={(e) => setHostname(e.target.value)} required autoFocus />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
            {Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Operating system">
          <input value={os} onChange={(e) => setOs(e.target.value)} placeholder="e.g. Windows 11" />
        </Field>
        <Field label="Assigned to">
          <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Serial number">
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Purchase date">
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        <Field label="Warranty expiry" hint="Tracked for renewal reminders">
          <input
            type="date"
            value={warrantyExpiry}
            onChange={(e) => setWarrantyExpiry(e.target.value)}
          />
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
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add device'}
        </button>
      </div>
    </form>
  );
}
