import { useEffect, useState } from 'react';
import TicketFields from './TicketFields.jsx';
import { listTickets, deleteTicket } from '../lib/db.js';

export default function TicketList() {
  const [tickets, setTickets] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

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

  async function remove(t) {
    if (!confirm(`Delete ${t.flight} ${t.from}→${t.to} on ${t.flightDate}?`)) return;
    await deleteTicket(t.id);
    setOpen(null);
    load();
  }

  if (!tickets) return <p className="muted">Loading…</p>;
  if (error) return <p className="card error">Storage error: {error}</p>;
  if (!tickets.length) return <p className="card muted">No saved tickets yet. Scan one first.</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section>
      <p className="muted small">{tickets.length} saved ticket(s)</p>
      {tickets.map((t) => (
        <div key={t.id} className={`card list-item ${t.flightDate < today ? 'past' : ''}`}>
          <button className="row" onClick={() => setOpen(open === t.id ? null : t.id)}>
            <span className="row-route">
              {t.from} → {t.to}
            </span>
            <span>{t.flight}</span>
            <span>{t.flightDate}</span>
            <span className="row-seat">{t.seat}</span>
          </button>
          {open === t.id && (
            <>
              <TicketFields t={t} />
              <div className="actions">
                <button className="danger" onClick={() => remove(t)}>
                  🗑 Delete
                </button>
              </div>
              <pre className="raw">{t.raw}</pre>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
