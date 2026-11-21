// Upload tickets to the user's own Google Sheet with the Sheets API.
// Sign-in uses Google Identity Services (token popup) with the `drive.file` scope:
// the app can only touch the spreadsheet it created, so Google review is not needed.
// Rows are matched by ticket id (last column), so re-uploading updates instead of duplicating.

import { sheetName, formatSavedAt } from './exportXlsx.js';
import { t } from './i18n.js';

// OAuth Client IDs are public (Google sends them to every browser); VITE_GOOGLE_CLIENT_ID can override this one.
export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '45070709097-cdoubncdc977lvbnkanjujmbvt67go70.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_KEY = 'gsheetId';
const COLS = 10; // A..J
const LAST_COL = 'J';
const ID_COL = COLS - 1;

export const isConfigured = () => Boolean(CLIENT_ID);

// ---------- pure helpers (tested) ----------

export function headerRow() {
  return [t('gTime'), t('gFlight'), t('gDate'), t('gFrom'), t('gTo'), t('gName'), t('gSeat'), t('xRaw'), t('xNote'), 'ID'];
}

export function ticketRow(tk) {
  return [
    tk.savedAt ? formatSavedAt(tk.savedAt) : '',
    tk.flight || '',
    tk.flightDate || '',
    tk.from || '',
    tk.to || '',
    tk.name || '',
    tk.seat || '',
    tk.raw || '',
    tk.note || '',
    tk.id,
  ];
}

/** 'VN0213 22-11' → "'VN0213 22-11'" (A1 notation quoting). */
export const quoteTab = (title) => `'${title.replace(/'/g, "''")}'`;

/** Tab name per flight group (stable, so the same flight always lands in the same tab). */
export const tabFor = (group) => sheetName(group);

/**
 * Work out which cells to write.
 * @param groups      [{ flight, flightDate, tickets }]
 * @param existing    Map(tabTitle → rows already in that tab, as returned by values.batchGet)
 * @returns {{ data: {range, values}[], added: number, updated: number }}
 */
export function planUpload(groups, existing = new Map()) {
  const tabs = new Map(); // title → { next, ids }
  const data = [];
  let added = 0;
  let updated = 0;

  for (const g of groups) {
    const title = tabFor(g);
    let tab = tabs.get(title);
    if (!tab) {
      const rows = existing.get(title) || [];
      const ids = new Map();
      rows.forEach((r, i) => {
        if (i > 0 && r?.[ID_COL]) ids.set(r[ID_COL], i + 1);
      });
      if (!rows.length) data.push({ range: `${quoteTab(title)}!A1:${LAST_COL}1`, values: [headerRow()] });
      tab = { next: Math.max(rows.length, 1) + 1, ids };
      tabs.set(title, tab);
    }
    const sorted = [...g.tickets].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    for (const tk of sorted) {
      let row = tab.ids.get(tk.id);
      if (row) updated++;
      else {
        row = tab.next++;
        tab.ids.set(tk.id, row);
        added++;
      }
      data.push({ range: `${quoteTab(title)}!A${row}:${LAST_COL}${row}`, values: [ticketRow(tk)] });
    }
  }
  return { data, added, updated };
}

// ---------- stored spreadsheet id ----------

export function getSheetId() {
  try {
    return localStorage.getItem(SHEET_KEY) || '';
  } catch {
    return '';
  }
}

function setSheetId(id) {
  try {
    id ? localStorage.setItem(SHEET_KEY, id) : localStorage.removeItem(SHEET_KEY);
  } catch {
    /* storage blocked: a new sheet will be created next time */
  }
}

export const sheetUrl = (id = getSheetId()) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '');

// ---------- Google sign-in ----------

let gisPromise;
/** Load the Google Identity Services script (call early so the sign-in popup opens straight from the click). */
export function loadGis() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = undefined;
      reject(new Error(t('gLoadFailed')));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

let token = null; // { value, expiresAt }
let tokenClient;

function requestToken() {
  return new Promise((resolve, reject) => {
    tokenClient ??= window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      token = { value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) - 60) * 1000 };
      resolve(token.value);
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.type === 'popup_closed' ? t('gSignInCancelled') : err?.message || t('gSignInFailed')));
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function getToken() {
  if (token && Date.now() < token.expiresAt) return token.value;
  await loadGis();
  return requestToken();
}

// ---------- Sheets API ----------

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return res.json();
  if (res.status === 401) token = null; // expired / revoked: next click signs in again
  let msg = res.statusText;
  try {
    msg = (await res.json()).error?.message || msg;
  } catch {
    /* not JSON */
  }
  throw new ApiError(res.status, msg);
}

async function createSpreadsheet(titles) {
  const ss = await api('', {
    method: 'POST',
    body: { properties: { title: t('gSheetTitle') }, sheets: titles.map((title) => ({ properties: { title } })) },
  });
  setSheetId(ss.spreadsheetId);
  return ss.spreadsheetId;
}

/** Existing tab titles, or null when the stored sheet is gone (deleted, or access removed). */
async function tabTitles(id) {
  try {
    const ss = await api(`/${id}?fields=sheets.properties.title`);
    return (ss.sheets || []).map((s) => s.properties.title);
  } catch (e) {
    if (e.status === 404 || e.status === 403) return null;
    throw e;
  }
}

/**
 * Upload flight groups. Creates the spreadsheet on first use, adds missing tabs,
 * updates rows whose ticket id is already there and appends the rest.
 */
export async function uploadToSheets(groups) {
  if (!isConfigured()) throw new Error(t('gNotConfigured'));
  const titles = [...new Set(groups.map(tabFor))];
  const existing = new Map();

  let id = getSheetId();
  let present = id ? await tabTitles(id) : null;
  if (!present) {
    id = await createSpreadsheet(titles);
    present = titles; // all brand new and empty
  } else {
    const missing = titles.filter((title) => !present.includes(title));
    if (missing.length) {
      await api(`/${id}:batchUpdate`, { method: 'POST', body: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
    }
    const toRead = titles.filter((title) => present.includes(title));
    if (toRead.length) {
      const qs = toRead.map((title) => `ranges=${encodeURIComponent(`${quoteTab(title)}!A:${LAST_COL}`)}`).join('&');
      const res = await api(`/${id}/values:batchGet?${qs}`);
      (res.valueRanges || []).forEach((vr, i) => existing.set(toRead[i], vr.values || []));
    }
  }

  const { data, added, updated } = planUpload(groups, existing);
  if (data.length) await api(`/${id}/values:batchUpdate`, { method: 'POST', body: { valueInputOption: 'RAW', data } });
  return { added, updated, url: sheetUrl(id) };
}
