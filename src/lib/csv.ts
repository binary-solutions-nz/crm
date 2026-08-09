// Minimal, dependency-free RFC4180-ish CSV codec — handles quoted fields,
// embedded commas/newlines, and doubled-quote escaping so it round-trips
// cleanly with Excel, Numbers and Google Sheets.

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function csvHeaders(rows: string[][]): string[] {
  return rows.length ? rows[0].map((h) => h.trim()) : [];
}

// Every header is guaranteed a key on every record, defaulting to '' when a
// row has fewer cells than the header — callers can rely on `raw[header]`.
export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = csvHeaders(rows);
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (r[idx] ?? '').trim();
    });
    return rec;
  });
}

function escapeCSVField(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCSV(headers: string[], records: Record<string, unknown>[]): string {
  const lines = [headers.map(escapeCSVField).join(',')];
  for (const rec of records) {
    lines.push(headers.map((h) => escapeCSVField(rec[h])).join(','));
  }
  return lines.join('\r\n');
}

// Prefixing a UTF-8 BOM keeps Excel from mangling non-ASCII characters when
// it opens the downloaded file.
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
