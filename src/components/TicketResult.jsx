import { useState } from 'react';
import TicketFields from './TicketFields.jsx';
import { saveTicket } from '../lib/db.js';

export default function TicketResult({ parsed, onSaved, onCancel }) {
  const [extra, setExtra] = useState({ gate: '', boardingTime: '', notes: '' });
  const [showRaw, setShowRaw] = useState(false);
  const [status, setStatus] = useState('');

  const passenger = {
    name: parsed.name,
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    raw: parsed.raw,
  };
  const tickets = parsed.legs.map((leg) => ({ ...passenger, ...leg, ...extra }));

  async function save() {
    try {
      let updated = 0;
      for (const t of tickets) if (await saveTicket(t)) updated++;
      setStatus(updated ? 'Already saved — updated it.' : 'Saved!');
      setTimeout(onSaved, 600);
    } catch (e) {
      setStatus(`Could not save: ${e.message}`);
    }
  }

  const set = (k) => (e) => setExtra({ ...extra, [k]: e.target.value });

  return (
    <section className="card">
      <h2>Boarding pass info</h2>
      {tickets.map((t, i) => (
        <TicketFields key={i} t={t} />
      ))}

      {parsed.warnings.length > 0 && <p className="muted">⚠ {parsed.warnings.join(', ')}</p>}

      <p className="muted small">Not in the barcode — add from the paper ticket if you want:</p>
      <div className="inputs">
        <label>
          Gate
          <input value={extra.gate} onChange={set('gate')} placeholder="26" />
        </label>
        <label>
          Boarding time
          <input type="time" value={extra.boardingTime} onChange={set('boardingTime')} />
        </label>
        <label className="wide">
          Notes
          <input value={extra.notes} onChange={set('notes')} placeholder="Lounge, etc." />
        </label>
      </div>

      <div className="actions">
        <button className="primary" onClick={save}>
          💾 Save ticket
        </button>
        <button onClick={onCancel}>Scan another</button>
        <button className="link" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? 'Hide' : 'Show'} raw barcode
        </button>
      </div>
      {status && <p className="status">{status}</p>}
      {showRaw && <pre className="raw">{parsed.raw}</pre>}
    </section>
  );
}
