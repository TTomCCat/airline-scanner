import { useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import TicketFields from './TicketFields.jsx';
import { saveTicket } from '../lib/db.js';
import { duplicatesOf, ticketsFromParsed } from '../lib/tickets.js';
import { useT } from '../lib/i18n.js';

const pad = (n) => String(n).padStart(2, '0');
const shortTime = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/**
 * Shows a scanned pass, lets the user add a note and save it without leaving the Scan tab.
 * Warns (but still saves) when the flight already has a ticket with the same seat or name.
 */
export default function TicketResult({ parsed, saved = [], onSaved, onCancel }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tickets = ticketsFromParsed(parsed, note);
  const matches = duplicatesOf(tickets, saved);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      for (const tk of tickets) await saveTicket(tk);
      onSaved({ tickets, dupCount: matches.length });
    } catch (e) {
      setError(t('saveFailed', { msg: e.message }));
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('passengerInfo')}</h2>
      {tickets.map((tk, i) => (
        <TicketFields key={i} ticket={{ ...tk, note: '' }} />
      ))}

      {parsed.warnings.length > 0 && (
        <p className="muted with-icon">
          <AlertTriangle size={14} /> {parsed.warnings.join(', ')}
        </p>
      )}

      {matches.length > 0 && (
        <div className="dup-warn" role="alert">
          <strong className="with-icon">
            <AlertTriangle size={16} /> {t('dupWarnTitle')}
          </strong>
          <ul>
            {matches.map(({ ticket: m, seat }) => (
              <li key={m.id}>
                {t(seat ? 'dupSeat' : 'dupName', { seat: m.seat || '—', name: m.name || t('passenger'), time: shortTime(m.savedAt) })}
              </li>
            ))}
          </ul>
          <span className="muted small">{t('dupSaveHint')}</span>
        </div>
      )}

      <label className="note-label">
        {t('noteLabel')}
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // Enter saves; Shift+Enter = new line
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder={t('notePlaceholder')}
          disabled={saving}
        />
      </label>

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? (
            <>
              <span className="spinner" aria-hidden="true" /> {t('saving')}
            </>
          ) : (
            <>
              <Save size={16} /> {t('save')}
            </>
          )}
        </button>
        <button onClick={onCancel} disabled={saving}>
          {t('cancelScan')}
        </button>
        <button className="link" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? t('hideRaw') : t('showRaw')}
        </button>
      </div>
      {error && <p className="status error-text">{error}</p>}
      {showRaw && <pre className="raw">{parsed.raw}</pre>}
    </section>
  );
}
