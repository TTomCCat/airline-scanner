import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plane } from 'lucide-react';
import Scanner from './components/Scanner.jsx';
import TicketResult from './components/TicketResult.jsx';
import TicketList from './components/TicketList.jsx';
import Toast from './components/Toast.jsx';
import { parseBCBP } from './lib/bcbp.js';
import { listTickets, saveTicket, flightKey } from './lib/db.js';
import { findDuplicates } from './lib/groups.js';
import { scanFeedback } from './lib/feedback.js';
import { getSetting } from './lib/settings.js';
import { currentFlight, duplicatesOf, ticketsFromParsed } from './lib/tickets.js';
import { useKeyboardScanner } from './lib/keyboardScanner.js';
import { useT, locale, LANGS } from './lib/i18n.js';

/** 2026-11-21 → 21/11 */
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');

export default function App() {
  const { t, lang, setLang } = useT();
  const [tab, setTab] = useState('scan');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [saved, setSaved] = useState([]); // every saved ticket — for counts and duplicate checks
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const hideToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    try {
      const list = await listTickets();
      savedRef.current = list;
      setSaved(list);
      return list;
    } catch {
      return savedRef.current;
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  function who(tk) {
    return [tk?.name, tk?.seat && t('seatN', { seat: tk.seat })].filter(Boolean).join(' · ');
  }

  /** "Keep scanning" mode: save straight away, no review screen. */
  async function autoSave(pass) {
    const tickets = ticketsFromParsed(pass);
    const dupCount = duplicatesOf(tickets, savedRef.current).length;
    scanFeedback(dupCount ? 'warn' : 'ok');
    try {
      for (const tk of tickets) await saveTicket(tk);
      const list = await reload();
      const cur = currentFlight(list);
      const count = cur ? ` · ${t('nScanned', { n: cur.count })}` : '';
      setToast(dupCount ? { text: t('savedDupToast', { who: who(tickets[0]) }), kind: 'warn' } : { text: t('savedToast', { who: who(tickets[0]) }) + count, kind: 'ok' });
    } catch (e) {
      scanFeedback('err');
      setToast({ text: t('saveFailed', { msg: e.message }), kind: 'err' });
    }
  }

  function handleText(text) {
    // Boarding pass barcodes are plain ASCII. Accented letters (â, ơ, đ…) mean a
    // Vietnamese input method changed what a USB scanner typed — even if it still parses.
    if (/[^\x00-\x7F]/.test(text)) {
      scanFeedback('err');
      setParsed(null);
      setError({ key: 'imeChanged', raw: text });
      return;
    }
    let pass;
    try {
      pass = parseBCBP(text);
    } catch (e) {
      scanFeedback('err');
      setParsed(null);
      setError({ key: 'parseFailed', msg: e.message, raw: text });
      return;
    }
    setError(null);
    if (getSetting('keepScanning')) {
      setParsed(null);
      autoSave(pass);
      return;
    }
    const dup = duplicatesOf(ticketsFromParsed(pass), savedRef.current).length > 0;
    scanFeedback(dup ? 'warn' : 'ok');
    setParsed(pass);
  }

  // USB / Bluetooth barcode scanner (keyboard mode) — active on the Scan tab
  useKeyboardScanner(handleText, tab === 'scan');

  function reset() {
    setParsed(null);
    setError(null);
  }

  function handleSaved({ tickets, dupCount }) {
    reset(); // stay on the Scan tab, ready for the next pass
    reload();
    setToast(dupCount ? { text: t('savedDupToast', { who: who(tickets[0]) }), kind: 'warn' } : { text: t('savedToast', { who: who(tickets[0]) }), kind: 'ok' });
  }

  const cur = currentFlight(saved);
  const dups = cur ? findDuplicates(saved) : null;
  const curDups = cur ? saved.filter((tk) => dups.has(tk.id) && flightKey(tk) === cur.key).length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <h1>
            <Plane size={20} strokeWidth={2} aria-hidden="true" /> {t('appTitle')}
          </h1>
          <div className="lang-switch" role="group" aria-label={t('language')}>
            {LANGS.map((l) => (
              <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'scan' ? 'active' : ''} onClick={() => setTab('scan')}>
            {t('tabScan')}
          </button>
          <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
            {t('tabSaved')}
            {saved.length > 0 && <span className="tab-count">{saved.length}</span>}
          </button>
        </nav>
      </header>

      <main>
        {tab === 'scan' && (
          <>
            {cur && (
              <button className="flight-counter" onClick={() => setTab('saved')} title={t('tabSaved')}>
                <Plane size={16} aria-hidden="true" />
                <span className="fc-flight">{cur.flight || '—'}</span>
                <span className="muted">
                  {dm(cur.flightDate)}
                  {cur.from && ` · ${cur.from}→${cur.to}`}
                </span>
                <span className="fc-count">{t('nScanned', { n: cur.count })}</span>
                {curDups > 0 && (
                  <span className="badge warn">
                    <AlertTriangle size={12} aria-hidden="true" /> {t('nDup', { n: curDups })}
                  </span>
                )}
              </button>
            )}
            {!parsed && <Scanner onText={handleText} />}
            {error && (
              <div className="card error">
                <strong>{t(error.key, { msg: error.msg })}</strong>
                <p className="muted">{t('barcodeText')}</p>
                <pre className="raw">{error.raw}</pre>
                <button onClick={reset}>{t('tryAgain')}</button>
              </div>
            )}
            {parsed && <TicketResult key={parsed.raw} parsed={parsed} saved={saved} onSaved={handleSaved} onCancel={reset} />}
          </>
        )}
        {tab === 'saved' && <TicketList onToast={setToast} onChanged={setSaved} />}
      </main>
      <VersionFooter />
      <Toast toast={toast} onDone={hideToast} />
    </div>
  );
}

const REPO_URL = 'https://github.com/TTomCCat/airline-scanner';

function VersionFooter() {
  const { t } = useT();
  const v = __APP_VERSION__; // injected at build time (vite.config.js)
  const built = new Date(v.builtAt).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <footer className="version">
      v{v.version}
      {' · '}
      {v.commit !== 'unknown' ? (
        <a href={`${REPO_URL}/commit/${v.commit}`} target="_blank" rel="noopener noreferrer">
          {v.commit}
        </a>
      ) : (
        t('unknownCommit')
      )}
      {' · '}
      {v.dev ? t('devBuild') : t('builtAt', { date: built })}
    </footer>
  );
}
