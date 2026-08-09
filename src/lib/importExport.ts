// Core CSV <-> Firestore mapping logic shared by the Data Tools page:
// building export rows, validating/planning an import (dry run), and
// committing a validated plan in batches.

import { collection, deleteField, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Client } from '../types';
import type { WithId } from './firestore';
import type { EntityConfig, FieldConfig } from './entityConfig';

export const EXPORT_META_HEADERS = ['id', 'clientId', 'clientName', 'createdAt', 'updatedAt'] as const;

export function exportHeaders(entity: EntityConfig): string[] {
  return [
    'id',
    ...(entity.hasClientRef ? ['clientId', 'clientName'] : []),
    ...entity.fields.map((f) => f.header),
    'createdAt',
    'updatedAt',
  ];
}

function formatExportValue(field: FieldConfig, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (field.type === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function buildExportRecords(
  entity: EntityConfig,
  docs: (WithId & Record<string, unknown>)[],
  clientsById: Map<string, Client>
): Record<string, string>[] {
  return docs.map((row) => {
    const rec: Record<string, string> = { id: row.id };
    if (entity.hasClientRef) {
      const clientId = String(row.clientId ?? '');
      rec.clientId = clientId;
      rec.clientName = clientsById.get(clientId)?.name ?? '';
    }
    for (const f of entity.fields) {
      rec[f.header] = formatExportValue(f, row[f.key]);
    }
    rec.createdAt = row.createdAt ? new Date(row.createdAt as number).toISOString() : '';
    rec.updatedAt = row.updatedAt ? new Date(row.updatedAt as number).toISOString() : '';
    return rec;
  });
}

// ---- Import: validation + coercion -----------------------------------------

interface CoerceResult {
  value?: unknown;
  error?: string;
}

function normalizeEnum(field: FieldConfig, trimmed: string): CoerceResult {
  const lower = trimmed.toLowerCase();
  const direct = field.enumValues?.find((v) => v.toLowerCase() === lower);
  if (direct) return { value: direct };
  if (field.enumLabels) {
    const byLabel = Object.entries(field.enumLabels).find(([, label]) => label.toLowerCase() === lower);
    if (byLabel) return { value: byLabel[0] };
  }
  return {
    error: `"${trimmed}" is not a valid ${field.header} (allowed: ${field.enumValues?.join(', ')})`,
  };
}

function coerceField(field: FieldConfig, raw: string): CoerceResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (field.required) return { error: `${field.header} is required` };
    return { value: undefined };
  }
  switch (field.type) {
    case 'string':
      return { value: trimmed };
    case 'number': {
      const n = Number(trimmed);
      if (Number.isNaN(n)) return { error: `${field.header} must be a number` };
      return { value: n };
    }
    case 'boolean': {
      const v = trimmed.toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(v)) return { value: true };
      if (['false', '0', 'no', 'n'].includes(v)) return { value: false };
      return { error: `${field.header} must be true/false` };
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { error: `${field.header} must be YYYY-MM-DD` };
      return { value: trimmed };
    case 'enum':
      return normalizeEnum(field, trimmed);
  }
}

export type ImportMode = 'overwrite' | 'fields';

export interface PlannedRow {
  rowNumber: number; // 1-based CSV line number (header is line 1)
  raw: Record<string, string>;
  action: 'create' | 'update' | 'skip';
  docId?: string;
  clientLabel?: string;
  data: Record<string, unknown>;
  changedFields: string[];
  errors: string[];
  valid: boolean;
}

export interface ImportPlan {
  entity: EntityConfig;
  mode: ImportMode;
  selectedFields: string[];
  rows: PlannedRow[];
  headerWarnings: string[];
  counts: { create: number; update: number; skip: number; error: number };
}

function computeNaturalKey(entity: EntityConfig, clientId: string | undefined, values: Record<string, string>): string {
  const parts = entity.hasClientRef ? [clientId ?? ''] : [];
  for (const k of entity.naturalKeyFields) parts.push(String(values[k] ?? '').trim().toLowerCase());
  return parts.join('::');
}

export function buildImportPlan(
  entity: EntityConfig,
  records: Record<string, string>[],
  headers: string[],
  existingDocs: (WithId & Record<string, unknown>)[],
  clients: Client[],
  mode: ImportMode,
  selectedFields: string[]
): ImportPlan {
  const existingById = new Map(existingDocs.map((d) => [d.id, d]));
  const existingByNaturalKey = new Map(
    existingDocs.map((d) => [computeNaturalKey(entity, d.clientId as string | undefined, d as Record<string, string>), d])
  );
  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const clientsByNameLower = new Map<string, Client[]>();
  for (const c of clients) {
    const k = c.name.trim().toLowerCase();
    const arr = clientsByNameLower.get(k) ?? [];
    arr.push(c);
    clientsByNameLower.set(k, arr);
  }

  const headerWarnings: string[] = [];
  if (mode === 'overwrite') {
    const missing = entity.fields.filter((f) => f.required && !headers.includes(f.header));
    if (missing.length) {
      headerWarnings.push(
        `Missing required column(s) for full overwrite: ${missing.map((f) => f.header).join(', ')}. Download a fresh template or switch to field-update mode.`
      );
    }
    if (entity.hasClientRef && !headers.includes('clientId') && !headers.includes('clientName')) {
      headerWarnings.push('CSV needs a clientId or clientName column to link rows to a client.');
    }
  }

  const activeFields =
    mode === 'fields' ? entity.fields.filter((f) => selectedFields.includes(f.header) && headers.includes(f.header)) : entity.fields;

  const counts = { create: 0, update: 0, skip: 0, error: 0 };

  const rows: PlannedRow[] = records.map((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    let clientId: string | undefined;
    let clientLabel: string | undefined;

    if (entity.hasClientRef) {
      const rawClientId = raw.clientId?.trim();
      const rawClientName = raw.clientName?.trim();
      if (rawClientId && clientsById.has(rawClientId)) {
        clientId = rawClientId;
        clientLabel = clientsById.get(rawClientId)!.name;
      } else if (rawClientName) {
        const matches = clientsByNameLower.get(rawClientName.toLowerCase()) ?? [];
        if (matches.length === 1) {
          clientId = matches[0].id;
          clientLabel = matches[0].name;
        } else if (matches.length > 1) {
          errors.push(`clientName "${rawClientName}" matches multiple clients — use clientId instead`);
        } else {
          errors.push(`No client found named "${rawClientName}"`);
        }
      } else if (rawClientId) {
        errors.push(`clientId "${rawClientId}" does not match any existing client`);
      } else {
        errors.push('clientId or clientName is required');
      }
    }

    const data: Record<string, unknown> = {};
    const changedFields: string[] = [];
    for (const f of activeFields) {
      const cellRaw = raw[f.header] ?? '';
      const { value, error } = coerceField(f, cellRaw);
      if (error) {
        errors.push(error);
        continue;
      }
      if (mode === 'overwrite') {
        data[f.key] = value;
      } else {
        data[f.key] = value;
        changedFields.push(f.header);
      }
    }

    const rawId = raw.id?.trim();
    let action: PlannedRow['action'];
    let docId: string | undefined;
    let matchedDoc: (WithId & Record<string, unknown>) | undefined;

    if (rawId && existingById.has(rawId)) {
      matchedDoc = existingById.get(rawId);
      docId = rawId;
      action = 'update';
    } else {
      const natKey = computeNaturalKey(entity, clientId, raw);
      matchedDoc = existingByNaturalKey.get(natKey);
      if (matchedDoc) {
        docId = matchedDoc.id;
        action = 'update';
      } else {
        action = 'create';
        docId = rawId || undefined;
      }
    }

    if (mode === 'fields' && action === 'create') {
      action = 'skip';
      errors.push('No matching existing record found — field-update mode never creates records');
    }

    if (entity.hasClientRef && mode === 'overwrite' && clientId) {
      data.clientId = clientId;
    }
    // Full overwrite of an existing doc must not clobber its original
    // creation timestamp — carry it forward explicitly.
    if (mode === 'overwrite' && action === 'update' && matchedDoc?.createdAt) {
      data.createdAt = matchedDoc.createdAt;
    }

    const valid = errors.length === 0;
    if (valid) counts[action]++;
    else counts.error++;

    return { rowNumber, raw, action, docId, clientLabel, data, changedFields, errors, valid };
  });

  return { entity, mode, selectedFields, rows, headerWarnings, counts };
}

// ---- Import: commit ----------------------------------------------------------

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

// For merge-updates, an explicit `undefined` means "clear this field" —
// Firestore's updateDoc needs the deleteField() sentinel to actually do that.
function toUpdatePayload(data: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    payload[k] = v === undefined ? deleteField() : v;
  }
  return payload;
}

export interface CommitResult {
  created: number;
  updated: number;
}

export async function commitImportPlan(plan: ImportPlan): Promise<CommitResult> {
  const runnable = plan.rows.filter((r) => r.valid && r.action !== 'skip');
  const CHUNK = 400;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < runnable.length; i += CHUNK) {
    const chunk = runnable.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    const now = Date.now();
    for (const row of chunk) {
      if (row.action === 'create') {
        const ref = row.docId ? doc(db, plan.entity.key, row.docId) : doc(collection(db, plan.entity.key));
        batch.set(ref, { ...stripUndefined(row.data), createdAt: now, updatedAt: now });
        created++;
      } else {
        const ref = doc(db, plan.entity.key, row.docId!);
        if (plan.mode === 'overwrite') {
          batch.set(ref, { ...stripUndefined(row.data), updatedAt: now }, { merge: false });
        } else {
          batch.update(ref, { ...toUpdatePayload(row.data), updatedAt: now });
        }
        updated++;
      }
    }
    await batch.commit();
  }

  return { created, updated };
}
