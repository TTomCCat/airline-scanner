// One flight leg drawn as a boarding pass: main part, a tear line, then a stub with seat / gate / boarding.
import { Plane } from 'lucide-react';
import { useT, locale } from '../lib/i18n.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ label, value, big, code }) {
  if (!value) return null;
  return (
    <div className={`field ${big ? 'big' : ''}`}>
      <span className="label">{label}</span>
      <span className={`value ${code ? 'code-font' : ''}`}>{value}</span>
    </div>
  );
}

/** `ticket` is one leg of a parsed boarding pass (or a saved ticket). */
export default function TicketFields({ ticket: tk }) {
  const { t } = useT();
  const ff = tk.frequentFlyerNumber ? `${tk.frequentFlyerAirline || ''} ${tk.frequentFlyerNumber}`.trim() : '';
  return (
    <div className="ticket">
      <div className="ticket-main">
        <div className="ticket-top">
          <span className="ticket-kind">{t('boardingPass')}</span>
          <span className="ticket-flight code-font">{tk.flight}</span>
        </div>
        <div className="route">
          <div>
            <div className="code">{tk.from}</div>
            <div className="city">{tk.fromCity}</div>
          </div>
          <div className="flight-path" aria-hidden="true">
            <span className="path-line" />
            <Plane size={20} strokeWidth={1.75} />
            <span className="path-line" />
          </div>
          <div className="right">
            <div className="code">{tk.to}</div>
            <div className="city">{tk.toCity}</div>
          </div>
        </div>
        <div className="grid">
          <Field label={t('fPassenger')} value={tk.name} big />
          <Field label={t('fDate')} value={formatDate(tk.flightDate)} />
          <Field label={t('fClass')} value={tk.cabinName ? `${tk.cabinName} (${tk.cabin})` : tk.cabin} />
          <Field label={t('fPnr')} value={tk.pnr} code />
          <Field label={t('fTicketNo')} value={tk.ticketNumber} code />
          <Field label={t('fFrequentFlyer')} value={ff} />
          <Field label={t('fBaggage')} value={tk.freeBaggage} />
        </div>
      </div>

      <div className="ticket-tear" aria-hidden="true" />

      <div className="ticket-stub">
        <div className="stub-seat">
          <span className="label">{t('fSeat')}</span>
          <span className="code-font">{tk.seat || '—'}</span>
        </div>
        <Field label={t('fGate')} value={tk.gate} code />
        <Field label={t('fBoarding')} value={tk.boardingTime} code />
        <Field label={t('fSequence')} value={tk.sequence} code />
      </div>
      {(tk.note || tk.notes) && <p className="notes">{tk.note || tk.notes}</p>}
    </div>
  );
}
