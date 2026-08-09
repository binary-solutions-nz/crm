import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { fetchCollection, orderBy, type WithId } from '../lib/firestore';
import { useCollection } from '../lib/useCollection';
import { buildCSV, csvHeaders, downloadCSV, parseCSV, rowsToRecords } from '../lib/csv';
import { ENTITY_CONFIGS, getEntityConfig, type EntityConfig, type EntityKey } from '../lib/entityConfig';
import {
  buildExportRecords,
  buildImportPlan,
  commitImportPlan,
  exportHeaders,
  type CommitResult,
  type ImportMode,
  type PlannedRow,
} from '../lib/importExport';
import type { Client } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DataTools() {
  const [tab, setTab] = useState<EntityKey>('clients');
  const { data: clients, loading: clientsLoading } = useCollection<Client>('clients', [orderBy('name')]);
  const [exportingAll, setExportingAll] = useState(false);

  async function handleExportAll() {
    setExportingAll(true);
    try {
      const freshClients = await fetchCollection<Client>('clients', orderBy('name'));
      const clientsById = new Map(freshClients.map((c) => [c.id, c]));
      const stamp = todayStamp();
      for (const entity of ENTITY_CONFIGS) {
        const docs =
          entity.key === 'clients'
            ? (freshClients as unknown as (WithId & Record<string, unknown>)[])
            : await fetchCollection<WithId & Record<string, unknown>>(entity.key);
        const records = buildExportRecords(entity, docs, clientsById);
        downloadCSV(`${entity.key}-${stamp}.csv`, buildCSV(exportHeaders(entity), records));
        // Stagger downloads slightly — browsers can block a burst of
        // simultaneous file saves triggered from one click.
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      setExportingAll(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Import / Export"
        subtitle="Back up, bulk-edit, or migrate CRM data as CSV"
        actions={
          <button className="btn btn-primary" onClick={handleExportAll} disabled={exportingAll || clientsLoading}>
            {exportingAll ? 'Exporting…' : '⬇ Export entire dataset'}
          </button>
        }
      />

      <div className="tabs">
        {ENTITY_CONFIGS.map((e) => (
          <button
            key={e.key}
            className={`tab${tab === e.key ? ' tab-active' : ''}`}
            onClick={() => setTab(e.key)}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        <EntityPanel entity={getEntityConfig(tab)} clients={clients} />
      </div>
    </div>
  );
}

// ---- Per-entity export + import panel ---------------------------------------

function EntityPanel({ entity, clients }: { entity: EntityConfig; clients: Client[] }) {
  const { data, loading, error } = useCollection<WithId & Record<string, unknown>>(entity.key, []);
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [mode, setMode] = useState<ImportMode>('overwrite');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!csvText) return null;
    const rows = parseCSV(csvText);
    return { headers: csvHeaders(rows), records: rowsToRecords(rows) };
  }, [csvText]);

  useEffect(() => {
    if (parsed) {
      setSelectedFields(entity.fields.filter((f) => parsed.headers.includes(f.header)).map((f) => f.header));
    }
    // Reset field selection whenever a new file is loaded for this entity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, entity.key]);

  const plan = useMemo(() => {
    if (!parsed || loading) return null;
    return buildImportPlan(entity, parsed.records, parsed.headers, data, clients, mode, selectedFields);
  }, [parsed, loading, entity, data, clients, mode, selectedFields]);

  function handleExport() {
    const records = buildExportRecords(entity, data, clientsById);
    downloadCSV(`${entity.key}-${todayStamp()}.csv`, buildCSV(exportHeaders(entity), records));
  }

  function handleTemplate() {
    const example: Record<string, string> = { id: '' };
    if (entity.hasClientRef) {
      example.clientId = '';
      example.clientName = clients[0]?.name ?? 'Acme Ltd';
    }
    for (const f of entity.fields) example[f.header] = f.example;
    example.createdAt = '';
    example.updatedAt = '';
    downloadCSV(`${entity.key}-template.csv`, buildCSV(exportHeaders(entity), [example]));
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function resetImport() {
    setFileName('');
    setCsvText('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggleField(header: string) {
    setSelectedFields((prev) => (prev.includes(header) ? prev.filter((h) => h !== header) : [...prev, header]));
  }

  async function handleCommit() {
    if (!plan) return;
    setCommitting(true);
    try {
      const res = await commitImportPlan(plan);
      setResult(res);
      resetImport();
    } finally {
      setCommitting(false);
      setConfirming(false);
    }
  }

  const runnableCount = plan ? plan.counts.create + plan.counts.update : 0;

  return (
    <div className="data-tools-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Export {entity.label}</h2>
        </div>
        <div className="data-tools-body">
          {loading && <Loading />}
          {error && <ErrorState message={error} />}
          {!loading && !error && (
            <>
              <p className="field-hint">
                {data.length} record{data.length === 1 ? '' : 's'} currently in this collection.
              </p>
              <div className="data-tools-actions">
                <button className="btn btn-primary" onClick={handleExport} disabled={data.length === 0}>
                  ⬇ Export CSV
                </button>
                <button className="btn" onClick={handleTemplate}>
                  Download template
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Import {entity.label}</h2>
        </div>
        <div className="data-tools-body">
          <div className="import-mode-row">
            <label className="import-mode-option">
              <input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
              <div>
                <strong>Overwrite matched records</strong>
                <p className="field-hint">
                  Fully replaces each matched record with the CSV row. Rows are matched by <code>id</code> when
                  present, otherwise by {entity.naturalKeyFields.join(' + ')}
                  {entity.hasClientRef ? ' within the same client' : ''}. Unmatched rows are created new. Keep the{' '}
                  <code>id</code> column so renaming a field updates the existing record instead of creating a
                  duplicate.
                </p>
              </div>
            </label>
            <label className="import-mode-option">
              <input type="radio" checked={mode === 'fields'} onChange={() => setMode('fields')} />
              <div>
                <strong>Update selected fields only</strong>
                <p className="field-hint">
                  Only changes the columns you tick below, on records that already exist — everything else on the
                  record is left untouched. Never creates new records.
                </p>
              </div>
            </label>
          </div>

          <div className="field">
            <span className="field-label">CSV file</span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
            {fileName && (
              <span className="field-hint">
                Loaded {fileName} — {parsed?.records.length ?? 0} row{parsed?.records.length === 1 ? '' : 's'}.
              </span>
            )}
          </div>

          {mode === 'fields' && parsed && (
            <div className="field">
              <span className="field-label">Fields to update</span>
              <div className="field-row">
                {entity.fields
                  .filter((f) => parsed.headers.includes(f.header))
                  .map((f) => (
                    <label key={f.header} className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(f.header)}
                        onChange={() => toggleField(f.header)}
                      />
                      {f.header}
                    </label>
                  ))}
              </div>
            </div>
          )}

          {plan && plan.rows.length === 0 && <EmptyState message="That CSV has no data rows." />}

          {plan && plan.rows.length > 0 && (
            <div className="import-preview">
              {plan.headerWarnings.map((w, i) => (
                <div key={i} className="notice notice-warn">
                  ⚠ {w}
                </div>
              ))}

              <div className="import-summary">
                <span className="badge badge-blue">Create {plan.counts.create}</span>
                <span className="badge badge-amber">Update {plan.counts.update}</span>
                <span className="badge badge-grey">Skip {plan.counts.skip}</span>
                <span className="badge badge-red">Errors {plan.counts.error}</span>
              </div>

              <div className="table-wrap import-preview-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Action</th>
                      <th>Record</th>
                      {entity.hasClientRef && <th>Client</th>}
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>
                          <ActionBadge row={r} />
                        </td>
                        <td className="cell-strong">
                          {r.raw[entity.naturalKeyFields[0]] || r.raw.id || '—'}
                        </td>
                        {entity.hasClientRef && <td>{r.clientLabel ?? '—'}</td>}
                        <td>{r.errors.length ? <span className="import-errors">{r.errors.join('; ')}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="data-tools-actions">
                <button className="btn" onClick={resetImport}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => setConfirming(true)} disabled={runnableCount === 0}>
                  Import {runnableCount} row{runnableCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="notice">
              Done — created {result.created}, updated {result.updated}.
            </div>
          )}
        </div>
      </div>

      {confirming && plan && (
        <ConfirmDialog
          title={`Import ${entity.label}`}
          message={`This will create ${plan.counts.create} and update ${plan.counts.update} record(s) in ${entity.label}. ${
            plan.mode === 'overwrite'
              ? 'Matched records will be fully replaced with the CSV values.'
              : `Only ${plan.selectedFields.join(', ') || 'the selected fields'} will change on matched records.`
          } This cannot be undone automatically.`}
          confirmLabel={committing ? 'Importing…' : 'Import'}
          onConfirm={handleCommit}
          onCancel={() => setConfirming(false)}
          busy={committing}
        />
      )}
    </div>
  );
}

function ActionBadge({ row }: { row: PlannedRow }) {
  if (!row.valid) return <span className="badge badge-red">Error</span>;
  if (row.action === 'create') return <span className="badge badge-blue">Create</span>;
  if (row.action === 'update') return <span className="badge badge-amber">Update</span>;
  return <span className="badge badge-grey">Skip</span>;
}
