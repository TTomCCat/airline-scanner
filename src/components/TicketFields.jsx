// Shared display of one flight leg as a boarding-pass style card.

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ label, value, big }) {
  if (!value) return null;
  return (
    <div className={`field ${big ? 'big' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export default function TicketFields({ t }) {
  const ff = t.frequentFlyerNumber ? `${t.frequentFlyerAirline || ''} ${t.frequentFlyerNumber}`.trim() : '';
  return (
    <div className="ticket">
      <div className="route">
        <div>
          <div className="code">{t.from}</div>
          <div className="city">{t.fromCity}</div>
        </div>
        <div className="plane">✈</div>
        <div className="right">
          <div className="code">{t.to}</div>
          <div className="city">{t.toCity}</div>
        </div>
      </div>
      <div className="grid">
        <Field label="Passenger" value={t.name} big />
        <Field label="Flight" value={t.flight} big />
        <Field label="Date" value={formatDate(t.flightDate)} />
        <Field label="Seat" value={t.seat} big />
        <Field label="Class" value={t.cabinName ? `${t.cabinName} (${t.cabin})` : t.cabin} />
        <Field label="Booking ref (PNR)" value={t.pnr} />
        <Field label="Sequence" value={t.sequence} />
        <Field label="Gate" value={t.gate} />
        <Field label="Boarding" value={t.boardingTime} />
        <Field label="Ticket no." value={t.ticketNumber} />
        <Field label="Frequent flyer" value={ff} />
        <Field label="Baggage" value={t.freeBaggage} />
      </div>
      {t.notes && <p className="notes">{t.notes}</p>}
    </div>
  );
}
