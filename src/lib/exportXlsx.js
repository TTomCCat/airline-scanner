// Export tickets to .xlsx: saved time, raw barcode, note.
// SheetJS is loaded on demand so it doesn't weigh down the main bundle.

import { t } from './i18n.js';
const pad = (n) => String(n).padStart(2, '0');

/** 21/11/2026 08:05:09 */
export function formatSavedAt(ms) {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Rows for the sheet (header + one row per ticket, oldest first). */
export function exportRows(tickets) {
  const sorted = [...tickets].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  return [[t('xTime'), t('xRaw'), t('xNote')], ...sorted.map((tk) => [formatSavedAt(tk.savedAt), tk.raw || '', tk.note || ''])];
}

export function exportFileName(group) {
  const flight = (group.flight || 'chuyen-bay').replace(/\s+/g, '');
  return `${flight}_${group.flightDate || 'khong-ngay'}.xlsx`;
}

/** File name for the all-flights export, e.g. "tat-ca-ve_2026-11-21.xlsx" / "all-tickets_2026-11-21.xlsx". */
export function exportAllFileName(now = new Date()) {
  return `${t('xAllFile')}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
}

/**
 * Excel sheet name for a flight: "VN0213 22-11", max 31 chars, no : \ / ? * [ ],
 * made unique against names already used in the workbook.
 */
export function sheetName(group, used = new Set()) {
  const [, m, d] = (group.flightDate || '').split('-');
  const base = `${(group.flight || 'Chuyen').replace(/\s+/g, '')}${d ? ` ${d}-${m}` : ''}`
    .replace(/[:\\/?*[\]]/g, '')
    .slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)}_${i}`;
  used.add(name.toLowerCase());
  return name;
}

function buildSheet(XLSX, tickets) {
  const rows = exportRows(tickets);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Force every cell to text so Excel never reformats the raw code or the time
  for (const addr of Object.keys(ws)) {
    if (addr[0] !== '!') ws[addr] = { t: 's', v: String(ws[addr].v ?? ''), z: '@' };
  }
  ws['!cols'] = [{ wch: 20 }, { wch: Math.min(100, Math.max(40, ...rows.map((r) => r[1].length))) }, { wch: 30 }];
  return ws;
}

/** One flight → one file with one sheet. */
export async function exportFlight(group, tickets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, tickets), sheetName(group));
  XLSX.writeFile(wb, exportFileName(group));
}

/** Several flights → one file, one sheet per flight (same 3 columns on each sheet). */
export async function exportAll(groups) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const g of groups) XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, g.tickets), sheetName(g, used));
  XLSX.writeFile(wb, exportAllFileName());
}
