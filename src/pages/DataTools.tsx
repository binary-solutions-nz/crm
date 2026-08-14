import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { fetchCollection, orderBy, type WithId } from '../lib/firestore';
import { useCollection } from '../lib/useCollection';
import { buildCSV, csvHeaders, downloadCSV, parseCSV, rowsToRecords } from '../lib/csv';
import { ENTITY_CONFIGS, getEntityConfig, type EntityConfig, type EntityKey } from '../lib/entityConfig';
import {
  buildCombinedExportRecords,
  buildExportRecords,
  buildImportPlan,
  combinedExportHeaders,
  combinedTemplateRow,
  commitImportPlan,
  ENTITY_IMPORT_ORDER,
  exportHeaders,
  splitCombinedRecords,
  tagLineNumbers,
  type CommitResult,
  type ImportMode,
  type ImportPlan,
  type PlannedRow,
} from '../lib/importExport';
import type { Client } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fetches a fresh (non-realtime) snapshot of every doc in a collection —
// used during import so each step of a multi-collection commit sees the
// results of the steps before it (e.g. clients created earlier in the same
// batch are resolvable by name when contacts/devices are processed next).
async function fetchAll(entity: EntityConfig): Promise<(WithId & Record<string, unknown>)[]> {
  return fetchCollection<WithId & Record<string, unknown>>(entity.key);
}

export default function DataTools() {
  const [tab, setTab] = useState<EntityKey>('clients');
  const { data: clients, loading: clientsLoading } = useCollection<Client>('clients', [orderBy('name')]);

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Back up, bulk-edit, or migrate CRM data as CSV" />

      <AllDataPanel clients={clients} clientsLoading={clientsLoading} />

      <div className="section-intro">
        <h2 className="section-heading">Single-collection tools</h2>
        <p className="field-hint">
          Export or import just one collection at a time — handy for spreadsheet edits scoped to a single sheet, or
          for updating only specific fields (e.g. bulk-correcting a column of statuses).
        </p>
      </div>

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

// ---- Whole-dataset panel: one CSV, every collection --------------------------

function AllDataPanel({ clients, clientsLoading }: { clients: Client[]; clientsLoading: boolean }) {
  const [exportingAll, setExportingAll] = useState(false);

  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [building, setBuilding] = useState(false);
  const [previewParts, setPreviewParts] = useState<{ entity: EntityConfig; plan: ImportPlan }[] | null>(null);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<{ label: string; created: number; updated: number }[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExportAll() {
    setExportingAll(true);
    try {
      const freshClients = await fetchCollection<Client>('clients', orderBy('name'));
      const clientsById = new Map(freshClients.map((c) => [c.id, c]));
      const parts = [];
      for (const key of ENTITY_IMPORT_ORDER) {
        const entity = getEntityConfig(key);
        const docs =
          key === 'clients' ? (freshClients as unknown as (WithId & Record<string, unknown>)[]) : await fetchAll(entity);
        parts.push({ entity, docs });
      }
      const records = buildCombinedExportRecords(parts, clientsById);
      downloadCSV(`binary-crm-export-${todayStamp()}.csv`, buildCSV(combinedExportHeaders(), records));
    } finally {
      setExportingAll(false);
    }
  }

  function handleTemplate() {
    const exampleClientName = clients[0]?.name ?? 'Acme Ltd';
    const rows = ENTITY_IMPORT_ORDER.map((key) => combinedTemplateRow(getEntityConfig(key), exampleClientName));
    downloadCSV('binary-crm-template.csv', buildCSV(combinedExportHeaders(), rows));
  }

  async function buildPreview(text: string) {
    setBuilding(true);
    try {
      const rows = parseCSV(text);
      const headers = csvHeaders(rows);
      const records = tagLineNumbers(rowsToRecords(rows));
      const { parts, unmatchedCount } = splitCombinedRecords(records);
      setUnmatchedCount(unmatchedCount);
      const preview: { entity: EntityConfig; plan: ImportPlan }[] = [];
      for (const part of parts) {
        const existing =
          part.entity.key === 'clients' ? (clients as unknown as (WithId & Record<string, unknown>)[]) : await fetchAll(part.entity);
        const allFields = part.entity.fields.map((f) => f.header);
        preview.push({
          entity: part.entity,
          plan: buildImportPlan(part.entity, part.records, headers, existing, clients, 'overwrite', allFields),
        });
      }
      setPreviewParts(preview);
    } finally {
      setBuilding(false);
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      buildPreview(text);
    };
    reader.readAsText(file);
  }

  function reset() {
    setFileName('');
    setCsvText('');
    setPreviewParts(null);
    setUnmatchedCount(0);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCommitAll() {
    if (!csvText) return;
    setCommitting(true);
    try {
      const rows = parseCSV(csvText);
      const headers = csvHeaders(rows);
      const records = tagLineNumbers(rowsToRecords(rows));
      const { parts } = splitCombinedRecords(records);
      const runResults: { label: string; created: number; updated: number }[] = [];
      for (const part of parts) {
        const freshClients = await fetchCollection<Client>('clients', orderBy('name'));
        const existing =
          part.entity.key === 'clients' ? (freshClients as unknown as (WithId & Record<string, unknown>)[]) : await fetchAll(part.entity);
        const allFields = part.entity.fields.map((f) => f.header);
        const plan = buildImportPlan(part.entity, part.records, headers, existing, freshClients, 'overwrite', allFields);
        const res = await commitImportPlan(plan);
        runResults.push({ label: part.entity.label, created: res.created, updated: res.updated });
      }
      setResults(runResults);
      reset();
    } finally {
      setCommitting(false);
      setConfirming(false);
    }
  }

  const totals = previewParts?.reduce(
    (acc, p) => ({
      create: acc.create + p.plan.counts.create,
      update: acc.update + p.plan.counts.update,
      skip: acc.skip + p.plan.counts.skip,
      error: acc.error + p.plan.counts.error,
    }),
    { create: 0, update: 0, skip: 0, error: 0 }
  );
  const runnableTotal = totals ? totals.create + totals.update : 0;

  return (
    <div className="data-tools-grid data-tools-grid-spaced">
      <div className="panel">
        <div className="panel-header">
          <h2>Export entire dataset</h2>
        </div>
        <div className="data-tools-body">
          <p className="field-hint">
            One CSV with every client, user, device, service and subscription — each row tagged with which
            collection it belongs to.
          </p>
          <div className="data-tools-actions">
            <button className="btn btn-primary" onClick={handleExportAll} disabled={exportingAll || clientsLoading}>
              {exportingAll ? 'Exporting…' : '⬇ Export everything (1 file)'}
            </button>
            <button className="btn" onClick={handleTemplate}>
              Download template
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Import entire dataset</h2>
        </div>
        <div className="data-tools-body">
          <p className="field-hint">
            Upload one combined CSV (from the export above) to fully restore or overwrite the dataset. Records are
            matched by <code>id</code> when present, otherwise by name within their collection — new records are
            created for unmatched rows. Collections are imported in order (clients first) so a client created in
            this same file can be referenced by its <code>clientName</code> in the rows below it.
          </p>

          <div className="field">
            <span className="field-label">Combined CSV file</span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
            {fileName && (
              <span className="field-hint">
                Loaded {fileName}
                {building ? ' — analysing…' : ''}
              </span>
            )}
          </div>

          {unmatchedCount > 0 && (
            <div className="notice notice-warn">
              ⚠ {unmatchedCount} row{unmatchedCount === 1 ? '' : 's'} had an unrecognised or missing{' '}
              <code>collection</code> value and will be skipped. Expected one of: {ENTITY_IMPORT_ORDER.join(', ')}.
            </div>
          )}

          {previewParts && previewParts.length === 0 && unmatchedCount === 0 && (
            <EmptyState message="That CSV has no data rows." />
          )}

          {previewParts && previewParts.length > 0 && totals && (
            <div className="import-preview">
              <div className="import-summary">
                <span className="badge badge-blue">Create {totals.create}</span>
                <span className="badge badge-amber">Update {totals.update}</span>
                <span className="badge badge-grey">Skip {totals.skip}</span>
                <span className="badge badge-red">Errors {totals.error}</span>
              </div>

              {previewParts.map(({ entity, plan }) => (
                <div key={entity.key} className="import-collection-block">
                  <h3 className="import-collection-heading">{entity.label}</h3>
                  <PlanPreview entity={entity} plan={plan} />
                </div>
              ))}

              <div className="data-tools-actions">
                <button className="btn" onClick={reset}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => setConfirming(true)} disabled={runnableTotal === 0}>
                  Import {runnableTotal} row{runnableTotal === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {results && (
            <div className="notice">
              Done —{' '}
              {results.map((r, i) => (
                <span key={r.label}>
                  {i > 0 ? ', ' : ''}
                  {r.label}: created {r.created}, updated {r.updated}
                </span>
              ))}
              .
            </div>
          )}
        </div>
      </div>

      {confirming && totals && (
        <ConfirmDialog
          title="Import entire dataset"
          message={`This will create ${totals.create} and update ${totals.update} record(s) across ${previewParts?.length ?? 0} collection(s). Matched records will be fully replaced with the CSV values. This cannot be undone automatically.`}
          confirmLabel={committing ? 'Importing…' : 'Import'}
          onConfirm={handleCommitAll}
          onCancel={() => setConfirming(false)}
          busy={committing}
        />
      )}
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
              <PlanPreview entity={entity} plan={plan} />

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

// ---- Shared preview: header warnings + summary badges + row table ----------

function PlanPreview({ entity, plan }: { entity: EntityConfig; plan: ImportPlan }) {
  return (
    <>
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
                <td>{r.raw.__line ?? r.rowNumber}</td>
                <td>
                  <ActionBadge row={r} />
                </td>
                <td className="cell-strong">{r.raw[entity.naturalKeyFields[0]] || r.raw.id || '—'}</td>
                {entity.hasClientRef && <td>{r.clientLabel ?? '—'}</td>}
                <td>{r.errors.length ? <span className="import-errors">{r.errors.join('; ')}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ActionBadge({ row }: { row: PlannedRow }) {
  if (!row.valid) return <span className="badge badge-red">Error</span>;
  if (row.action === 'create') return <span className="badge badge-blue">Create</span>;
  if (row.action === 'update') return <span className="badge badge-amber">Update</span>;
  return <span className="badge badge-grey">Skip</span>;
}
