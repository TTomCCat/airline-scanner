import { useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import TicketFields from './TicketFields.jsx';
import { saveTicket } from '../lib/db.js';
import { useT } from '../lib/i18n.js';

/** Shows a scanned pass, lets the user add a note and save it without leaving the Scan tab. */
export default function TicketResult({ parsed, onSaved, onCancel }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const passenger = {
    name: parsed.name,
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    raw: parsed.raw,
  };
  const tickets = parsed.legs.map((leg) => ({ ...passenger, ...leg, note: note.trim() }));

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let existed = false;
      for (const tk of tickets) if (await saveTicket(tk)) existed = true;
      onSaved({ tickets, existed });
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
