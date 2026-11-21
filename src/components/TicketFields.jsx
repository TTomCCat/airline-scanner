// Shared display of one flight leg as a boarding-pass style card.
import { Plane } from 'lucide-react';
import { useT, locale } from '../lib/i18n.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

/** `ticket` is one leg of a parsed boarding pass (or a saved ticket). */
export default function TicketFields({ ticket: tk }) {
  const { t } = useT();
  const ff = tk.frequentFlyerNumber ? `${tk.frequentFlyerAirline || ''} ${tk.frequentFlyerNumber}`.trim() : '';
  return (
    <div className="ticket">
      <div className="route">
        <div>
          <div className="code">{tk.from}</div>
          <div className="city">{tk.fromCity}</div>
        </div>
        <div className="plane">
          <Plane size={22} strokeWidth={1.75} />
        </div>
        <div className="right">
          <div className="code">{tk.to}</div>
          <div className="city">{tk.toCity}</div>
        </div>
      </div>
      <div className="grid">
        <Field label={t('fPassenger')} value={tk.name} big />
        <Field label={t('fFlight')} value={tk.flight} big />
        <Field label={t('fDate')} value={formatDate(tk.flightDate)} />
        <Field label={t('fSeat')} value={tk.seat} big />
        <Field label={t('fClass')} value={tk.cabinName ? `${tk.cabinName} (${tk.cabin})` : tk.cabin} />
        <Field label={t('fPnr')} value={tk.pnr} />
        <Field label={t('fSequence')} value={tk.sequence} />
        <Field label={t('fGate')} value={tk.gate} />
        <Field label={t('fBoarding')} value={tk.boardingTime} />
        <Field label={t('fTicketNo')} value={tk.ticketNumber} />
        <Field label={t('fFrequentFlyer')} value={ff} />
        <Field label={t('fBaggage')} value={tk.freeBaggage} />
      </div>
      {(tk.note || tk.notes) && <p className="notes">{tk.note || tk.notes}</p>}
    </div>
  );
}
