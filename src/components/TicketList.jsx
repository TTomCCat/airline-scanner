import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, FileSpreadsheet, ListFilter, NotebookPen, Pencil, Trash2, X } from 'lucide-react';
import { listTickets, deleteTicket, deleteTickets, deleteFlight, clearAll, flightKey, updateTicket } from '../lib/db.js';
import { groupByFlight, filterTickets, hasFilters, EMPTY_FILTERS } from '../lib/groups.js';
import { exportFlight, exportAll } from '../lib/exportXlsx.js';
import { useT } from '../lib/i18n.js';

const pad = (n) => String(n).padStart(2, '0');

/** 08:05 21/11 */
function shortTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

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

export default function TicketList({ onToast = () => {} }) {
  const { t } = useT();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(null); // expanded ticket id
  const [collapsed, setCollapsed] = useState(() => new Set()); // collapsed flight keys
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTickets(await listTickets());
    } catch (e) {
      setError(e.message);
      setTickets([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtering = hasFilters(filters);
  const shown = useMemo(() => (tickets ? filterTickets(tickets, filters) : []), [tickets, filters]);
  const groups = useMemo(() => groupByFlight(shown), [shown]);
  const totalByFlight = useMemo(() => {
    const m = new Map();
    for (const tk of tickets || []) m.set(flightKey(tk), (m.get(flightKey(tk)) || 0) + 1);
    return m;
  }, [tickets]);
  const flightOptions = useMemo(() => [...new Set((tickets || []).map((tk) => tk.flight).filter(Boolean))].sort(), [tickets]);

  async function run(action, doneText) {
    setBusy(true);
    try {
      await action();
      if (doneText) onToast({ text: doneText, kind: 'ok' });
    } catch (e) {
      onToast({ text: t('errorMsg', { msg: e.message }), kind: 'err' });
    } finally {
      setBusy(false);
      load();
    }
  }

  function removeTicket(tk) {
    if (!confirm(t('confirmDeleteTicket', { name: tk.name || t('passenger'), seat: tk.seat || '—', flight: tk.flight }))) return;
    setOpen(null);
    run(() => deleteTicket(tk.id), t('deletedTicket'));
  }

  function removeFlight(g) {
    const n = totalByFlight.get(g.key) || g.tickets.length;
    if (!confirm(t('confirmDeleteFlight', { n, flight: g.flight, date: dmy(g.flightDate) }))) return;
    run(() => deleteFlight(g.key), t('deletedFlight', { flight: g.flight }));
  }

  function removeAll() {
    if (filtering) {
      if (!confirm(t('confirmDeleteFiltered', { n: shown.length }))) return;
      run(() => deleteTickets(shown.map((tk) => tk.id)), t('deletedN', { n: shown.length }));
    } else {
      if (!confirm(t('confirmDeleteAll', { n: tickets.length }))) return;
      run(clearAll, t('deletedAll'));
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
  if (!tickets.length) return <p className="card muted">{t('empty')}</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section>
      <div className="card filters">
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
          </div>
        )}
      </div>

      <div className="list-bar">
        <span className="muted small">
          {filtering ? t('nOfTotal', { n: shown.length, total: tickets.length }) : t('nTickets', { n: tickets.length })} ·{' '}
          {t('nFlights', { n: groups.length })}
        </span>
        <div className="list-bar-actions">
          <button className="small-btn" disabled={busy || !shown.length} onClick={exportEverything}>
            <FileSpreadsheet size={16} /> {filtering ? t('exportFiltered') : t('exportAll')}
          </button>
          <button className="danger small-btn" disabled={busy || !shown.length} onClick={removeAll}>
            <Trash2 size={16} /> {filtering ? t('deleteFiltered') : t('deleteAll')}
          </button>
        </div>
      </div>

      {!groups.length && <p className="card muted">{t('noMatch')}</p>}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const total = totalByFlight.get(g.key) || g.tickets.length;
        const partial = filtering && g.tickets.length !== total;
        return (
          <div key={g.key} className={`card group ${g.flightDate < today ? 'past' : ''}`}>
            <div className="group-head">
              <button className="group-title" onClick={() => toggleGroup(g.key)} aria-expanded={!isCollapsed}>
                <span className="group-flight">{g.flight || '—'}</span>
                <span>{dmy(g.flightDate)}</span>
                {g.from && (
                  <span className="muted">
                    {g.from}→{g.to}
                  </span>
                )}
                <span className="badge">{partial ? `${g.tickets.length}/${total}` : t('nTickets', { n: total })}</span>
                <span className="muted chevron">{isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</span>
              </button>
              <div className="group-actions">
                <button className="small-btn" disabled={busy} onClick={() => exportGroup(g)}>
                  <FileSpreadsheet size={16} /> {t('exportExcel')}
                  {partial ? t('exportPartial', { n: g.tickets.length }) : ''}
                </button>
                <button className="danger small-btn" disabled={busy} onClick={() => removeFlight(g)}>
                  <Trash2 size={16} /> {t('deleteFlight')}
                </button>
              </div>
            </div>

            {!isCollapsed &&
              g.tickets.map((tk) => (
                <div key={tk.id} className={`pax ${open === tk.id ? 'open' : ''}`}>
                  <div className="pax-row">
                    <button className="pax-main" onClick={() => setOpen(open === tk.id ? null : tk.id)} aria-expanded={open === tk.id}>
                      <span className="pax-name">{tk.name || '—'}</span>
                      <span className="pax-seat">{tk.seat || '—'}</span>
                      <span className="pax-time">
                        {tk.note && <NotebookPen size={14} className="note-mark" aria-label={t('hasNote')} />}
                        {shortTime(tk.savedAt)}
                      </span>
                    </button>
                    <button className="icon-btn" disabled={busy} onClick={() => removeTicket(tk)} aria-label={t('deleteTicket')}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                  {open === tk.id && <PaxDetail tk={tk} busy={busy} onSave={(patch) => saveEdit(tk, patch)} />}
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}
