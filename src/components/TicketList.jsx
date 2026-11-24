import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, CloudUpload, FileSpreadsheet, ListFilter, NotebookPen, Pencil, ScanBarcode, Search, Ticket, Trash2, X } from 'lucide-react';
import { listTickets, deleteTicket, deleteTickets, deleteFlight, clearAll, flightKey, updateTicket, restoreTickets } from '../lib/db.js';
import { groupByFlight, filterTickets, findDuplicates, hasFilters, EMPTY_FILTERS } from '../lib/groups.js';
import { exportFlight, exportAll } from '../lib/exportXlsx.js';
import { isConfigured as sheetsConfigured, loadGis, uploadToSheets } from '../lib/googleSheets.js';
import GoogleAccountBar from './GoogleAccountBar.jsx';
import Menu from './Menu.jsx';
import { useT } from '../lib/i18n.js';
import { relTime, shortTime, useNow } from '../lib/time.js';

const pad = (n) => String(n).padStart(2, '0');

/** Today's date (local time) as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "NGUYEN/VAN A" → "NV" */
function initials(name) {
  const [last = '', first = ''] = String(name || '').split('/');
  const a = last.trim()[0] || '';
  const b = first.trim()[0] || last.trim()[1] || '';
  return (a + b).toUpperCase() || '?';
}

const FRESH_MS = 15_000; // rows saved this recently slide in

/** 2026-11-21 → 21/11/2026 */
function dmy(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Expanded card: raw code + note, with an Edit mode for name, seat and note. */
function PaxDetail({ tk, busy, onSave }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', seat: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    setForm({ name: tk.name || '', seat: tk.seat || '', note: tk.note || '' });
    setError('');
    setEditing(true);
  }

  async function submit(e) {
    e.preventDefault();
    const patch = { name: form.name.trim(), seat: form.seat.trim().toUpperCase(), note: form.note.trim() };
    if (!patch.name) return setError(t('nameRequired'));
    setSaving(true);
    const ok = await onSave(patch);
    setSaving(false);
    if (ok) setEditing(false);
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (editing) {
    return (
      <form className="pax-detail pax-edit" onSubmit={submit}>
        <div className="inputs">
          <label>
            {t('editName')}
            <input value={form.name} onChange={set('name')} autoFocus disabled={saving} />
          </label>
          <label>
            {t('editSeat')}
            <input value={form.seat} onChange={set('seat')} maxLength={4} disabled={saving} />
          </label>
          <label className="wide">
            {t('editNote')}
            <textarea rows={2} value={form.note} onChange={set('note')} disabled={saving} />
          </label>
        </div>
        {error && <p className="error-text small">{error}</p>}
        <span className="label">{t('rawCode')}</span>
        <pre className="raw">{tk.raw}</pre>
        <div className="actions">
          <button type="submit" className="primary small-btn" disabled={saving || busy}>
            {saving ? <span className="spinner" aria-hidden="true" /> : <Check size={16} />} {saving ? t('saving') : t('saveChanges')}
          </button>
          <button type="button" className="small-btn" onClick={() => setEditing(false)} disabled={saving}>
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="pax-detail">
      <span className="label">{t('rawCode')}</span>
      <pre className="raw">{tk.raw}</pre>
      {tk.note && (
        <>
          <span className="label">{t('note')}</span>
          <p className="pax-note">{tk.note}</p>
        </>
      )}
      <div className="actions">
        <button className="small-btn" onClick={startEdit} disabled={busy}>
          <Pencil size={14} /> {t('edit')}
        </button>
      </div>
    </div>
  );
}

export default function TicketList({ onToast = () => {}, onChanged = () => {}, onGoScan = () => {} }) {
  const { t } = useT();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(null); // expanded ticket id
  const [collapsed, setCollapsed] = useState(() => new Set()); // collapsed flight keys
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const now = useNow();

  async function load() {
    try {
      const list = await listTickets();
      setTickets(list);
      onChanged(list);
    } catch (e) {
      setError(e.message);
      setTickets([]);
    }
  }

  useEffect(() => {
    load();
    // Load Google Sign-In early so the sign-in popup opens directly from the button tap
    if (sheetsConfigured()) loadGis().catch(() => {});
  }, []);

  const filtering = hasFilters(filters);
  // Duplicates are found across ALL tickets, so a filter never hides the other half of a pair
  const dups = useMemo(() => findDuplicates(tickets || []), [tickets]);
  const shown = useMemo(() => (tickets ? filterTickets(tickets, filters, dups) : []), [tickets, filters, dups]);
  const dupByFlight = useMemo(() => {
    const m = new Map();
    for (const tk of tickets || []) if (dups.has(tk.id)) m.set(flightKey(tk), (m.get(flightKey(tk)) || 0) + 1);
    return m;
  }, [tickets, dups]);
  const groups = useMemo(() => groupByFlight(shown), [shown]);
  const totalByFlight = useMemo(() => {
    const m = new Map();
    for (const tk of tickets || []) m.set(flightKey(tk), (m.get(flightKey(tk)) || 0) + 1);
    return m;
  }, [tickets]);
  const flightOptions = useMemo(() => [...new Set((tickets || []).map((tk) => tk.flight).filter(Boolean))].sort(), [tickets]);

  /** Run a change; `undo` (deleted records) adds an Undo button to the toast that puts them back. */
  async function run(action, doneText, undo) {
    setBusy(true);
    try {
      await action();
      if (doneText) onToast({ text: doneText, kind: 'ok', action: undo?.length ? { label: t('undo'), onClick: () => restore(undo) } : undefined });
    } catch (e) {
      onToast({ text: t('errorMsg', { msg: e.message }), kind: 'err' });
    } finally {
      setBusy(false);
      load();
    }
  }

  function restore(records) {
    run(() => restoreTickets(records), t('restoredN', { n: records.length }));
  }

  // Single ticket / single flight: delete straight away, Undo in the toast.
  function removeTicket(tk) {
    setOpen(null);
    const who = [tk.name || t('passenger'), tk.seat && t('seatN', { seat: tk.seat })].filter(Boolean).join(' · ');
    run(() => deleteTicket(tk.id), t('deletedTicketWho', { who }), [tk]);
  }

  function removeFlight(g) {
    const records = tickets.filter((tk) => flightKey(tk) === g.key);
    run(() => deleteFlight(g.key), t('deletedFlight', { flight: g.flight, n: records.length }), records);
  }

  // Bulk delete still asks first (it's rare and big), and can also be undone.
  function removeAll() {
    if (filtering) {
      if (!confirm(t('confirmDeleteFiltered', { n: shown.length }))) return;
      const records = [...shown];
      run(() => deleteTickets(records.map((tk) => tk.id)), t('deletedN', { n: records.length }), records);
    } else {
      if (!confirm(t('confirmDeleteAll', { n: tickets.length }))) return;
      const records = [...tickets];
      run(clearAll, t('deletedAll'), records);
    }
  }

  /** Returns true when saved, so the edit form can close. */
  async function saveEdit(tk, patch) {
    const who = [patch.name, patch.seat && t('seatN', { seat: patch.seat })].filter(Boolean).join(' · ');
    let ok = false;
    await run(async () => {
      await updateTicket(tk.id, patch);
      ok = true;
    }, t('updated', { who }));
    return ok;
  }

  function exportGroup(g) {
    run(() => exportFlight(g, g.tickets), t('exportedFlight', { n: g.tickets.length, flight: g.flight }));
  }

  /** Everything currently shown (all tickets, or the filtered ones) → one file, one sheet per flight. */
  function exportEverything() {
    run(() => exportAll(groups), t('exportedAll', { n: shown.length, flights: groups.length }));
  }

  /** Everything currently shown → the user's Google Sheet (one tab per flight, rows matched by ticket id). */
  async function uploadEverything() {
    setUploading(true);
    await run(async () => {
      const { added, updated } = await uploadToSheets(groups);
      onToast({ text: t('gUploaded', { added, updated }), kind: 'ok' });
    });
    setUploading(false);
  }

  function toggleGroup(key) {
    setCollapsed((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  if (!tickets) return <p className="muted">{t('loading')}</p>;
  if (error) return <p className="card error">{t('storageError', { msg: error })}</p>;
  if (!tickets.length)
    return (
      <div className="card empty-state">
        <Ticket size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2>{t('emptyTitle')}</h2>
        <p className="muted">{t('emptyBody')}</p>
        <button className="primary" onClick={onGoScan}>
          <ScanBarcode size={16} /> {t('emptyCta')}
        </button>
      </div>
    );

  const today = localToday();

  return (
    <section>
      <div className="card filters">
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={filters.q}
            onChange={setF('q')}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
          {filters.q && (
            <button className="icon-btn" onClick={() => setFilters({ ...filters, q: '' })} aria-label={t('clearSearch')}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="filters-head">
          <button className="link" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
            <ListFilter size={16} /> {t('filters')} {filtering ? t('filtering') : ''}
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {filtering && (
            <button className="link" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} /> {t('clearFilters')}
            </button>
          )}
        </div>
        {showFilters && (
          <div className="inputs">
            <label>
              {t('filterFlight')}
              <input value={filters.flight} onChange={setF('flight')} list="flight-options" placeholder="VN 213" />
              <datalist id="flight-options">
                {flightOptions.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label>
              {t('filterSeat')}
              <input value={filters.seat} onChange={setF('seat')} placeholder="12A" />
            </label>
            <label>
              {t('filterDate')}
              <input type="date" value={filters.flightDate} onChange={setF('flightDate')} />
            </label>
            <label>
              {t('filterName')}
              <input value={filters.name} onChange={setF('name')} placeholder="Nguyen Van A" />
            </label>
            <label>
              {t('savedFrom')}
              <input type="datetime-local" value={filters.savedFrom} onChange={setF('savedFrom')} />
            </label>
            <label>
              {t('savedTo')}
              <input type="datetime-local" value={filters.savedTo} onChange={setF('savedTo')} />
            </label>
            <label className="check-label">
              <input type="checkbox" checked={filters.dupOnly} onChange={(e) => setFilters({ ...filters, dupOnly: e.target.checked })} />
              {t('dupOnly')}
            </label>
          </div>
        )}
      </div>

      {sheetsConfigured() && <GoogleAccountBar busy={busy} onToast={onToast} />}

      <div className="list-bar">
        <span className="muted small">
          {filtering ? t('nOfTotal', { n: shown.length, total: tickets.length }) : t('nTickets', { n: tickets.length })} ·{' '}
          {t('nFlights', { n: groups.length })}
        </span>
        <div className="list-bar-actions">
          <button className="small-btn" disabled={busy || !shown.length} onClick={exportEverything}>
            <FileSpreadsheet size={16} /> {filtering ? t('exportFiltered') : t('exportAll')}
          </button>
          {uploading && (
            <span className="muted small with-icon">
              <span className="spinner" aria-hidden="true" /> {t('gUploading')}
            </span>
          )}
          <Menu
            label={t('moreActions')}
            disabled={busy || !shown.length}
            items={[
              sheetsConfigured() && { label: filtering ? t('gUploadFiltered') : t('gUpload'), icon: CloudUpload, onClick: uploadEverything },
              { label: filtering ? t('deleteFiltered') : t('deleteAll'), icon: Trash2, onClick: removeAll, danger: true },
            ]}
          />
        </div>
      </div>

      {!groups.length && <p className="card muted">{t('noMatch')}</p>}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const total = totalByFlight.get(g.key) || g.tickets.length;
        const partial = filtering && g.tickets.length !== total;
        const nDup = dupByFlight.get(g.key) || 0;
        const status = g.flightDate === today ? 'today' : g.flightDate > today ? 'upcoming' : 'past';
        const statusLabel = { today: t('statusToday'), upcoming: t('statusUpcoming'), past: t('statusPast') }[status];
        return (
          <div key={g.key} className={`card group ${status}`}>
            <div className="group-head">
              <button className="group-title" onClick={() => toggleGroup(g.key)} aria-expanded={!isCollapsed}>
                <span className="group-line">
                  <span className="group-flight code-font">{g.flight || '—'}</span>
                  <span className={`status-chip ${status}`}>{statusLabel}</span>
                </span>
                <span className="group-meta">
                  {dmy(g.flightDate)}
                  {g.from && ` · ${g.from} → ${g.to}`}
                  {nDup > 0 && (
                    <span className="badge warn">
                      <AlertTriangle size={12} aria-hidden="true" /> {t('nDup', { n: nDup })}
                    </span>
                  )}
                </span>
                <span className="group-count">
                  <strong>{partial ? `${g.tickets.length}/${total}` : total}</strong>
                  <span className="chevron">{isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</span>
                </span>
              </button>
              <Menu
                label={t('flightActions', { flight: g.flight || '—' })}
                disabled={busy}
                items={[
                  { label: t('exportExcel') + (partial ? t('exportPartial', { n: g.tickets.length }) : ''), icon: FileSpreadsheet, onClick: () => exportGroup(g) },
                  { label: t('deleteFlight'), icon: Trash2, onClick: () => removeFlight(g), danger: true },
                ]}
              />
            </div>

            {!isCollapsed &&
              g.tickets.map((tk) => {
                const dup = dups.get(tk.id);
                const dupLabel = dup && [dup.seat && t('dupSeatMark'), dup.name && t('dupNameMark')].filter(Boolean).join(', ');
                return (
                <div
                  key={tk.id}
                  className={`pax ${open === tk.id ? 'open' : ''} ${dup ? 'dup' : ''} ${now - tk.savedAt < FRESH_MS ? 'fresh' : ''}`}
                >
                  <div className="pax-row">
                    <button className="pax-main" onClick={() => setOpen(open === tk.id ? null : tk.id)} aria-expanded={open === tk.id}>
                      <span className={`avatar ${dup ? 'warn' : ''}`} aria-hidden="true">
                        {initials(tk.name)}
                      </span>
                      <span className="pax-info">
                        <span className="pax-name">{tk.name || '—'}</span>
                        <span className="pax-sub">
                          <span title={shortTime(tk.savedAt)}>{relTime(tk.savedAt, now)}</span>
                          {tk.note && <NotebookPen size={13} className="note-mark" aria-label={t('hasNote')} />}
                          {dup && (
                            <span className="badge warn mini">
                              <AlertTriangle size={11} aria-hidden="true" /> {dupLabel}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className={`seat-chip code-font ${dup?.seat ? 'warn' : ''}`}>{tk.seat || '—'}</span>
                    </button>
                    <button className="icon-btn" disabled={busy} onClick={() => removeTicket(tk)} aria-label={t('deleteTicket')}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                  {open === tk.id && <PaxDetail tk={tk} busy={busy} onSave={(patch) => saveEdit(tk, patch)} />}
                </div>
                );
              })}
          </div>
        );
      })}
    </section>
  );
}
