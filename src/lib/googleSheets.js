// Upload tickets to the user's own Google Sheet with the Sheets API.
// Sign-in uses Google Identity Services (token popup) with the `drive.file` scope:
// the app can only touch the spreadsheet it created, so Google review is not needed.
// Rows are matched by ticket id (last column), so re-uploading updates instead of duplicating.

import { useSyncExternalStore } from 'react';
import { sheetName, formatSavedAt } from './exportXlsx.js';
import { t } from './i18n.js';

// OAuth Client IDs are public (Google sends them to every browser); VITE_GOOGLE_CLIENT_ID can override this one.
export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '45070709097-cdoubncdc977lvbnkanjujmbvt67go70.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPE = `openid email ${DRIVE_SCOPE}`;
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

// ---------- account + stored spreadsheet id ----------
// The signed-in account (email + access token) is kept in localStorage until the token expires,
// so a page reload doesn't sign the user out. Each account remembers its own spreadsheet.

const AUTH_KEY = 'gauth';
const sheetKey = (email) => (email ? `${SHEET_KEY}:${email}` : SHEET_KEY);

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    value == null ? localStorage.removeItem(key) : localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* storage blocked: works for this page only */
  }
}

let auth = readJson(AUTH_KEY); // { token, expiresAt, email } | null
const hasToken = () => Boolean(auth?.token && Date.now() < auth.expiresAt);

export function getSheetId(email = auth?.email) {
  try {
    const own = localStorage.getItem(sheetKey(email));
    if (own || !email) return own || '';
    // Sheet created before accounts were tracked: adopt it for the first account that signs in
    const legacy = localStorage.getItem(SHEET_KEY);
    if (legacy) {
      localStorage.setItem(sheetKey(email), legacy);
      localStorage.removeItem(SHEET_KEY);
    }
    return legacy || '';
  } catch {
    return '';
  }
}

function setSheetId(id) {
  write(sheetKey(auth?.email), id || null);
  notify();
}

export const sheetUrl = (id = getSheetId()) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '');

// Snapshot for React (stable object until something changes)
const listeners = new Set();
let snapshot;
function buildSnapshot() {
  snapshot = { email: auth?.email || '', signedIn: Boolean(auth?.email), sheetUrl: auth?.email ? sheetUrl() : '' };
}
function notify() {
  buildSnapshot();
  listeners.forEach((l) => l());
}
buildSnapshot();

/** { email, signedIn, sheetUrl }, re-rendering when the account or its sheet changes. */
export function useGoogleAccount() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => snapshot,
    () => snapshot,
  );
}

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

let tokenClient;

/** Open Google's popup. `chooseAccount` shows the account picker; otherwise the known account is reused. */
function requestToken(chooseAccount) {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google.accounts.oauth2;
    tokenClient ??= oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      if (!oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) return reject(new Error(t('gNeedDrive')));
      resolve({ token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) - 60) * 1000 });
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.type === 'popup_closed' ? t('gSignInCancelled') : err?.message || t('gSignInFailed')));
    tokenClient.requestAccessToken(chooseAccount || !auth?.email ? { prompt: 'select_account' } : { prompt: '', login_hint: auth.email });
  });
}

async function fetchEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(t('gSignInFailed'));
  return (await res.json()).email || '';
}

async function signInWith(chooseAccount) {
  await loadGis();
  const got = await requestToken(chooseAccount);
  const email = await fetchEmail(got.token);
  auth = { ...got, email };
  write(AUTH_KEY, auth);
  notify();
  return got.token;
}

/** Sign in from a button (always lets the user pick the account). */
export const signIn = () => signInWith(true).then(() => auth.email);

/** Sign out: revoke the token at Google and forget the account on this device (its sheet link is kept for next time). */
export function signOut() {
  const old = auth?.token;
  auth = null;
  write(AUTH_KEY, null);
  notify();
  if (old && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(old, () => {});
}

async function getToken() {
  if (hasToken()) return auth.token;
  return signInWith(false);
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
  if (res.status === 401 && auth) {
    auth = { ...auth, token: '', expiresAt: 0 }; // expired / revoked: next upload asks Google again
    write(AUTH_KEY, auth);
  }
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

  await getToken(); // sign in first, so we know which account's sheet to use
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
