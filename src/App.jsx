import { useCallback, useState } from 'react';
import { Plane } from 'lucide-react';
import Scanner from './components/Scanner.jsx';
import TicketResult from './components/TicketResult.jsx';
import TicketList from './components/TicketList.jsx';
import Toast from './components/Toast.jsx';
import { parseBCBP } from './lib/bcbp.js';
import { useKeyboardScanner } from './lib/keyboardScanner.js';
import { useT, locale, LANGS } from './lib/i18n.js';

export default function App() {
  const { t, lang, setLang } = useT();
  const [tab, setTab] = useState('scan');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const hideToast = useCallback(() => setToast(null), []);

  function handleText(text) {
    // Boarding pass barcodes are plain ASCII. Accented letters (â, ơ, đ…) mean a
    // Vietnamese input method changed what a USB scanner typed — even if it still parses.
    if (/[^\x00-\x7F]/.test(text)) {
      setParsed(null);
      setError({ key: 'imeChanged', raw: text });
      return;
    }
    try {
      setParsed(parseBCBP(text));
      setError(null);
    } catch (e) {
      setParsed(null);
      setError({ key: 'parseFailed', msg: e.message, raw: text });
    }
  }

  // USB / Bluetooth barcode scanner (keyboard mode) — active on the Scan tab
  useKeyboardScanner(handleText, tab === 'scan');

  function reset() {
    setParsed(null);
    setError(null);
  }

  function handleSaved({ tickets, existed }) {
    reset(); // stay on the Scan tab, ready for the next pass
    const tk = tickets[0];
    const who = [tk?.name, tk?.seat && t('seatN', { seat: tk.seat })].filter(Boolean).join(' · ');
    setToast({ text: t(existed ? 'savedAgainToast' : 'savedToast', { who }), kind: 'ok' });
  }

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
          </button>
        </nav>
      </header>

      <main>
        {tab === 'scan' && (
          <>
            {!parsed && <Scanner onText={handleText} />}
            {error && (
              <div className="card error">
                <strong>{t(error.key, { msg: error.msg })}</strong>
                <p className="muted">{t('barcodeText')}</p>
                <pre className="raw">{error.raw}</pre>
                <button onClick={reset}>{t('tryAgain')}</button>
              </div>
            )}
            {parsed && <TicketResult key={parsed.raw} parsed={parsed} onSaved={handleSaved} onCancel={reset} />}
          </>
        )}
        {tab === 'saved' && <TicketList onToast={setToast} />}
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
